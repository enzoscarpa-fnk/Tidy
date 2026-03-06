export type DetectedType =
  | 'INVOICE'
  | 'CONTRACT'
  | 'RECEIPT'
  | 'ID_DOCUMENT'
  | 'BANK_STATEMENT'
  | 'OTHER';

export interface ExtractedEntity {
  entityType: string;
  value:      string;
  confidence: number;
}

export interface IntelligenceJson {
  extractedEntities:    ExtractedEntity[];
  globalConfidenceScore: number;
  suggestedTags:        string[];
  [key: string]: unknown;
}

export class DocumentIntelligence {
  constructor(
    public readonly detectedType:           DetectedType,
    public readonly extractedEntities:      ReadonlyArray<ExtractedEntity>,
    public readonly globalConfidenceScore:  number,
    public readonly suggestedTags:          ReadonlyArray<string>,
  ) {}

  toJSON(): IntelligenceJson {
    return {
      extractedEntities:    this.extractedEntities.map((e) => ({ ...e })),
      globalConfidenceScore: this.globalConfidenceScore,
      suggestedTags:        [...this.suggestedTags],
    };
  }
}
