import { Controller, Post } from '@nestjs/common';
import { NoticiasService } from './noticias.service';

@Controller('noticias')
export class NoticiasController {
  constructor(private readonly service: NoticiasService) {}

  @Post('buscar-atualizacoes')
  buscarAtualizacoes() {
    return this.service.buscarAtualizacoes();
  }
}
