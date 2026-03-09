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
    type:     'INVOICE',
    keywords: [/facture/i, /invoice/i, /montant\s+(?:d[uû]|total|ttc|ht)/i, /\bTVA\b/, /\bHT\b/, /\bTTC\b/, /bon\s+de\s+commande/i],
  },
  {
    type:     'CONTRACT',
    keywords: [/contrat/i, /convention/i, /accord/i, /signataire/i, /\bclause/i, /parties\s+(?:signataires|contractantes)/i],
  },
  {
    type:     'RECEIPT',
    keywords: [/re[çc]u/i, /ticket\s+de\s+caisse/i, /paiement\s+re[çc]u/i, /merci\s+(?:de\s+)?votre\s+(?:achat|visite)/i],
  },
  {
    type:     'ID_DOCUMENT',
    keywords: [/carte\s+(?:nationale\s+)?d.identit[eé]/i, /passeport/i, /permis\s+de\s+conduire/i, /\bCNI\b/, /titre\s+de\s+s[eé]jour/i],
  },
  {
    type:     'BANK_STATEMENT',
    keywords: [/relev[eé]\s+de\s+compte/i, /\bsolde\b/i, /virement/i, /\bd[eé]bit\b/i, /\bcr[eé]dit\b/i, /\bIBAN\b/],
  },
];

// Plage de confiance : une seule correspondance → MIN, toutes les correspondances → MAX
const CONFIDENCE_MIN = 0.45;
const CONFIDENCE_MAX = 0.95;

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

    if (best.matchCount === 0) {
      return { detectedType: 'OTHER', confidence: 1.0 };
    }

    const confidence = CONFIDENCE_MIN + best.ratio * (CONFIDENCE_MAX - CONFIDENCE_MIN);

    return { detectedType: best.type, confidence };
  }
}
