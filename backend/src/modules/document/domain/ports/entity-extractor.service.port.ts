import type { ExtractedEntity } from '../document-intelligence.value-object';

export interface IEntityExtractorService {
  extractEntities(text: string): ExtractedEntity[];
}
