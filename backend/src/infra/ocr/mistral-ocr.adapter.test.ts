import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MistralOcrAdapter } from './mistral-ocr.adapter';
import { OcrServiceUnavailableError } from '../../shared/errors/domain-errors';

// ── Mock global fetch ─────────────────────────────────────────────────────────

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ── Fixtures ──────────────────────────────────────────────────────────────────

const API_KEY  = 'test-api-key';
const BASE64   = 'JVBERi0xLjQ='; // fake PDF base64
const PDF_MIME = 'application/pdf';
const IMG_MIME = 'image/jpeg';

function makeMistralResponse(pages: { markdown: string; confidence?: number }[]) {
  return {
    pages:      pages.map((p, i) => ({ index: i, ...p })),
    model:      'mistral-ocr-latest',
    usage_info: { pages_processed: pages.length },
  };
}

function mockSuccess(body: object, status = 200) {
  mockFetch.mockResolvedValueOnce({
    ok:     status >= 200 && status < 300,
    status,
    json:   () => Promise.resolve(body),
  });
}

function mockHttpError(status: number) {
  mockFetch.mockResolvedValueOnce({ ok: false, status, json: () => Promise.resolve({}) });
}

function mockNetworkError(name = 'Error') {
  const err = new Error('Network failure');
  err.name  = name;
  mockFetch.mockRejectedValueOnce(err);
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('MistralOcrAdapter', () => {
  let adapter: MistralOcrAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    adapter = new MistralOcrAdapter(API_KEY);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── Succès ────────────────────────────────────────────────────────────────

  describe('processDocument — succès', () => {
    it('should return text, confidence and pageCount for a PDF', async () => {
      mockSuccess(makeMistralResponse([
        { markdown: 'Page 1 content', confidence: 0.95 },
        { markdown: 'Page 2 content', confidence: 0.85 },
      ]));

      const result = await adapter.processDocument(BASE64, PDF_MIME);

      expect(result.text).toBe('Page 1 content\n\nPage 2 content');
      expect(result.confidence).toBeCloseTo(0.9);
      expect(result.pageCount).toBe(2);
    });

    it('should use fallback confidence 0.9 when pages have no confidence field', async () => {
      mockSuccess(makeMistralResponse([
        { markdown: 'Texte extrait' },
      ]));

      const result = await adapter.processDocument(BASE64, PDF_MIME);

      expect(result.confidence).toBeCloseTo(0.9);
    });

    it('should use image_url type for JPEG mime type', async () => {
      mockSuccess(makeMistralResponse([{ markdown: 'image content', confidence: 0.92 }]));

      await adapter.processDocument(BASE64, IMG_MIME);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.document.type).toBe('image_url');
      expect(body.document.image_url).toContain('image/jpeg;base64,');
    });

    it('should use document_url type for PDF mime type', async () => {
      mockSuccess(makeMistralResponse([{ markdown: 'pdf content', confidence: 0.95 }]));

      await adapter.processDocument(BASE64, PDF_MIME);

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.document.type).toBe('document_url');
      expect(body.document.document_url).toContain('application/pdf;base64,');
    });

    it('should send Bearer token in Authorization header', async () => {
      mockSuccess(makeMistralResponse([{ markdown: 'text' }]));

      await adapter.processDocument(BASE64, PDF_MIME);

      expect(mockFetch.mock.calls[0][1].headers['Authorization']).toBe(`Bearer ${API_KEY}`);
    });
  });

  // ── Retry ─────────────────────────────────────────────────────────────────

  describe('processDocument — retry', () => {
    it('should retry on 503 and succeed on second attempt', async () => {
      mockHttpError(503);
      mockSuccess(makeMistralResponse([{ markdown: 'ok', confidence: 0.95 }]));

      const promise = adapter.processDocument(BASE64, PDF_MIME);
      await vi.runAllTimersAsync();
      const result = await promise;

      expect(mockFetch).toHaveBeenCalledTimes(2);
      expect(result.text).toBe('ok');
    });

    it('should retry on 429 (rate limit)', async () => {
      mockHttpError(429);
      mockSuccess(makeMistralResponse([{ markdown: 'ok after rate limit' }]));

      const promise = adapter.processDocument(BASE64, PDF_MIME);
      await vi.runAllTimersAsync();
      await promise;

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should retry on network error', async () => {
      mockNetworkError();
      mockSuccess(makeMistralResponse([{ markdown: 'recovered' }]));

      const promise = adapter.processDocument(BASE64, PDF_MIME);
      await vi.runAllTimersAsync();
      await promise;

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should throw OcrServiceUnavailableError after 3 failed attempts', async () => {
      mockHttpError(503);
      mockHttpError(503);
      mockHttpError(503);

      const promise   = adapter.processDocument(BASE64, PDF_MIME);
      const assertion = expect(promise).rejects.toBeInstanceOf(OcrServiceUnavailableError);
      await vi.runAllTimersAsync();
      await assertion;

      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });

  // ── Erreurs non-retryables ─────────────────────────────────────────────────

  describe('processDocument — non-retryable errors', () => {
    it('should NOT retry on 400 Bad Request', async () => {
      mockHttpError(400);

      await expect(adapter.processDocument(BASE64, PDF_MIME)).rejects.toBeInstanceOf(
        OcrServiceUnavailableError,
      );
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should NOT retry on 401 Unauthorized', async () => {
      mockHttpError(401);

      await expect(adapter.processDocument(BASE64, PDF_MIME)).rejects.toBeInstanceOf(
        OcrServiceUnavailableError,
      );
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should NOT retry on 403 Forbidden', async () => {
      mockHttpError(403);

      await expect(adapter.processDocument(BASE64, PDF_MIME)).rejects.toBeInstanceOf(
        OcrServiceUnavailableError,
      );
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  // ── Timeout ───────────────────────────────────────────────────────────────

  describe('processDocument — timeout', () => {
    it('should throw OcrServiceUnavailableError on AbortError (timeout)', async () => {
      mockNetworkError('AbortError');
      // On force aussi les retries suivants à échouer
      mockNetworkError('AbortError');
      mockNetworkError('AbortError');

      const promise = adapter.processDocument(BASE64, PDF_MIME);
      const assertion = expect(promise).rejects.toBeInstanceOf(OcrServiceUnavailableError);
      await vi.runAllTimersAsync();
      await assertion;
    });
  });

  // ── fromEnv ───────────────────────────────────────────────────────────────

  describe('fromEnv', () => {
    it('should create adapter when MISTRAL_API_KEY is set', () => {
      process.env['MISTRAL_API_KEY'] = 'sk-test-key';
      expect(() => MistralOcrAdapter.fromEnv()).not.toThrow();
      delete process.env['MISTRAL_API_KEY'];
    });

    it('should throw when MISTRAL_API_KEY is missing', () => {
      delete process.env['MISTRAL_API_KEY'];
      expect(() => MistralOcrAdapter.fromEnv()).toThrow('MISTRAL_API_KEY');
    });
  });
});
