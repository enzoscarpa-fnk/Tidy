import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { S3ServiceAdapter } from './s3.service.adapter';

// ── Mocks modules AWS ─────────────────────────────────────────────────────────

vi.mock('@aws-sdk/client-s3', async () => {
  const actual = await vi.importActual<typeof import('@aws-sdk/client-s3')>('@aws-sdk/client-s3');
  return {
    ...actual,
    S3Client: vi.fn().mockImplementation(() => ({ send: vi.fn() })),
  };
});

vi.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: vi.fn(),
}));

// ── Helpers ───────────────────────────────────────────────────────────────────

const BUCKET = 'test-bucket';
const KEY    = 'documents/uuid-1/facture.pdf';
const MIME   = 'application/pdf';

function makeAdapter() {
  const mockSend   = vi.fn();
  const mockClient = { send: mockSend } as unknown as S3Client;
  const adapter    = new S3ServiceAdapter(mockClient, BUCKET);
  return { adapter, mockSend };
}

// ── Suite ─────────────────────────────────────────────────────────────────────

describe('S3ServiceAdapter', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── putObject ──────────────────────────────────────────────────────────────

  describe('putObject', () => {
    it('should send PutObjectCommand with correct params', async () => {
      const { adapter, mockSend } = makeAdapter();
      mockSend.mockResolvedValueOnce({});

      const buffer = Buffer.from('fake-pdf-content');
      await adapter.putObject(KEY, buffer, MIME);

      expect(mockSend).toHaveBeenCalledOnce();
      const command = mockSend.mock.calls[0][0];
      expect(command).toBeInstanceOf(PutObjectCommand);
      expect(command.input).toMatchObject({
        Bucket:      BUCKET,
        Key:         KEY,
        Body:        buffer,
        ContentType: MIME,
      });
    });

    it('should propagate S3 errors', async () => {
      const { adapter, mockSend } = makeAdapter();
      mockSend.mockRejectedValueOnce(new Error('S3 unavailable'));

      await expect(
        adapter.putObject(KEY, Buffer.from('data'), MIME),
      ).rejects.toThrow('S3 unavailable');
    });
  });

  // ── deleteObject ───────────────────────────────────────────────────────────

  describe('deleteObject', () => {
    it('should send DeleteObjectCommand with correct params', async () => {
      const { adapter, mockSend } = makeAdapter();
      mockSend.mockResolvedValueOnce({});

      await adapter.deleteObject(KEY);

      expect(mockSend).toHaveBeenCalledOnce();
      const command = mockSend.mock.calls[0][0];
      expect(command).toBeInstanceOf(DeleteObjectCommand);
      expect(command.input).toMatchObject({ Bucket: BUCKET, Key: KEY });
    });
  });

  // ── generatePresignedGetUrl ────────────────────────────────────────────────

  describe('generatePresignedGetUrl', () => {
    it('should call getSignedUrl with GetObjectCommand and return URL', async () => {
      const { adapter } = makeAdapter();
      const fakeUrl = 'https://s3.amazonaws.com/test-bucket/key?X-Amz-Signature=abc';
      vi.mocked(getSignedUrl).mockResolvedValueOnce(fakeUrl);

      const result = await adapter.generatePresignedGetUrl(KEY, 900);

      expect(getSignedUrl).toHaveBeenCalledOnce();
      const [, command, options] = vi.mocked(getSignedUrl).mock.calls[0];
      expect(command).toBeInstanceOf(GetObjectCommand);
      expect(command.input).toMatchObject({ Bucket: BUCKET, Key: KEY });
      expect(options).toEqual({ expiresIn: 900 });
      expect(result).toBe(fakeUrl);
    });

    it('should forward expiresIn value correctly (15 min = 900s)', async () => {
      const { adapter } = makeAdapter();
      vi.mocked(getSignedUrl).mockResolvedValueOnce('https://signed-url');

      await adapter.generatePresignedGetUrl(KEY, 900);

      const options = vi.mocked(getSignedUrl).mock.calls[0][2];
      expect(options?.expiresIn).toBe(900);
    });
  });

  // ── generatePresignedPutUrl ────────────────────────────────────────────────

  describe('generatePresignedPutUrl', () => {
    it('should call getSignedUrl with PutObjectCommand and return URL', async () => {
      const { adapter } = makeAdapter();
      const fakeUrl = 'https://s3.amazonaws.com/test-bucket/key?X-Amz-Signature=xyz';
      vi.mocked(getSignedUrl).mockResolvedValueOnce(fakeUrl);

      const result = await adapter.generatePresignedPutUrl(KEY, MIME, 600);

      const [, command, options] = vi.mocked(getSignedUrl).mock.calls[0];
      expect(command).toBeInstanceOf(PutObjectCommand);
      expect(command.input).toMatchObject({
        Bucket:      BUCKET,
        Key:         KEY,
        ContentType: MIME,
      });
      expect(options).toEqual({ expiresIn: 600 });
      expect(result).toBe(fakeUrl);
    });

    it('should forward expiresIn value correctly (10 min = 600s)', async () => {
      const { adapter } = makeAdapter();
      vi.mocked(getSignedUrl).mockResolvedValueOnce('https://signed-url');

      await adapter.generatePresignedPutUrl(KEY, MIME, 600);

      const options = vi.mocked(getSignedUrl).mock.calls[0][2];
      expect(options?.expiresIn).toBe(600);
    });
  });

  // ── fromEnv (factory) ──────────────────────────────────────────────────────

  describe('fromEnv', () => {
    const REQUIRED_VARS = {
      AWS_REGION:            'eu-west-1',
      AWS_ACCESS_KEY_ID:     'test-key-id',
      AWS_SECRET_ACCESS_KEY: 'test-secret',
      AWS_BUCKET:            'test-bucket',
    };

    it('should create an adapter when all env vars are set', () => {
      Object.entries(REQUIRED_VARS).forEach(([k, v]) => { process.env[k] = v; });

      expect(() => S3ServiceAdapter.fromEnv()).not.toThrow();

      Object.keys(REQUIRED_VARS).forEach((k) => { delete process.env[k]; });
    });

    it('should throw when a required env var is missing', () => {
      // Aucune variable → doit throw
      Object.keys(REQUIRED_VARS).forEach((k) => { delete process.env[k]; });

      expect(() => S3ServiceAdapter.fromEnv()).toThrow(
        'S3ServiceAdapter: variables d\'environnement manquantes',
      );
    });
  });
});
