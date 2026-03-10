// Résultat quand le PDF contient du texte natif extractible
export interface TextExtractionSuccess {
  text:   string;
  method: 'NATIVE_PDF';
}

// Résultat quand le PDF est une image ou vide → OCR requis
export interface TextExtractionOcrNeeded {
  text:   null;
  method: 'OCR_NEEDED';
}

export type TextExtractionResult = TextExtractionSuccess | TextExtractionOcrNeeded;

export interface ITextExtractorService {
  extractFromPdf(buffer: Buffer): Promise<TextExtractionResult>;
}
