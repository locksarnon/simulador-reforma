import { Body, Controller, Get, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { Public } from '../common/decorators/public.decorator';
import { CurrentUser } from '../common/decorators/current-user.decorator';
import { AuthService } from './auth.service';
import {
  LoginDto,
  RefreshDto,
  RegisterDto,
  ResetPasswordDto,
  ResetPasswordRequestDto,
} from './dto/auth.dto';
import { AuthUser } from './auth.types';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('register')
  register(@Body() dto: RegisterDto, @Req() req: Request) {
    return this.auth.register(dto, { ip: req.ip, userAgent: req.headers['user-agent'] });
  }

  @Public()
  @Post('login')
  login(@Body() dto: LoginDto, @Req() req: Request) {
    return this.auth.login(dto, { ip: req.ip, userAgent: req.headers['user-agent'] });
  }

  @Public()
  @Post('refresh')
  refresh(@Body() dto: RefreshDto, @Req() req: Request) {
    return this.auth.refresh(dto.refreshToken, { ip: req.ip, userAgent: req.headers['user-agent'] });
  }

  @Public()
  @Post('reset-password-request')
  resetPasswordRequest(@Body() dto: ResetPasswordRequestDto) {
    return this.auth.resetPasswordRequest(dto);
  }

  @Public()
  @Post('reset-password')
  resetPassword(@Body() dto: ResetPasswordDto) {
    return this.auth.resetPassword(dto);
  }

  @Post('logout')
  logout(@CurrentUser() user: AuthUser, @Body() body: Partial<RefreshDto>) {
    return this.auth.logout(user.id, body?.refreshToken);
  }

  @Get('me')
  me(@CurrentUser() user: AuthUser) {
    return this.auth.me(user);
  }
}
