import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SharpThumbnailAdapter }  from './sharp-thumbnail.adapter';
import type { SharpFactory }      from './sharp-thumbnail.adapter';

// ── Mock sharp pipeline ───────────────────────────────────────────────────────

const mockToBuffer = vi.fn();
const mockJpeg     = vi.fn();
const mockResize   = vi.fn();
const mockSharpFn  = vi.fn() as unknown as SharpFactory;

function resetSharpChain(buffer = Buffer.from('jpeg-output')) {
  mockToBuffer.mockResolvedValue(buffer);
  mockJpeg.mockReturnValue({ toBuffer: mockToBuffer });
  mockResize.mockReturnValue({ jpeg: mockJpeg });
  (mockSharpFn as ReturnType<typeof vi.fn>).mockReturnValue({ resize: mockResize });
}

// ── Mock S3 ───────────────────────────────────────────────────────────────────

const mockS3 = {
  putObject:              vi.fn().mockResolvedValue(undefined),
  getObject:              vi.fn(),
  deleteObject:           vi.fn(),
  generatePresignedGetUrl: vi.fn(),
  generatePresignedPutUrl: vi.fn(),
};

// ── Fixtures ──────────────────────────────────────────────────────────────────

const DOC_ID     = 'doc-uuid-1';
const IMG_BUFFER = Buffer.from('fake-jpeg-data');
const PDF_BUFFER = Buffer.from('fake-pdf-data');

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('SharpThumbnailAdapter', () => {
  let adapter: SharpThumbnailAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    resetSharpChain();
    adapter = new SharpThumbnailAdapter(mockS3 as never, mockSharpFn);
  });

  // ── Succès ────────────────────────────────────────────────────────────────

  describe('generate — succès', () => {
    it('should return the S3 key on success for a JPEG image', async () => {
      const result = await adapter.generate(DOC_ID, IMG_BUFFER, 'image/jpeg');

      expect(result).toBe(`thumbnails/${DOC_ID}.jpg`);
    });

    it('should return the S3 key on success for a PNG image', async () => {
      const result = await adapter.generate(DOC_ID, IMG_BUFFER, 'image/png');

      expect(result).toBe(`thumbnails/${DOC_ID}.jpg`);
    });

    it('should resize to 200x200 with fit:inside and withoutEnlargement', async () => {
      await adapter.generate(DOC_ID, IMG_BUFFER, 'image/jpeg');

      expect(mockResize).toHaveBeenCalledWith(200, 200, {
        fit:                'inside',
        withoutEnlargement: true,
      });
    });

    it('should convert to JPEG with quality 80', async () => {
      await adapter.generate(DOC_ID, IMG_BUFFER, 'image/jpeg');

      expect(mockJpeg).toHaveBeenCalledWith({ quality: 80 });
    });

    it('should upload the generated JPEG buffer to S3', async () => {
      const thumbBuffer = Buffer.from('generated-jpeg');
      resetSharpChain(thumbBuffer);

      await adapter.generate(DOC_ID, IMG_BUFFER, 'image/jpeg');

      expect(mockS3.putObject).toHaveBeenCalledWith(
        `thumbnails/${DOC_ID}.jpg`,
        thumbBuffer,
        'image/jpeg',
      );
    });

    it('should pass pages:1 option to sharp for PDF files', async () => {
      await adapter.generate(DOC_ID, PDF_BUFFER, 'application/pdf');

      expect(mockSharpFn).toHaveBeenCalledWith(PDF_BUFFER, { pages: 1 });
    });

    it('should pass no extra options to sharp for images', async () => {
      await adapter.generate(DOC_ID, IMG_BUFFER, 'image/jpeg');

      expect(mockSharpFn).toHaveBeenCalledWith(IMG_BUFFER, {});
    });
  });

  // ── Gestion des erreurs (non-bloquant) ────────────────────────────────────

  describe('generate — erreurs non-bloquantes', () => {
    it('should return null when sharp throws (ex: format non supporté)', async () => {
      (mockSharpFn as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error('unsupported image format');
      });

      const result = await adapter.generate(DOC_ID, IMG_BUFFER, 'image/jpeg');

      expect(result).toBeNull();
    });

    it('should return null when toBuffer rejects', async () => {
      mockToBuffer.mockRejectedValue(new Error('sharp processing failed'));

      const result = await adapter.generate(DOC_ID, IMG_BUFFER, 'image/jpeg');

      expect(result).toBeNull();
    });

    it('should return null when S3 upload fails', async () => {
      mockS3.putObject.mockRejectedValue(new Error('S3 timeout'));

      const result = await adapter.generate(DOC_ID, IMG_BUFFER, 'image/jpeg');

      expect(result).toBeNull();
    });

    it('should return null for PDF when sharp has no PDF support', async () => {
      (mockSharpFn as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error('Input file is missing or of an unsupported image format');
      });

      const result = await adapter.generate(DOC_ID, PDF_BUFFER, 'application/pdf');

      expect(result).toBeNull();
    });

    it('should NOT propagate any exception to the caller', async () => {
      (mockSharpFn as ReturnType<typeof vi.fn>).mockImplementation(() => {
        throw new Error('catastrophic failure');
      });

      await expect(
        adapter.generate(DOC_ID, IMG_BUFFER, 'image/jpeg'),
      ).resolves.toBeNull();
    });
  });
});
