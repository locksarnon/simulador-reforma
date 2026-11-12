import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthService } from './auth.service';
import { AuthController } from './auth.controller';
import { JwtStrategy } from './strategies/jwt.strategy';
import { AcessosModule } from '../acessos/acessos.module';
import { UsuariosModule } from '../usuarios/usuarios.module';

@Module({
  imports: [PassportModule.register({ defaultStrategy: 'jwt' }), JwtModule.register({}), AcessosModule, UsuariosModule],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AuthModule {}
