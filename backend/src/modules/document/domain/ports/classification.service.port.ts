import type { DetectedType, ExtractedEntity } from '../document-intelligence.value-object';

export interface ClassificationResult {
  detectedType:          DetectedType;
  extractedEntities:     ExtractedEntity[];
  globalConfidenceScore: number;
  suggestedTags:         string[];
}

export interface IClassificationService {
  classify(text: string, mimeType: string): Promise<ClassificationResult>;
}
