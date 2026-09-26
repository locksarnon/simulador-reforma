import { Body, Controller, Get, Post, Query, UseGuards } from '@nestjs/common';
import { Throttle, ThrottlerGuard } from '@nestjs/throttler';
import { Public } from '../common/decorators/public.decorator';
import { ClassificacaoService } from './classificacao.service';

@Controller('ncm')
export class ClassificacaoController {
  constructor(private readonly service: ClassificacaoService) {}

  /** Consulta NCM — pública (ferramenta-isca), com limite de uso por IP. */
  @Public()
  @UseGuards(ThrottlerGuard)
  @Throttle({ default: { limit: 40, ttl: 60_000 } })
  @Get('consulta')
  consulta(@Query('q') q: string) {
    return this.service.consultar(q);
  }

  /** Sugestão por NCM em lote (usuário logado): compara a classificação do XML com a da LC 214. */
  @Post('sugestoes')
  sugestoes(@Body() body: { ncms?: string[] }) {
    return this.service.sugerirLote(Array.isArray(body?.ncms) ? body.ncms.map(String) : []);
  }
}
