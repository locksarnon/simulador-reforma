import { Module } from '@nestjs/common';
import { BaseLegalController } from './base-legal.controller';
import { BaseLegalService } from './base-legal.service';
import { CartoesService } from './cartoes.service';

@Module({
  controllers: [BaseLegalController],
  providers: [BaseLegalService, CartoesService],
  exports: [BaseLegalService],
})
export class BaseLegalModule {}
