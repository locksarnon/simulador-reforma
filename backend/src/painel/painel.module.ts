import { Module } from '@nestjs/common';
import { CnpjModule } from '../cnpj/cnpj.module';
import { PainelController } from './painel.controller';
import { PainelCarteiraService } from './painel-carteira.service';

@Module({
  imports: [CnpjModule],
  controllers: [PainelController],
  providers: [PainelCarteiraService],
})
export class PainelModule {}
