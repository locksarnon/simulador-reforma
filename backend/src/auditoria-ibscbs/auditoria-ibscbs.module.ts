import { Controller, Get, Module, Param, Query } from '@nestjs/common';
import { CalculadoraRfbModule } from '../calculadora-rfb/calculadora-rfb.module';
import { StorageModule } from '../storage/storage.module';
import { AuditoriaIbsCbsService } from './auditoria-ibscbs.service';

/** Repositório de XML > Divergências IBS/CBS: a conferência das notas da empresa com a calculadora oficial. */
@Controller('repositorio-xml/empresas/:empresaId/auditoria-ibscbs')
export class AuditoriaIbsCbsController {
  constructor(private readonly auditoria: AuditoriaIbsCbsService) {}

  @Get()
  listar(@Param('empresaId') empresaId: string, @Query('de') de?: string, @Query('ate') ate?: string) {
    const data = (s?: string) => (s && /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : undefined);
    return this.auditoria.listar(empresaId, data(de), data(ate));
  }
}

@Module({
  imports: [CalculadoraRfbModule, StorageModule],
  controllers: [AuditoriaIbsCbsController],
  providers: [AuditoriaIbsCbsService],
  exports: [AuditoriaIbsCbsService],
})
export class AuditoriaIbsCbsModule {}
