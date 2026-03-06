export interface IS3Service {
  putObject(key: string, buffer: Buffer, mimeType: string): Promise<void>;
  getObject(key: string): Promise<Buffer>;
  deleteObject(key: string): Promise<void>;
  generatePresignedGetUrl(key: string, expiresIn: number): Promise<string>;
  generatePresignedPutUrl(key: string, mimeType: string, expiresIn: number): Promise<string>;
}
