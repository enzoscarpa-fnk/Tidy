import {
  S3Client,
  PutObjectCommand,
  DeleteObjectCommand,
  GetObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import type { IS3Service } from '../../modules/document/domain/ports/s3.service.port';

export class S3ServiceAdapter implements IS3Service {
  constructor(
    private readonly client: S3Client,
    private readonly bucket: string,
    private readonly presignClient?: S3Client,
  ) {}

  static fromEnv(): S3ServiceAdapter {
    const region          = process.env['AWS_REGION']            ?? '';
    const accessKeyId     = process.env['AWS_ACCESS_KEY_ID']     ?? '';
    const secretAccessKey = process.env['AWS_SECRET_ACCESS_KEY'] ?? '';
    const bucket          = process.env['AWS_BUCKET']            ?? '';
    // En dev MinIO : endpoint interne (localhost) pour les opérations serveur-à-serveur
    const endpointUrl     = process.env['AWS_ENDPOINT_URL'];
    // En dev MinIO : endpoint public (IP LAN) pour les URLs présignées accessibles depuis le mobile
    const publicEndpointUrl = process.env['AWS_ENDPOINT_URL_PUBLIC'] || endpointUrl;

    if (!region || !accessKeyId || !secretAccessKey || !bucket) {
      throw new Error(
        'S3ServiceAdapter: variables d\'environnement manquantes. ' +
        'Requis : AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_BUCKET.',
      );
    }

    // Client principal — pour upload, download serveur-à-serveur (localhost)
    const client = new S3Client({
      region,
      credentials: { accessKeyId, secretAccessKey },
      ...(endpointUrl && {
        endpoint:       endpointUrl,
        forcePathStyle: true,
      }),
    });

    // Client pour les URLs présignées — utilise l'IP publique pour que la signature soit valide
    const presignClient = new S3Client({
      region,
      credentials: { accessKeyId, secretAccessKey },
      ...(publicEndpointUrl && {
        endpoint:       publicEndpointUrl,
        forcePathStyle: true,
      }),
    });

    return new S3ServiceAdapter(client, bucket, presignClient);
  }

  // ── Téléchargement (pipeline côté serveur) ────────────────────────────────

  async getObject(key: string): Promise<Buffer> {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );

    if (!response.Body) {
      throw new Error(`S3: objet "${key}" introuvable ou corps vide.`);
    }

    // AWS SDK v3 : Body est un AsyncIterable<Uint8Array> côté Node.js
    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  // ── Upload direct ─────────────────────────────────────────────────────────

  async putObject(key: string, buffer: Buffer, mimeType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({
        Bucket:      this.bucket,
        Key:         key,
        Body:        buffer,
        ContentType: mimeType,
      }),
    );
  }

  // ── Suppression ───────────────────────────────────────────────────────────

  async deleteObject(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({ Bucket: this.bucket, Key: key }),
    );
  }

  // ── Presigned GET ─────────────────────────────────────────────────────────

  async generatePresignedGetUrl(key: string, expiresIn: number): Promise<string> {
    return getSignedUrl(
      this.presignClient ?? this.client,  // ← utilise le client public si disponible
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn },
    );
  }

  // ── Presigned PUT ─────────────────────────────────────────────────────────

  async generatePresignedPutUrl(
    key:      string,
    mimeType: string,
    expiresIn: number,
  ): Promise<string> {
    return getSignedUrl(
      this.client,
      new PutObjectCommand({
        Bucket:      this.bucket,
        Key:         key,
        ContentType: mimeType,
      }),
      { expiresIn },
    );
  }
}
