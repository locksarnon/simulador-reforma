import { Controller, Get, Query, UseGuards } from '@nestjs/common';
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
}
