import type {
  IClassificationService,
  ClassificationResult,
} from '../../modules/document/domain/ports/classification.service.port';
import type { DetectedType, ExtractedEntity } from '../../modules/document/domain/document-intelligence.value-object';

// ── Types réponse Mistral Chat ─────────────────────────────────────────────────

interface MistralChatResponse {
  choices: Array<{
    message:       { role: string; content: string };
    finish_reason: string;
  }>;
}

interface RawClassification {
  detectedType?:          unknown;
  extractedEntities?:     unknown;
  globalConfidenceScore?: unknown;
  suggestedTags?:         unknown;
}

// ── Constantes ────────────────────────────────────────────────────────────────

const MISTRAL_CHAT_URL        = 'https://api.mistral.ai/v1/chat/completions';
const CLASSIFICATION_MODEL    = 'mistral-small-latest';
const TIMEOUT_MS              = 30_000;
const MAX_ATTEMPTS            = 3;
const MAX_TEXT_LENGTH         = 4_000; // ~1000 tokens, évite les limites de rate
const NON_RETRYABLE_STATUS    = new Set([400, 401, 403, 404]);

const VALID_DETECTED_TYPES = new Set<string>([
  'INVOICE', 'CONTRACT', 'RECEIPT', 'ID_DOCUMENT', 'BANK_STATEMENT', 'OTHER',
]);

// ── Prompt système ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Tu es un assistant expert en classification de documents administratifs et financiers.

Analyse le texte fourni et retourne UNIQUEMENT un objet JSON valide (sans markdown, sans backticks) avec cette structure exacte :
{
  "detectedType": "INVOICE|CONTRACT|RECEIPT|ID_DOCUMENT|BANK_STATEMENT|OTHER",
  "extractedEntities": [
    {"entityType": "AMOUNT|DATE|VENDOR|PERSON|IBAN|INVOICE_NUMBER|CONTRACT_NUMBER|TAX_NUMBER", "value": "string", "confidence": 0.95}
  ],
  "globalConfidenceScore": 0.9,
  "suggestedTags": ["tag-un", "tag-deux"]
}

Règles strictes :
- detectedType : choisir parmi les valeurs autorisées uniquement
- extractedEntities : uniquement les entités présentes avec certitude, 10 max
- globalConfidenceScore : float entre 0.0 et 1.0
- suggestedTags : 3 à 5 tags en minuscules, tirets autorisés, pas d'espaces
- Si texte vide ou insuffisant : detectedType OTHER, globalConfidenceScore 0.3, listes vides`;

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function backoffMs(attempt: number): number {
  return Math.pow(4, attempt) * 500; // 2s, 8s
}

class NonRetryableError extends Error {
  constructor(public readonly original: Error) {
    super(original.message);
  }
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export class MistralClassificationAdapter implements IClassificationService {
  constructor(private readonly apiKey: string) {}

  static fromEnv(): MistralClassificationAdapter {
    const key = process.env['MISTRAL_API_KEY'];
    if (!key) {
      throw new Error(
        'MistralClassificationAdapter: variable d\'environnement MISTRAL_API_KEY manquante.',
      );
    }
    return new MistralClassificationAdapter(key);
  }

  // ── Méthode publique (avec retry + backoff) ───────────────────────────────

  async classify(text: string, mimeType: string): Promise<ClassificationResult> {
    const truncated = text.slice(0, MAX_TEXT_LENGTH);
    let lastError: Error = new Error('Classification échouée');

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        return await this.callOnce(truncated, mimeType);
      } catch (err) {
        if (err instanceof NonRetryableError) throw err.original;
        lastError = err as Error;
        if (attempt < MAX_ATTEMPTS) await sleep(backoffMs(attempt));
      }
    }

    throw lastError;
  }

  // ── Appel HTTP unique ─────────────────────────────────────────────────────

  private async callOnce(text: string, _mimeType: string): Promise<ClassificationResult> {
    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), TIMEOUT_MS);

    try {
      let response: Response;
      try {
        response = await fetch(MISTRAL_CHAT_URL, {
          method:  'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
          },
          body: JSON.stringify({
            model:           CLASSIFICATION_MODEL,
            messages: [
              { role: 'system', content: SYSTEM_PROMPT },
              { role: 'user',   content: text || 'Document sans texte extractible.' },
            ],
            response_format: { type: 'json_object' },
            temperature:     0.1,
          }),
          signal: controller.signal,
        });
      } catch (fetchErr) {
        const isTimeout = (fetchErr as Error).name === 'AbortError';
        throw new Error(
          isTimeout
            ? 'Classification Mistral : timeout dépassé (30 s).'
            : 'Classification Mistral : erreur réseau.',
        );
      }

      if (!response.ok) {
        const err = new Error(`Classification Mistral : statut HTTP ${response.status}.`);
        if (NON_RETRYABLE_STATUS.has(response.status)) throw new NonRetryableError(err);
        throw err;
      }

      const data    = (await response.json()) as MistralChatResponse;
      const content = data.choices?.[0]?.message?.content;

      if (!content) {
        throw new NonRetryableError(
          new Error('Classification Mistral : contenu de réponse vide.'),
        );
      }

      return this.parseResult(content);
    } finally {
      clearTimeout(timeoutId);
    }
  }

  // ── Parsing et validation du JSON retourné ────────────────────────────────

  private parseResult(content: string): ClassificationResult {
    let raw: RawClassification;

    try {
      raw = JSON.parse(content) as RawClassification;
    } catch {
      throw new NonRetryableError(
        new Error(`Classification Mistral : JSON invalide reçu — "${content.slice(0, 100)}"`),
      );
    }

    const detectedType: DetectedType = VALID_DETECTED_TYPES.has(String(raw.detectedType))
      ? (raw.detectedType as DetectedType)
      : 'OTHER';

    const extractedEntities: ExtractedEntity[] = Array.isArray(raw.extractedEntities)
      ? (raw.extractedEntities as unknown[])
        .filter((e): e is Record<string, unknown> => typeof e === 'object' && e !== null)
        .map((e) => ({
          entityType: String(e['entityType'] ?? 'UNKNOWN'),
          value:      String(e['value']      ?? ''),
          confidence: typeof e['confidence'] === 'number'
            ? Math.max(0, Math.min(1, e['confidence']))
            : 0.5,
        }))
        .slice(0, 10)
      : [];

    const globalConfidenceScore =
      typeof raw.globalConfidenceScore === 'number'
        ? Math.max(0, Math.min(1, raw.globalConfidenceScore))
        : 0.5;

    const suggestedTags: string[] = Array.isArray(raw.suggestedTags)
      ? (raw.suggestedTags as unknown[])
        .filter((t): t is string => typeof t === 'string')
        .slice(0, 5)
      : [];

    return { detectedType, extractedEntities, globalConfidenceScore, suggestedTags };
  }
}
