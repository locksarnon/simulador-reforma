import { Body, Controller, Delete, Get, Put, Query } from '@nestjs/common';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { CfopService } from './cfop.service';

@Controller('cfop')
export class CfopController {
  constructor(private readonly service: CfopService) {}

  /** Lista-padrão de CFOPs por receita + ajustes das empresas pedidas (empresa_ids=a,b,c). */
  @Get('tratamentos')
  tratamentos(@Query('empresa_ids') empresaIds?: string) {
    return this.service.tratamentos((empresaIds ?? '').split(',').map((s) => s.trim()));
  }

  @Put('empresa')
  definir(@CurrentUser() user: AuthUser, @Body() body: { empresa_id?: string; cfop?: string; tratamento?: string }) {
    return this.service.definir(body?.empresa_id ?? '', body?.cfop ?? '', body?.tratamento ?? '', user.email);
  }

  @Delete('empresa')
  desfazer(@Query('empresa_id') empresaId: string, @Query('cfop') cfop: string) {
    return this.service.desfazer(empresaId, cfop);
  }
}
