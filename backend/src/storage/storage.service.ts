import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Client } from 'minio';

/**
 * Wrapper fino sobre o MinIO (S3-compatible), provisionado no docker-compose
 * (serviço `minio`). Substitui base44.integrations.Core.UploadFile — o
 * Base44 original guardava o arquivo na própria plataforma via `file_url`.
 */
@Injectable()
export class StorageService implements OnModuleInit {
  private readonly logger = new Logger(StorageService.name);
  private readonly client: Client;
  private readonly bucket: string;
  private ready = false;

  constructor(private readonly config: ConfigService) {
    this.bucket = this.config.get<string>('MINIO_BUCKET', 'xml-uploads');
    this.client = new Client({
      endPoint: this.config.get<string>('MINIO_ENDPOINT', '127.0.0.1'),
      port: Number(this.config.get('MINIO_PORT', 9200)),
      useSSL: false,
      accessKey: this.config.get<string>('MINIO_ROOT_USER', 'reforma'),
      secretKey: this.config.get<string>('MINIO_ROOT_PASSWORD', ''),
    });
  }

  async onModuleInit() {
    try {
      const exists = await this.client.bucketExists(this.bucket);
      if (!exists) {
        try {
          await this.client.makeBucket(this.bucket);
          this.logger.log(`Bucket MinIO "${this.bucket}" criado.`);
        } catch (makeErr) {
          // bucketExists pode responder false por uma condição de corrida
          // (ex: outra instância acabou de criar o bucket) — nesse caso o
          // MinIO recusa com "BucketAlreadyOwnedByYou", que é inofensivo.
          const code = (makeErr as { code?: string }).code;
          if (code !== 'BucketAlreadyOwnedByYou' && code !== 'BucketAlreadyExists') throw makeErr;
        }
      }
      this.ready = true;
    } catch (err) {
      // Não derruba o boot da API por causa do MinIO — upload/importação de
      // XML vão falhar com erro claro na hora de usar, mas o resto do
      // sistema (auth, entidades) continua funcionando.
      this.logger.warn(
        `MinIO indisponível no boot (${(err as Error).message}). Upload de XML vai falhar até o MinIO subir.`,
      );
    }
  }

  private assertReady() {
    if (!this.ready) {
      throw new Error(
        'Armazenamento de arquivos (MinIO) indisponível. Confirme que o container "reforma-minio" está rodando.',
      );
    }
  }

  /** Grava um arquivo e retorna uma URL GET pré-assinada (usável pelo próprio backend para reler o conteúdo depois). */
  async putFileAndGetUrl(
    objectKey: string,
    buffer: Buffer,
    contentType?: string,
    expirySeconds = 24 * 60 * 60,
  ): Promise<{ storageKey: string; url: string }> {
    this.assertReady();
    await this.client.putObject(this.bucket, objectKey, buffer, buffer.length, {
      ...(contentType ? { 'Content-Type': contentType } : {}),
    });
    const url = await this.client.presignedGetObject(this.bucket, objectKey, expirySeconds);
    return { storageKey: objectKey, url };
  }
}
