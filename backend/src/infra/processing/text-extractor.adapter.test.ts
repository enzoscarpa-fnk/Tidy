import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TextExtractorAdapter } from './text-extractor.adapter';

// ── Mock pdf-parse (class-based API) ───────────────────────────────────────

const mockGetText = vi.fn();
const mockGetInfo = vi.fn();

vi.mock('pdf-parse', () => ({
  PDFParse: vi.fn().mockImplementation(() => ({
    getText: mockGetText,
    getInfo: mockGetInfo,
  })),
}));

import { PDFParse } from 'pdf-parse';
const MockPDFParse = vi.mocked(PDFParse);

// ── Fixtures ──────────────────────────────────────────────────────────────────

const FAKE_BUFFER     = Buffer.from('fake-pdf-bytes');
const RICH_TEXT       = 'Facture N°2024-001 — Prestation de services — Montant HT : 1 500,00 €';
const SPARSE_TEXT     = '   \n\t  ';
const VERY_SHORT_TEXT = 'Hello';

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('TextExtractorAdapter', () => {
  let adapter: TextExtractorAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    adapter = new TextExtractorAdapter();
  });

  // ── Texte natif présent ───────────────────────────────────────────────────

  describe('extractFromPdf — texte natif', () => {
    it('should return NATIVE_PDF with trimmed text when PDF has sufficient content', async () => {
      mockGetText.mockResolvedValueOnce({ text: RICH_TEXT });

      const result = await adapter.extractFromPdf(FAKE_BUFFER);

      expect(result.method).toBe('NATIVE_PDF');
      expect(result.text).toBe(RICH_TEXT);
    });

    it('should pass the buffer to the PDFParse constructor', async () => {
      mockGetText.mockResolvedValueOnce({ text: RICH_TEXT });

      await adapter.extractFromPdf(FAKE_BUFFER);

      expect(MockPDFParse).toHaveBeenCalledWith(FAKE_BUFFER);
    });

    it('should trim surrounding whitespace before returning text', async () => {
      mockGetText.mockResolvedValueOnce({ text: `\n\n  ${RICH_TEXT}  \n` });

      const result = await adapter.extractFromPdf(FAKE_BUFFER);

      expect(result.method).toBe('NATIVE_PDF');
      expect(result.text).toBe(RICH_TEXT.trim());
    });
  });

  // ── OCR nécessaire ────────────────────────────────────────────────────────

  describe('extractFromPdf — OCR_NEEDED', () => {
    it('should return OCR_NEEDED when text is empty string', async () => {
      mockGetText.mockResolvedValueOnce({ text: '' });

      const result = await adapter.extractFromPdf(FAKE_BUFFER);

      expect(result.method).toBe('OCR_NEEDED');
      expect(result.text).toBeNull();
    });

    it('should return OCR_NEEDED when text is only whitespace', async () => {
      mockGetText.mockResolvedValueOnce({ text: SPARSE_TEXT });

      const result = await adapter.extractFromPdf(FAKE_BUFFER);

      expect(result.method).toBe('OCR_NEEDED');
      expect(result.text).toBeNull();
    });

    it('should return OCR_NEEDED when text is below the minimum threshold (< 20 chars)', async () => {
      mockGetText.mockResolvedValueOnce({ text: VERY_SHORT_TEXT });

      const result = await adapter.extractFromPdf(FAKE_BUFFER);

      expect(result.method).toBe('OCR_NEEDED');
      expect(result.text).toBeNull();
    });

    it('should return OCR_NEEDED when text field is undefined', async () => {
      mockGetText.mockResolvedValueOnce({ text: undefined });

      const result = await adapter.extractFromPdf(FAKE_BUFFER);

      expect(result.method).toBe('OCR_NEEDED');
      expect(result.text).toBeNull();
    });
  });

  // ── Gestion des erreurs ───────────────────────────────────────────────────

  describe('extractFromPdf — erreurs', () => {
    it('should return OCR_NEEDED (not throw) when getText throws', async () => {
      mockGetText.mockRejectedValueOnce(new Error('PDF parse error'));

      const result = await adapter.extractFromPdf(FAKE_BUFFER);

      expect(result.method).toBe('OCR_NEEDED');
      expect(result.text).toBeNull();
    });

    it('should return OCR_NEEDED when PDF is encrypted/password-protected', async () => {
      mockGetText.mockRejectedValueOnce(new Error('Password required'));

      const result = await adapter.extractFromPdf(FAKE_BUFFER);

      expect(result.method).toBe('OCR_NEEDED');
      expect(result.text).toBeNull();
    });

    it('should return OCR_NEEDED when PDFParse constructor throws', async () => {
      MockPDFParse.mockImplementationOnce(() => { throw new Error('Invalid PDF'); });

      const result = await adapter.extractFromPdf(FAKE_BUFFER);

      expect(result.method).toBe('OCR_NEEDED');
      expect(result.text).toBeNull();
    });
  });
});
