import { Controller, Get, Param } from '@nestjs/common';
import { CnpjService } from './cnpj.service';

@Controller('cnpj')
export class CnpjController {
  constructor(private readonly service: CnpjService) {}

  @Get(':cnpj')
  consultar(@Param('cnpj') cnpj: string) {
    return this.service.consultar(cnpj);
  }
}
