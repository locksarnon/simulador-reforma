import { Module } from '@nestjs/common';
import { StorageModule } from '../storage/storage.module';
import { LimpezaController } from './limpeza.controller';
import { LimpezaService } from './limpeza.service';

@Module({
  imports: [StorageModule],
  controllers: [LimpezaController],
  providers: [LimpezaService],
})
export class LimpezaModule {}
