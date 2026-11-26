import { Module } from '@nestjs/common';
import { ErpsController } from './erps.controller';
import { ErpsService } from './erps.service';

@Module({
  controllers: [ErpsController],
  providers: [ErpsService],
  exports: [ErpsService],
})
export class ErpsModule {}
