import { PDFParse } from 'pdf-parse';
import type {
  ITextExtractorService,
  TextExtractionResult,
} from '../../modules/document/domain/ports/text-extractor.service.port';

const MIN_NATIVE_TEXT_LENGTH = 20;

export class TextExtractorAdapter implements ITextExtractorService {
  async extractFromPdf(buffer: Buffer): Promise<TextExtractionResult> {
    try {
      const parser = new PDFParse(buffer);
      const data   = await parser.getText();
      const text   = data?.text?.trim() ?? '';

      if (text.length >= MIN_NATIVE_TEXT_LENGTH) {
        return { text, method: 'NATIVE_PDF' };
      }

      return { text: null, method: 'OCR_NEEDED' };
    } catch {
      return { text: null, method: 'OCR_NEEDED' };
    }
  }
}
