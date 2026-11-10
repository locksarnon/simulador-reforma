import { Module } from '@nestjs/common';
import { BaseLegalModule } from '../base-legal/base-legal.module';
import { AgendaReformaController } from './agenda-reforma.controller';
import { AgendaReformaService } from './agenda-reforma.service';

@Module({
  imports: [BaseLegalModule],
  controllers: [AgendaReformaController],
  providers: [AgendaReformaService],
})
export class AgendaReformaModule {}
