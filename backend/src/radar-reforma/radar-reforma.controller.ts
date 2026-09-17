import { Controller, Post } from '@nestjs/common';
import { RadarReformaService } from './radar-reforma.service';

@Controller('radar-reforma')
export class RadarReformaController {
  constructor(private readonly service: RadarReformaService) {}

  @Post('gerar')
  gerar() {
    return this.service.gerar('MANUAL');
  }
}
