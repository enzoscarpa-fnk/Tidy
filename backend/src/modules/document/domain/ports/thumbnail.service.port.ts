export interface IThumbnailService {
  // Retourne le thumbnailRef (chemin relatif ou URL) ou null si la génération échoue
  generate(documentId: string, buffer: Buffer, mimeType: string): Promise<string | null>;
}
