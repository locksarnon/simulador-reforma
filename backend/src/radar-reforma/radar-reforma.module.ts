import { Module } from '@nestjs/common';
import { RadarReformaController } from './radar-reforma.controller';
import { RadarReformaService } from './radar-reforma.service';

@Module({
  controllers: [RadarReformaController],
  providers: [RadarReformaService],
})
export class RadarReformaModule {}
