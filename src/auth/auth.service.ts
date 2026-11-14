import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, type JwtSignOptions } from '@nestjs/jwt';
import bcrypt from 'bcryptjs';
import { createHash, randomUUID } from 'node:crypto';
import { JwtPayload } from '../common/types/jwt-payload.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { UserService } from '../user/user.service.js';
import { LoginDto } from './dto/login.dto.js';
import { RefreshTokenDto } from './dto/refresh-token.dto.js';
import { RegisterDto } from './dto/register.dto.js';

@Injectable()
export class AuthService {
    private readonly refreshTtl: JwtSignOptions['expiresIn'];

    constructor(
        private readonly userService: UserService,
        private readonly jwtService: JwtService,
        private readonly configService: ConfigService,
        private readonly prismaService: PrismaService,
    ) {
        this.refreshTtl = this.configService.getOrThrow<string>(
            'JWT_REFRESH_TTL',
        ) as JwtSignOptions['expiresIn'];
    }

    async register(dto: RegisterDto) {
        const user = await this.userService.create({
            email: dto.email,
            username: dto.username,
            password: dto.password,
        });

        return { user, ...(await this.issueTokenPair(user.id)) };
    }

    async login(dto: LoginDto) {
        const user = await this.userService.findByEmailWithPassword(dto.email);

        // 用户不存在和密码错误返回同一个错误，避免账号枚举
        if (!user || !(await bcrypt.compare(dto.password, user.passwordHash))) {
            throw new UnauthorizedException('邮箱或密码错误');
        }

        return {
            user: {
                id: user.id,
                username: user.username,
                email: user.email,
                avatarUrl: user.avatarUrl,
                createdAt: user.createdAt,
            },
            ...(await this.issueTokenPair(user.id)),
        };
    }

    async refresh(dto: RefreshTokenDto) {
        const payload = await this.verifyRefreshToken(dto.refreshToken);
        const tokenHash = hashToken(dto.refreshToken);

        const stored = await this.prismaService.refreshToken.findUnique({
            where: { tokenHash },
        });

        if (!stored || stored.userId !== payload.sub) {
            throw new UnauthorizedException('刷新令牌无效或已过期');
        }

        // 已撤销的令牌被再次使用，往往意味着令牌泄露：
        // 撤销该用户所有活跃令牌，强制所有设备重新登录
        if (stored.revokedAt) {
            await this.revokeAllTokens(stored.userId);
            throw new UnauthorizedException('刷新令牌已失效，请重新登录');
        }

        if (stored.expiresAt.getTime() <= Date.now()) {
            throw new UnauthorizedException('刷新令牌无效或已过期');
        }

        // 轮换：条件更新保证并发请求中只有一个能成功消费旧令牌
        const revoked = await this.prismaService.refreshToken.updateMany({
            where: { id: stored.id, revokedAt: null },
            data: { revokedAt: new Date() },
        });

        if (revoked.count === 0) {
            await this.revokeAllTokens(stored.userId);
            throw new UnauthorizedException('刷新令牌已失效，请重新登录');
        }

        return this.issueTokenPair(payload.sub);
    }

    async logout(dto: RefreshTokenDto) {
        // 登出是幂等的：令牌不存在或已撤销也返回成功，避免暴露令牌是否有效
        await this.prismaService.refreshToken.updateMany({
            where: {
                tokenHash: hashToken(dto.refreshToken),
                revokedAt: null,
            },
            data: { revokedAt: new Date() },
        });

        return { success: true };
    }

    private async issueTokenPair(userId: string) {
        const [accessToken, refreshToken] = await Promise.all([
            this.issueAccessToken(userId),
            this.issueRefreshToken(userId),
        ]);

        return { accessToken, refreshToken };
    }

    private async issueAccessToken(userId: string) {
        const payload: JwtPayload = { sub: userId, typ: 'access' };
        return this.jwtService.signAsync(payload);
    }

    private async issueRefreshToken(userId: string) {
        const payload: JwtPayload = {
            sub: userId,
            typ: 'refresh',
            // 同一秒内为同一用户签发多个 refresh token 时，避免 JWT 内容完全相同
            jti: randomUUID(),
        };

        const token = await this.jwtService.signAsync(payload, {
            expiresIn: this.refreshTtl,
        });

        // 从 JWT 里读出 exp，保证数据库记录和令牌的实际过期时间一致
        const decoded = this.jwtService.decode<JwtPayload>(token);
        const expiresAt = new Date((decoded.exp ?? 0) * 1000);

        // 顺手清理该用户已过期的记录，避免表无限增长
        await this.prismaService.refreshToken.deleteMany({
            where: { userId, expiresAt: { lt: new Date() } },
        });

        await this.prismaService.refreshToken.create({
            data: {
                userId,
                tokenHash: hashToken(token),
                expiresAt,
            },
        });

        return token;
    }

    private async verifyRefreshToken(token: string) {
        try {
            const payload = await this.jwtService.verifyAsync<JwtPayload>(token);

            if (payload.typ !== 'refresh' || !payload.sub) {
                throw new Error('wrong token type');
            }

            return payload;
        } catch {
            throw new UnauthorizedException('刷新令牌无效或已过期');
        }
    }

    private async revokeAllTokens(userId: string) {
        await this.prismaService.refreshToken.updateMany({
            where: { userId, revokedAt: null },
            data: { revokedAt: new Date() },
        });
    }
}

// refresh token 本身是 256 位随机量，用 SHA-256 足够；bcrypt 在这里只会白白增加延迟
function hashToken(token: string) {
    return createHash('sha256').update(token).digest('hex');
}
