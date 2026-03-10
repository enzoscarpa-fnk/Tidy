export interface IThumbnailGeneratorService {
  // Retourne null si la génération échoue (non bloquant pour le pipeline)
  generateThumbnail(buffer: Buffer, mimeType: string): Promise<Buffer | null>;
}
