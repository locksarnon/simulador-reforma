import { Module } from '@nestjs/common';
import { ValidadorNfseController } from './validador-nfse.controller';
import { ValidadorNfseService } from './validador-nfse.service';

@Module({
  controllers: [ValidadorNfseController],
  providers: [ValidadorNfseService],
})
export class ValidadorNfseModule {}
