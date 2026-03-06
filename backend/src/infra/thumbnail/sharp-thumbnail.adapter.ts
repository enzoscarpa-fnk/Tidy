import type { IS3Service }         from '../../modules/document/domain/ports/s3.service.port';
import type { IThumbnailService }  from '../../modules/document/domain/ports/thumbnail.service.port';

// ── Interface minimale pour testabilité sans dépendre de `typeof sharp` ───────

export interface SharpPipeline {
  resize(
    width:   number,
    height:  number,
    options: { fit: string; withoutEnlargement: boolean },
  ): this;
  jpeg(options: { quality: number }): this;
  toBuffer(): Promise<Buffer>;
}

export type SharpFactory = (input: Buffer, options?: { pages?: number }) => SharpPipeline;

// ── Constantes ────────────────────────────────────────────────────────────────

const THUMBNAIL_SIZE = 200;
const thumbnailKey   = (documentId: string) => `thumbnails/${documentId}.jpg`;

// ── Adapter ───────────────────────────────────────────────────────────────────

export class SharpThumbnailAdapter implements IThumbnailService {
  constructor(
    private readonly s3Service: IS3Service,
    private readonly sharpFn:   SharpFactory = defaultSharpFactory(),
  ) {}

  async generate(
    documentId: string,
    buffer:     Buffer,
    mimeType:   string,
  ): Promise<string | null> {
    try {
      // Pour les PDF : sharp avec pages:1 (premier page uniquement)
      // Fonctionne si libvips est compilé avec support PDF (poppler/mupdf)
      const options = mimeType === 'application/pdf' ? { pages: 1 } : {};

      const jpegBuffer = await this.sharpFn(buffer, options)
        .resize(THUMBNAIL_SIZE, THUMBNAIL_SIZE, {
          fit:                'inside',
          withoutEnlargement: true,
        })
        .jpeg({ quality: 80 })
        .toBuffer();

      const s3Key = thumbnailKey(documentId);
      await this.s3Service.putObject(s3Key, jpegBuffer, 'image/jpeg');

      return s3Key;
    } catch {
      // La génération de thumbnail est non-bloquante : un échec ne doit
      // jamais faire échouer le pipeline (TDD §2.6)
      return null;
    }
  }
}

// ── Factory par défaut (lazy require pour testabilité) ────────────────────────

function defaultSharpFactory(): SharpFactory {
  return (input: Buffer, options?: { pages?: number }): SharpPipeline => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sharp = require('sharp') as (
      input: Buffer,
      options?: { pages?: number },
    ) => SharpPipeline;
    return sharp(input, options);
  };
}
