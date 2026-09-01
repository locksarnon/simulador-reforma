import { Body, Controller, Post } from '@nestjs/common';
import { ValidadorNfseService } from './validador-nfse.service';

@Controller('validador-nfse')
export class ValidadorNfseController {
  constructor(private readonly service: ValidadorNfseService) {}

  @Post('validar')
  validar(@Body('xml') xml: string) {
    return this.service.validar(xml || '');
  }
}
