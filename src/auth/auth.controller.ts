import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { Public } from '../common/decorators/public.decorator.js';
import { AuthService } from './auth.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshTokenDto } from './dto/refresh-token.dto.js';
import { RegisterDto } from './dto/register.dto.js';

@Public()
@Controller('auth')
export class AuthController {
    constructor(private readonly authService: AuthService) {}

    @Post('register')
    register(@Body() dto: RegisterDto) {
        return this.authService.register(dto);
    }

    // 登录是"读取"语义，用 200 比默认的 201 更符合 REST 习惯
    @Post('login')
    @HttpCode(200)
    login(@Body() dto: LoginDto) {
        return this.authService.login(dto);
    }

    // 用 refresh token 换一对新令牌；会撤销旧的 refresh token（轮换）
    @Post('refresh')
    @HttpCode(200)
    refresh(@Body() dto: RefreshTokenDto) {
        return this.authService.refresh(dto);
    }

    // 撤销当前 refresh token。access token 在过期前仍然有效，这是 JWT 的固有特性
    @Post('logout')
    @HttpCode(200)
    logout(@Body() dto: RefreshTokenDto) {
        return this.authService.logout(dto);
    }
}
