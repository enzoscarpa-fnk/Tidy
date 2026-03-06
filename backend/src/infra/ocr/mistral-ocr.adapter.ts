import { OcrServiceUnavailableError } from '../../shared/errors/domain-errors';
import type { IOcrService, OcrResult } from '../../modules/document/domain/ports/ocr.service.port';

// ── Types réponse Mistral ─────────────────────────────────────────────────────

interface MistralPage {
  index:       number;
  markdown:    string;
  confidence?: number; // score 0–1 par page, absent si non disponible
}

interface MistralOcrResponse {
  pages:      MistralPage[];
  model:      string;
  usage_info: { pages_processed: number; doc_size_bytes?: number };
}

// ── Constantes ────────────────────────────────────────────────────────────────

const MISTRAL_OCR_URL  = 'https://api.mistral.ai/v1/ocr';
const OCR_TIMEOUT_MS   = 15_000;
const MAX_ATTEMPTS     = 3;
// Statuts HTTP non-retryables : erreur côté client, pas transitoire
const NON_RETRYABLE_STATUS = new Set([400, 401, 403, 404]);

// ── Helpers ───────────────────────────────────────────────────────────────────

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Backoff exponentiel : attempt 1 → 2 s, attempt 2 → 8 s (cf. TDD §6.3)
function backoffMs(attempt: number): number {
  return Math.pow(4, attempt) * 500;
}

// Corps du champ `document` selon le mime type
function buildMistralDocument(base64: string, mimeType: string) {
  if (mimeType === 'application/pdf') {
    return {
      type:         'document_url',
      document_url: `application/pdf;base64,${base64}`,
    };
  }
  // image/jpeg ou image/png
  return {
    type:      'image_url',
    image_url: `${mimeType};base64,${base64}`,
  };
}

// Moyenne des scores de confiance par page ; fallback 0.9 si non fourni
function computeConfidence(pages: MistralPage[]): number {
  if (pages.length === 0) return 0;
  const sum = pages.reduce((acc, p) => acc + (p.confidence ?? 0.9), 0);
  return sum / pages.length;
}

// Sentinel interne pour distinguer erreurs non-retryables dans le retry loop
class NonRetryableError extends Error {
  constructor(public readonly original: OcrServiceUnavailableError) {
    super(original.message);
  }
}

// ── Adapter ───────────────────────────────────────────────────────────────────

export class MistralOcrAdapter implements IOcrService {
  constructor(private readonly apiKey: string) {}

  // ── Factory ──────────────────────────────────────────────────────────────

  static fromEnv(): MistralOcrAdapter {
    const key = process.env['MISTRAL_API_KEY'];
    if (!key) {
      throw new Error(
        'MistralOcrAdapter: variable d\'environnement MISTRAL_API_KEY manquante.',
      );
    }
    return new MistralOcrAdapter(key);
  }

  // ── Méthode publique (avec retry + backoff exponentiel) ───────────────────

  async processDocument(base64: string, mimeType: string): Promise<OcrResult> {
    let lastError: Error = new OcrServiceUnavailableError();

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        return await this.callOnce(base64, mimeType);
      } catch (err) {
        if (err instanceof NonRetryableError) {
          throw err.original; // 400/401/403 → on ne retente pas
        }
        lastError = err as Error;
        if (attempt < MAX_ATTEMPTS) {
          await sleep(backoffMs(attempt));
        }
      }
    }

    throw lastError;
  }

  // ── Appel HTTP unique (timeout + parsing) ─────────────────────────────────

  private async callOnce(base64: string, mimeType: string): Promise<OcrResult> {
    const controller = new AbortController();
    const timeoutId  = setTimeout(() => controller.abort(), OCR_TIMEOUT_MS);

    try {
      let response: Response;
      try {
        response = await fetch(MISTRAL_OCR_URL, {
          method:  'POST',
          headers: {
            'Content-Type':  'application/json',
            'Authorization': `Bearer ${this.apiKey}`,
          },
          body:   JSON.stringify({
            model:    'mistral-ocr-latest',
            document: buildMistralDocument(base64, mimeType),
          }),
          signal: controller.signal,
        });
      } catch (fetchErr) {
        const isTimeout = (fetchErr as Error).name === 'AbortError';
        throw new OcrServiceUnavailableError(
          isTimeout
            ? 'Mistral OCR : timeout dépassé (15 s).'
            : 'Mistral OCR : erreur réseau.',
        );
      }

      if (!response.ok) {
        const err = new OcrServiceUnavailableError(
          `Mistral OCR : statut HTTP ${response.status}.`,
        );
        if (NON_RETRYABLE_STATUS.has(response.status)) {
          throw new NonRetryableError(err);
        }
        throw err;
      }

      const data = (await response.json()) as MistralOcrResponse;

      return {
        text:       data.pages.map((p) => p.markdown).join('\n\n').trim(),
        confidence: computeConfidence(data.pages),
        pageCount:  data.pages.length,
      };
    } finally {
      clearTimeout(timeoutId);
    }
  }
}
