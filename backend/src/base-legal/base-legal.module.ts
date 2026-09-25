import { Module } from '@nestjs/common';
import { BaseLegalController } from './base-legal.controller';
import { BaseLegalService } from './base-legal.service';

@Module({
  controllers: [BaseLegalController],
  providers: [BaseLegalService],
  exports: [BaseLegalService],
})
export class BaseLegalModule {}
