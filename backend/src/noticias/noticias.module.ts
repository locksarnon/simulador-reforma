import { Module } from '@nestjs/common';
import { NoticiasController } from './noticias.controller';
import { NoticiasService } from './noticias.service';

@Module({
  controllers: [NoticiasController],
  providers: [NoticiasService],
})
export class NoticiasModule {}
