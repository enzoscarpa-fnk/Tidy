import type { DetectedType } from '../document-intelligence.value-object';

export interface ClassificationResult {
  detectedType: DetectedType;
  confidence:   number;
}

export interface IDocumentClassifierService {
  classify(text: string): ClassificationResult;
}
