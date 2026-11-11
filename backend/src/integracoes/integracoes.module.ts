import { Controller, ForbiddenException, Get, Module } from '@nestjs/common';
import { AuthUser } from '../auth/auth.types';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { StorageModule } from '../storage/storage.module';
import { IntegracoesService } from './integracoes.service';

/** Administração > Integrações: só administradores. */
@Controller('integracoes')
export class IntegracoesController {
  constructor(private readonly integracoes: IntegracoesService) {}

  @Get()
  estado(@CurrentUser() user: AuthUser) {
    if (user.role !== 'admin') throw new ForbiddenException('Somente administradores');
    return this.integracoes.estado();
  }
}

@Module({
  imports: [StorageModule],
  controllers: [IntegracoesController],
  providers: [IntegracoesService],
})
export class IntegracoesModule {}
