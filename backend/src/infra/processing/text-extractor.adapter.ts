import { PDFParse } from 'pdf-parse';
import type {
  ITextExtractorService,
  TextExtractionResult,
} from '../../modules/document/domain/ports/text-extractor.service.port';

const MIN_NATIVE_TEXT_LENGTH = 20;

export class TextExtractorAdapter implements ITextExtractorService {
  async extractFromPdf(buffer: Buffer): Promise<TextExtractionResult> {
    try {
      const uint8 = new Uint8Array(buffer.buffer, buffer.byteOffset, buffer.byteLength);
      const parser = new PDFParse(uint8 as unknown as Buffer);
      const data   = await parser.getText();
      const text   = data?.text?.trim() ?? '';

      console.log('[TextExtractor] text.length =', text.length);

      if (text.length >= MIN_NATIVE_TEXT_LENGTH) {
        return { text, method: 'NATIVE_PDF' };
      }

      return { text: null, method: 'OCR_NEEDED' };
    } catch (err) {
      console.error('[TextExtractor] extractFromPdf failed:', err);
      return { text: null, method: 'OCR_NEEDED' };
    }
  }
}
