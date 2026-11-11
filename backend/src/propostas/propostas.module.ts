import { Module } from '@nestjs/common';
import { PropostasController } from './propostas.controller';
import { PropostasService } from './propostas.service';

@Module({
  controllers: [PropostasController],
  providers: [PropostasService],
})
export class PropostasModule {}
