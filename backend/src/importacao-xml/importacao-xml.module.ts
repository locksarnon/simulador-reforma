import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { ImportacaoXmlController } from './importacao-xml.controller';
import { ImportacaoXmlService } from './importacao-xml.service';

@Module({
  imports: [StorageModule],
  controllers: [ImportacaoXmlController],
  providers: [ImportacaoXmlService],
})
export class ImportacaoXmlModule {}
