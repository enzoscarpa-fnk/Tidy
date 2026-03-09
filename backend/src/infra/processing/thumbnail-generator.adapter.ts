import sharp from 'sharp';
import { fromBuffer } from 'pdf2pic';
import type { IThumbnailGeneratorService } from '../../modules/document/domain/ports/thumbnail-generator.service.port';

const THUMBNAIL_SIZE = 200;
const PDF_RENDER_DPI = 150;

export class ThumbnailGeneratorAdapter implements IThumbnailGeneratorService {
  async generateThumbnail(buffer: Buffer, mimeType: string): Promise<Buffer | null> {
    try {
      const sourceBuffer = mimeType === 'application/pdf'
        ? await this.extractPdfFirstPage(buffer)
        : buffer;

      if (!sourceBuffer) return null;

      return await sharp(sourceBuffer)
        .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, { fit: 'inside', withoutEnlargement: true })
        .jpeg({ quality: 80 })
        .toBuffer();
    } catch {
      // Thumbnail est optionnel dans le pipeline — ne jamais bloquer l'enrichissement
      return null;
    }
  }

  private async extractPdfFirstPage(buffer: Buffer): Promise<Buffer | null> {
    try {
      const convert = fromBuffer(buffer, {
        density: PDF_RENDER_DPI,
        format:  'png',
        width:   800,
        height:  1000,
      });

      const page = await convert(1, { responseType: 'buffer' });
      return page.buffer ?? null;
    } catch {
      return null;
    }
  }
}
