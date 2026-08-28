import { Controller, Post, UploadedFile, UseInterceptors, BadRequestException } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { randomUUID } from 'crypto';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthUser } from '../auth/auth.types';
import { StorageService } from './storage.service';

const MAX_SIZE = 2 * 1024 * 1024; // 2 MB, mesmo limite do frontend (useImportacaoXML.js)

@Controller('uploads')
export class StorageController {
  constructor(private readonly storage: StorageService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_SIZE } }))
  async upload(@UploadedFile() file: Express.Multer.File, @CurrentUser() user: AuthUser) {
    if (!file) throw new BadRequestException('Nenhum arquivo enviado.');
    const objectKey = `${user.id}/${randomUUID()}-${file.originalname}`;
    const { storageKey, url } = await this.storage.putFileAndGetUrl(objectKey, file.buffer, file.mimetype);
    return { file_url: url, storage_key: storageKey };
  }
}
