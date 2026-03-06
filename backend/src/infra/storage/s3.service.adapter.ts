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
  ) {}

  // ── Factory production (lecture des env vars) ─────────────────────────────

  static fromEnv(): S3ServiceAdapter {
    const region          = process.env['AWS_REGION']            ?? '';
    const accessKeyId     = process.env['AWS_ACCESS_KEY_ID']     ?? '';
    const secretAccessKey = process.env['AWS_SECRET_ACCESS_KEY'] ?? '';
    const bucket          = process.env['AWS_BUCKET']            ?? '';
    const endpointUrl     = process.env['AWS_ENDPOINT_URL'];

    if (!region || !accessKeyId || !secretAccessKey || !bucket) {
      throw new Error(
        'S3ServiceAdapter: variables d\'environnement manquantes. ' +
        'Requis : AWS_REGION, AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, AWS_BUCKET.',
      );
    }

    const client = new S3Client({
      region,
      credentials: { accessKeyId, secretAccessKey },
      // Endpoint custom pour LocalStack / MinIO en développement local
      ...(endpointUrl && {
        endpoint:         endpointUrl,
        forcePathStyle:   true, // MinIO exige le path-style
      }),
    });

    return new S3ServiceAdapter(client, bucket);
  }

  // ── Upload direct (pipeline côté serveur) ─────────────────────────────────

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

  // ── Télécharge le fichier pour le pipeline de traitement ─────────────────────────────────

  async getObject(key: string): Promise<Buffer> {
    const response = await this.client.send(
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
    );
    if (!response.Body) {
      throw new Error(`S3 getObject: body vide pour la clé "${key}"`);
    }
    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }

  // ── Suppression ───────────────────────────────────────────────────────────

  async deleteObject(key: string): Promise<void> {
    await this.client.send(
      new DeleteObjectCommand({
        Bucket: this.bucket,
        Key:    key,
      }),
    );
  }

  // ── Presigned GET (téléchargement sécurisé, 15 min par défaut) ────────────

  async generatePresignedGetUrl(key: string, expiresIn: number): Promise<string> {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({ Bucket: this.bucket, Key: key }),
      { expiresIn },
    );
  }

  // ── Presigned PUT (upload mobile direct vers S3, 10 min par défaut) ───────

  async generatePresignedPutUrl(
    key: string,
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
