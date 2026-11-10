import { Module } from '@nestjs/common';
import { BaseLegalController } from './base-legal.controller';
import { BaseLegalService } from './base-legal.service';
import { CartoesService } from './cartoes.service';
import { RevisaoLegalService } from './revisao-legal.service';

@Module({
  controllers: [BaseLegalController],
  providers: [BaseLegalService, CartoesService, RevisaoLegalService],
  exports: [BaseLegalService, RevisaoLegalService],
})
export class BaseLegalModule {}
