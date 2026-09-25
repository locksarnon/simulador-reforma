import { Module } from '@nestjs/common';
import { BaseLegalModule } from '../base-legal/base-legal.module';
import { RadarReformaController } from './radar-reforma.controller';
import { RadarReformaService } from './radar-reforma.service';

@Module({
  imports: [BaseLegalModule],
  controllers: [RadarReformaController],
  providers: [RadarReformaService],
})
export class RadarReformaModule {}
