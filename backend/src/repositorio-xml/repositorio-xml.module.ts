import { Module } from '@nestjs/common';
import { ImportacaoXmlModule } from '../importacao-xml/importacao-xml.module';
import { StorageModule } from '../storage/storage.module';
import { RepositorioXmlController } from './repositorio-xml.controller';
import { RepositorioXmlService } from './repositorio-xml.service';

@Module({
  imports: [StorageModule, ImportacaoXmlModule],
  controllers: [RepositorioXmlController],
  providers: [RepositorioXmlService],
  exports: [RepositorioXmlService],
})
export class RepositorioXmlModule {}
