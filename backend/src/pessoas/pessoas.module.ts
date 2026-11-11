import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { PessoasController } from './pessoas.controller';
import { PessoasService } from './pessoas.service';

@Module({
  imports: [StorageModule],
  controllers: [PessoasController],
  providers: [PessoasService],
})
export class PessoasModule {}
