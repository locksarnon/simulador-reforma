import { Module } from '@nestjs/common';
import { CertificadosController } from './certificados.controller';
import { CertificadosService } from './certificados.service';
import { CofreService } from './cofre.service';
import { PinCertificadoService } from './pin.service';
import { PinCertificadoController } from './pin.controller';
import { VencimentoCertificadosService } from './vencimento.service';

@Module({
  controllers: [CertificadosController, PinCertificadoController],
  providers: [CofreService, CertificadosService, VencimentoCertificadosService, PinCertificadoService],
  exports: [CofreService, CertificadosService],
})
export class CertificadosModule {}
