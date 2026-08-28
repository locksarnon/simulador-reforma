import { Module } from '@nestjs/common';
import { ImportacaoXmlController } from './importacao-xml.controller';
import { ImportacaoXmlService } from './importacao-xml.service';

@Module({
  controllers: [ImportacaoXmlController],
  providers: [ImportacaoXmlService],
})
export class ImportacaoXmlModule {}
