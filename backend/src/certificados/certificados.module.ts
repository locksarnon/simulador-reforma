import { Module } from '@nestjs/common';
import { CertificadosController } from './certificados.controller';
import { CertificadosService } from './certificados.service';
import { CofreService } from './cofre.service';
import { VencimentoCertificadosService } from './vencimento.service';

@Module({
  controllers: [CertificadosController],
  providers: [CofreService, CertificadosService, VencimentoCertificadosService],
  exports: [CofreService, CertificadosService],
})
export class CertificadosModule {}
