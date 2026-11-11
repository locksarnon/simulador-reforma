import { Module } from '@nestjs/common';
import { NotificacoesModule } from '../notificacoes/notificacoes.module';
import { AgendaGeralController } from './agenda-geral.controller';
import { AgendaGeralService } from './agenda-geral.service';

@Module({
  imports: [NotificacoesModule],
  controllers: [AgendaGeralController],
  providers: [AgendaGeralService],
  exports: [AgendaGeralService],
})
export class AgendaGeralModule {}
