import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { UserService } from '../user/user.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { JwtPayload } from './types/jwt-payload.js';

@Injectable()
export class AuthService {
    constructor(
        private readonly userService: UserService,
        private readonly jwtService: JwtService,
    ) {}

    async register(dto: RegisterDto) {
        const user = await this.userService.create({
            email: dto.email,
            username: dto.username,
            password: dto.password,
        });

        const accessToken = await this.issueAccessToken(user.id);

        return { user, accessToken };
    }

    async login(dto: LoginDto) {
        const user = await this.userService.findByEmailWithPassword(dto.email);

        // 用户不存在和密码错误返回同一个错误，避免账号枚举
        if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
            throw new UnauthorizedException('邮箱或密码错误');
        }

        const accessToken = await this.issueAccessToken(user.id);

        return {
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                avatarUrl: user.avatarUrl,
                createdAt: user.createdAt,
            },
            accessToken,
        };
    }

    // 颁发访问令牌
    private async issueAccessToken(userId: string) {
        const payload: JwtPayload = { sub: userId };
        return this.jwtService.signAsync(payload);
    }
}
