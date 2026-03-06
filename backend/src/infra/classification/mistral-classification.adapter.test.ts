import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MistralClassificationAdapter } from './mistral-classification.adapter';

// ── Mock global fetch ─────────────────────────────────────────────────────────

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ── Helpers ───────────────────────────────────────────────────────────────────

const API_KEY = 'test-api-key';
const TEXT    = 'Facture Adobe Systems Inc. Montant : 1 250,00 € Date : 12/01/2025';

function makeChatResponse(content: object | string) {
  return {
    choices: [{
      message:       { role: 'assistant', content: typeof content === 'string' ? content : JSON.stringify(content) },
      finish_reason: 'stop',
    }],
    usage: { prompt_tokens: 100, completion_tokens: 50 },
  };
}

function mockSuccess(body: object) {
  mockFetch.mockResolvedValueOnce({
    ok:     true,
    status: 200,
    json:   () => Promise.resolve(body),
  });
}

function mockHttpError(status: number) {
  mockFetch.mockResolvedValueOnce({ ok: false, status, json: () => Promise.resolve({}) });
}

function mockNetworkError() {
  mockFetch.mockRejectedValueOnce(new Error('Network failure'));
}

const validClassification = {
  detectedType:          'INVOICE',
  extractedEntities:     [
    { entityType: 'AMOUNT',  value: '1250',            confidence: 0.97 },
    { entityType: 'DATE',    value: '2025-01-12',       confidence: 0.99 },
    { entityType: 'VENDOR',  value: 'Adobe Systems',    confidence: 0.96 },
  ],
  globalConfidenceScore: 0.94,
  suggestedTags:         ['facture', 'logiciel', 'adobe'],
};

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('MistralClassificationAdapter', () => {
  let adapter: MistralClassificationAdapter;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    adapter = new MistralClassificationAdapter(API_KEY);
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ── Succès ────────────────────────────────────────────────────────────────

  describe('classify — succès', () => {
    it('should return correct ClassificationResult for an invoice', async () => {
      mockSuccess(makeChatResponse(validClassification));

      const result = await adapter.classify(TEXT, 'application/pdf');

      expect(result.detectedType).toBe('INVOICE');
      expect(result.globalConfidenceScore).toBeCloseTo(0.94);
      expect(result.extractedEntities).toHaveLength(3);
      expect(result.suggestedTags).toContain('facture');
    });

    it('should send correct payload to Mistral API', async () => {
      mockSuccess(makeChatResponse(validClassification));

      await adapter.classify(TEXT, 'application/pdf');

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.model).toBe('mistral-small-latest');
      expect(body.response_format).toEqual({ type: 'json_object' });
      expect(body.temperature).toBe(0.1);
      expect(body.messages[0].role).toBe('system');
      expect(body.messages[1].role).toBe('user');
      expect(body.messages[1].content).toBe(TEXT);
    });

    it('should send Bearer token in Authorization header', async () => {
      mockSuccess(makeChatResponse(validClassification));

      await adapter.classify(TEXT, 'application/pdf');

      expect(mockFetch.mock.calls[0][1].headers['Authorization']).toBe(`Bearer ${API_KEY}`);
    });

    it('should truncate text to MAX_TEXT_LENGTH before sending', async () => {
      mockSuccess(makeChatResponse(validClassification));
      const longText = 'a'.repeat(10_000);

      await adapter.classify(longText, 'application/pdf');

      const body    = JSON.parse(mockFetch.mock.calls[0][1].body);
      const content = body.messages[1].content as string;
      expect(content.length).toBe(4_000);
    });

    it('should replace invalid detectedType with OTHER', async () => {
      mockSuccess(makeChatResponse({ ...validClassification, detectedType: 'UNKNOWN_TYPE' }));

      const result = await adapter.classify(TEXT, 'application/pdf');

      expect(result.detectedType).toBe('OTHER');
    });

    it('should clamp confidence values to [0, 1]', async () => {
      mockSuccess(makeChatResponse({
        ...validClassification,
        extractedEntities:     [{ entityType: 'AMOUNT', value: '100', confidence: 1.5 }],
        globalConfidenceScore: 1.8,
      }));

      const result = await adapter.classify(TEXT, 'application/pdf');

      expect(result.globalConfidenceScore).toBe(1);
      expect(result.extractedEntities[0]!.confidence).toBe(1);
    });

    it('should limit extractedEntities to 10', async () => {
      const manyEntities = Array.from({ length: 15 }, (_, i) => ({
        entityType: 'DATE', value: `2025-0${(i % 9) + 1}-01`, confidence: 0.9,
      }));
      mockSuccess(makeChatResponse({ ...validClassification, extractedEntities: manyEntities }));

      const result = await adapter.classify(TEXT, 'application/pdf');

      expect(result.extractedEntities).toHaveLength(10);
    });

    it('should handle empty text gracefully by sending placeholder', async () => {
      mockSuccess(makeChatResponse({
        detectedType:          'OTHER',
        extractedEntities:     [],
        globalConfidenceScore: 0.3,
        suggestedTags:         [],
      }));

      const result = await adapter.classify('', 'application/pdf');

      const body    = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.messages[1].content).toBe('Document sans texte extractible.');
      expect(result.detectedType).toBe('OTHER');
    });
  });

  // ── Parsing défensif ──────────────────────────────────────────────────────

  describe('classify — parsing défensif', () => {
    it('should throw non-retryable error for invalid JSON', async () => {
      mockSuccess(makeChatResponse('not-valid-json {{{'));

      await expect(adapter.classify(TEXT, 'application/pdf')).rejects.toThrow(
        'JSON invalide',
      );
      // Non-retryable : ne doit faire qu'1 seul appel
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should return empty arrays when extractedEntities is missing', async () => {
      mockSuccess(makeChatResponse({
        detectedType:          'CONTRACT',
        globalConfidenceScore: 0.85,
        suggestedTags:         ['contrat'],
      }));

      const result = await adapter.classify(TEXT, 'application/pdf');

      expect(result.extractedEntities).toEqual([]);
    });
  });

  // ── Retry ─────────────────────────────────────────────────────────────────

  describe('classify — retry', () => {
    it('should retry on 503 and succeed on second attempt', async () => {
      mockHttpError(503);
      mockSuccess(makeChatResponse(validClassification));

      const promise    = adapter.classify(TEXT, 'application/pdf');
      const assertion  = expect(promise).resolves.toMatchObject({ detectedType: 'INVOICE' });
      await vi.runAllTimersAsync();
      await assertion;

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should throw after 3 failed attempts on 503', async () => {
      mockHttpError(503);
      mockHttpError(503);
      mockHttpError(503);

      const promise   = adapter.classify(TEXT, 'application/pdf');
      const assertion = expect(promise).rejects.toThrow('HTTP 503');
      await vi.runAllTimersAsync();
      await assertion;

      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('should retry on network error', async () => {
      mockNetworkError();
      mockSuccess(makeChatResponse(validClassification));

      const promise   = adapter.classify(TEXT, 'application/pdf');
      const assertion = expect(promise).resolves.toBeDefined();
      await vi.runAllTimersAsync();
      await assertion;

      expect(mockFetch).toHaveBeenCalledTimes(2);
    });
  });

  // ── Erreurs non-retryables ─────────────────────────────────────────────────

  describe('classify — erreurs non-retryables', () => {
    it('should NOT retry on 400', async () => {
      mockHttpError(400);

      await expect(adapter.classify(TEXT, 'application/pdf')).rejects.toThrow('HTTP 400');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should NOT retry on 401', async () => {
      mockHttpError(401);

      await expect(adapter.classify(TEXT, 'application/pdf')).rejects.toThrow('HTTP 401');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });

    it('should NOT retry on empty response content', async () => {
      mockSuccess({ choices: [{ message: { role: 'assistant', content: '' }, finish_reason: 'stop' }] });

      await expect(adapter.classify(TEXT, 'application/pdf')).rejects.toThrow('contenu');
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  // ── fromEnv ───────────────────────────────────────────────────────────────

  describe('fromEnv', () => {
    it('should create adapter when MISTRAL_API_KEY is set', () => {
      process.env['MISTRAL_API_KEY'] = 'sk-test-key';
      expect(() => MistralClassificationAdapter.fromEnv()).not.toThrow();
      delete process.env['MISTRAL_API_KEY'];
    });

    it('should throw when MISTRAL_API_KEY is missing', () => {
      delete process.env['MISTRAL_API_KEY'];
      expect(() => MistralClassificationAdapter.fromEnv()).toThrow('MISTRAL_API_KEY');
    });
  });
});
