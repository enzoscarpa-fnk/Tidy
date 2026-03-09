import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ThumbnailGeneratorAdapter } from './thumbnail-generator.adapter';

// ── Mocks (vi.hoisted garantit l'initialisation avant le hoist de vi.mock) ────

const { mockToBuffer, mockJpeg, mockResize, mockSharpInst, mockConvertPage, mockFromBuffer } =
  vi.hoisted(() => {
    const mockToBuffer  = vi.fn();
    const mockJpeg      = vi.fn();
    const mockResize    = vi.fn();
    const mockSharpInst = { resize: mockResize, jpeg: mockJpeg, toBuffer: mockToBuffer };
    const mockConvertPage = vi.fn();
    const mockFromBuffer  = vi.fn(() => mockConvertPage);
    return { mockToBuffer, mockJpeg, mockResize, mockSharpInst, mockConvertPage, mockFromBuffer };
  });

vi.mock('sharp', () => ({
  default: vi.fn(() => mockSharpInst),
}));

vi.mock('pdf2pic', () => ({ fromBuffer: mockFromBuffer }));

import sharp from 'sharp';
import { fromBuffer } from 'pdf2pic';
const mockSharp = vi.mocked(sharp);

// ── Fixtures ──────────────────────────────────────────────────────────────────

const FAKE_IMAGE_BUFFER     = Buffer.from('fake-jpeg-bytes');
const FAKE_PDF_BUFFER       = Buffer.from('fake-pdf-bytes');
const MOCK_THUMBNAIL_BUFFER = Buffer.from('mock-thumbnail');
const MOCK_PAGE_BUFFER      = Buffer.from('mock-pdf-page-png');

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('ThumbnailGeneratorAdapter', () => {
  let adapter: ThumbnailGeneratorAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new ThumbnailGeneratorAdapter();

    // Chaîne sharp par défaut : retourne un buffer
    mockResize.mockReturnValue(mockSharpInst);
    mockJpeg.mockReturnValue(mockSharpInst);
    mockToBuffer.mockResolvedValue(MOCK_THUMBNAIL_BUFFER);
  });

  // ── Images ────────────────────────────────────────────────────────────────

  describe('generateThumbnail — image', () => {
    it('should return a JPEG buffer for a JPEG image', async () => {
      const result = await adapter.generateThumbnail(FAKE_IMAGE_BUFFER, 'image/jpeg');

      expect(result).toBe(MOCK_THUMBNAIL_BUFFER);
      expect(mockSharp).toHaveBeenCalledWith(FAKE_IMAGE_BUFFER);
    });

    it('should resize to 200x200 with fit inside', async () => {
      await adapter.generateThumbnail(FAKE_IMAGE_BUFFER, 'image/jpeg');

      expect(mockResize).toHaveBeenCalledWith(200, 200, {
        fit: 'inside',
        withoutEnlargement: true,
      });
    });

    it('should output JPEG with quality 80', async () => {
      await adapter.generateThumbnail(FAKE_IMAGE_BUFFER, 'image/jpeg');
      expect(mockJpeg).toHaveBeenCalledWith({ quality: 80 });
    });

    it('should handle PNG input', async () => {
      const result = await adapter.generateThumbnail(FAKE_IMAGE_BUFFER, 'image/png');
      expect(result).toBe(MOCK_THUMBNAIL_BUFFER);
    });
  });

  // ── PDF ───────────────────────────────────────────────────────────────────

  describe('generateThumbnail — PDF', () => {
    it('should extract first page and generate thumbnail for PDF', async () => {
      mockConvertPage.mockResolvedValueOnce({ buffer: MOCK_PAGE_BUFFER });

      const result = await adapter.generateThumbnail(FAKE_PDF_BUFFER, 'application/pdf');

      expect(mockFromBuffer).toHaveBeenCalledWith(FAKE_PDF_BUFFER, expect.objectContaining({
        format: 'png',
        density: 150,
      }));
      expect(mockConvertPage).toHaveBeenCalledWith(1, { responseType: 'buffer' });
      expect(mockSharp).toHaveBeenCalledWith(MOCK_PAGE_BUFFER);
      expect(result).toBe(MOCK_THUMBNAIL_BUFFER);
    });

    it('should return null if PDF page extraction fails', async () => {
      mockConvertPage.mockRejectedValueOnce(new Error('Ghostscript not found'));

      const result = await adapter.generateThumbnail(FAKE_PDF_BUFFER, 'application/pdf');

      expect(result).toBeNull();
    });

    it('should return null if pdf2pic returns no buffer', async () => {
      mockConvertPage.mockResolvedValueOnce({ buffer: undefined });

      const result = await adapter.generateThumbnail(FAKE_PDF_BUFFER, 'application/pdf');

      expect(result).toBeNull();
    });
  });

  // ── Erreurs (non bloquantes) ───────────────────────────────────────────────

  describe('generateThumbnail — graceful degradation', () => {
    it('should return null (not throw) if sharp throws', async () => {
      mockToBuffer.mockRejectedValueOnce(new Error('sharp error'));

      const result = await adapter.generateThumbnail(FAKE_IMAGE_BUFFER, 'image/jpeg');

      expect(result).toBeNull();
    });

    it('should return null if sharp constructor throws', async () => {
      mockSharp.mockImplementationOnce(() => { throw new Error('Unsupported format'); });

      const result = await adapter.generateThumbnail(FAKE_IMAGE_BUFFER, 'image/jpeg');

      expect(result).toBeNull();
    });
  });
});
