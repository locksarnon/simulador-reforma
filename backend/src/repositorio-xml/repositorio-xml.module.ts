import { Module } from '@nestjs/common';
import { ImportacaoXmlModule } from '../importacao-xml/importacao-xml.module';
import { StorageModule } from '../storage/storage.module';
import { RelatoriosXmlService } from './relatorios-xml.service';
import { RepositorioXmlController } from './repositorio-xml.controller';
import { RepositorioXmlService } from './repositorio-xml.service';

import { CustosModule } from '../custos/custos.module';
import { RecuperacaoXmlHistoricoController } from './recuperacao-xml-historico.controller';
import { RecuperacaoXmlHistoricoService } from './recuperacao-xml-historico.service';

@Module({
  imports: [StorageModule, ImportacaoXmlModule, CustosModule],
  controllers: [RepositorioXmlController, RecuperacaoXmlHistoricoController],
  providers: [RepositorioXmlService, RelatoriosXmlService, RecuperacaoXmlHistoricoService],
  exports: [RepositorioXmlService],
})
export class RepositorioXmlModule {}
