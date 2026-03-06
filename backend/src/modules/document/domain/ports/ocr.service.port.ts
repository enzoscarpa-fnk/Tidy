export interface OcrResult {
  text:       string;
  confidence: number;
  pageCount:  number;
}

export interface IOcrService {
  processDocument(base64: string, mimeType: string): Promise<OcrResult>;
}
