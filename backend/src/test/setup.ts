import { vi } from 'vitest';

// pdfjs-dist (dépendance de pdf-parse) requiert DOMMatrix — API navigateur
// absente en Node. Mock global pour tous les tests qui importent app.ts
// via processingPlugin → TextExtractorAdapter.
// Les tests unitaires de text-extractor écrasent ce mock localement.
vi.mock('pdf-parse', () => ({
  PDFParse: vi.fn().mockImplementation(() => ({
    getText: vi.fn().mockResolvedValue({ text: '' }),
  })),
}));
