import { Module } from '@nestjs/common';
import { CfopController } from './cfop.controller';
import { CfopService } from './cfop.service';

@Module({
  controllers: [CfopController],
  providers: [CfopService],
  exports: [CfopService],
})
export class CfopModule {}
