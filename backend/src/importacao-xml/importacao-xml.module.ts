import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { CfopModule } from '../cfop/cfop.module';
import { ImportacaoXmlController } from './importacao-xml.controller';
import { ImportacaoXmlService } from './importacao-xml.service';

@Module({
  imports: [StorageModule, CfopModule],
  controllers: [ImportacaoXmlController],
  providers: [ImportacaoXmlService],
})
export class ImportacaoXmlModule {}
