import type { IEntityExtractorService } from '../../modules/document/domain/ports/entity-extractor.service.port';
import type { ExtractedEntity } from '../../modules/document/domain/document-intelligence.value-object';

interface ExtractionPattern {
  entityType: string;
  pattern:    RegExp;
  confidence: number;
}

// Patterns ordonnés du plus spécifique au moins spécifique (SIRET avant SIREN)
const PATTERNS: ExtractionPattern[] = [
  {
    entityType: 'AMOUNT',
    // 1 200,00 € | 1.200,00€ | 500 € | 1200€
    pattern:    /\b\d{1,3}(?:[. ]\d{3})*(?:[,.]\d{2})?\s*€/g,
    confidence: 0.95,
  },
  {
    entityType: 'DATE',
    // DD/MM/YYYY | DD-MM-YYYY | DD.MM.YYYY
    pattern:    /\b(?:0?[1-9]|[12]\d|3[01])[\/\-.](0?[1-9]|1[0-2])[\/\-.](?:19|20)\d{2}\b/g,
    confidence: 0.9,
  },
  {
    entityType: 'DATE',
    // YYYY-MM-DD (ISO 8601)
    pattern:    /\b(?:19|20)\d{2}-(?:0[1-9]|1[0-2])-(?:0[1-9]|[12]\d|3[01])\b/g,
    confidence: 0.9,
  },
  {
    entityType: 'IBAN',
    // FR76 3000 6000 0112 3456 7890 189 (format avec ou sans espaces)
    pattern:    /\b[A-Z]{2}\d{2}(?:\s?[A-Z0-9]{4}){4,7}\b/g,
    confidence: 0.98,
  },
  {
    entityType: 'SIRET',
    // 14 chiffres (avec espaces optionnels) — plus spécifique que SIREN
    pattern:    /\b\d{3}\s?\d{3}\s?\d{3}\s?\d{5}\b/g,
    confidence: 0.9,
  },
];

export class EntityExtractorAdapter implements IEntityExtractorService {
  extractEntities(text: string): ExtractedEntity[] {
    if (!text || text.trim().length === 0) return [];

    const entities: ExtractedEntity[] = [];

    for (const { entityType, pattern, confidence } of PATTERNS) {
      pattern.lastIndex = 0; // reset pour les patterns /g réutilisés

      for (const match of text.matchAll(pattern)) {
        entities.push({
          entityType,
          value: match[0].trim(),
          confidence,
        });
      }
    }

    return entities;
  }
}
