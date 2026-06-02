import type {
  IDocumentClassifierService,
  ClassificationResult,
} from '../../modules/document/domain/ports/document-classifier.service.port';
import type { DetectedType } from '../../modules/document/domain/document-intelligence.value-object';

interface ClassificationRule {
  type:     DetectedType;
  keywords: RegExp[];
}

const RULES: ClassificationRule[] = [
  {
    type: 'INVOICE',
    // Signaux forts et spécifiques aux factures
    keywords: [
      /\bfacture\b/i,
      /\binvoice\b/i,
      /num[eé]ro\s+(?:de\s+)?facture/i,
      /montant\s+(?:d[uû]|total|ttc|ht)/i,
      /\bTVA\b/,
      /\bHT\b/,
      /\bTTC\b/,
      /\b[eé]ch[eé]ance\b/i,
      /\bfournisseur\b/i,
    ],
  },
  {
    type: 'CONTRACT',
    keywords: [
      /\bcontrat\b/i,
      /\bconvention\b/i,
      /\baccord\b/i,
      /\bsignataire/i,
      /\bclause\b/i,
      /parties\s+(?:signataires|contractantes)/i,
      /\barticle\s+\d+/i,
      /\bobligation[s]?\b/i,
    ],
  },
  {
    type: 'RECEIPT',
    keywords: [
      /re[çc]u\b/i,
      /ticket\s+de\s+caisse/i,
      /paiement\s+re[çc]u/i,
      /merci\s+(?:de\s+)?votre\s+(?:achat|visite)/i,
      /\btotal\s+pay[eé]\b/i,
      /\bmonnaie\s+rendue\b/i,
    ],
  },
  {
    type: 'ID_DOCUMENT',
    keywords: [
      /carte\s+(?:nationale\s+)?d.identit[eé]/i,
      /\bpasseport\b/i,
      /permis\s+de\s+conduire/i,
      /\bCNI\b/,
      /titre\s+de\s+s[eé]jour/i,
      /\bnat[io]+nalit[eé]\b/i,
    ],
  },
  {
    type: 'BANK_STATEMENT',
    keywords: [
      /relev[eé]\s+de\s+compte/i,
      /solde\s+(?:au|du|cr[eé]diteur|d[eé]biteur)/i,
      /\bvirement\s+(?:re[çc]u|[eé]mis|bancaire)/i,
      /\bRIB\b/,
      /\bIBAN\b/,
      /op[eé]rations\s+(?:du|au)\s+\d/i,
    ],
  },
];

// Plage de confiance : une seule correspondance → MIN, toutes → MAX
const CONFIDENCE_MIN  = 0.45;
const CONFIDENCE_MAX  = 0.95;
// Ratio minimum pour accepter une classification (évite les faux positifs sur 1 match faible)
const MIN_RATIO_THRESHOLD = 0.25;

export class DocumentClassifierAdapter implements IDocumentClassifierService {
  classify(text: string): ClassificationResult {
    if (!text || text.trim().length === 0) {
      return { detectedType: 'OTHER', confidence: 1.0 };
    }

    const scores = RULES.map((rule) => {
      const matchCount = rule.keywords.filter((kw) => kw.test(text)).length;
      return { type: rule.type, matchCount, ratio: matchCount / rule.keywords.length };
    });

    const best = scores.reduce((a, b) => (a.ratio > b.ratio ? a : b));

    if (best.matchCount === 0 || best.ratio < MIN_RATIO_THRESHOLD) {
      return { detectedType: 'OTHER', confidence: 1.0 };
    }

    const confidence = CONFIDENCE_MIN + best.ratio * (CONFIDENCE_MAX - CONFIDENCE_MIN);
    return { detectedType: best.type, confidence };
  }
}
