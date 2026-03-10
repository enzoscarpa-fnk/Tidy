export interface IS3Service {
  getObject(key: string): Promise<Buffer>;
  putObject(key: string, buffer: Buffer, mimeType: string): Promise<void>;
  deleteObject(key: string): Promise<void>;
  generatePresignedGetUrl(key: string, expiresIn: number): Promise<string>;
  generatePresignedPutUrl(key: string, mimeType: string, expiresIn: number): Promise<string>;
}
