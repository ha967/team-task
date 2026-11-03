import {
    CanActivate,
    ExecutionContext,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { JwtService } from '@nestjs/jwt';
import type { Request } from 'express';
import { IS_PUBLIC_KEY } from '../../common/decorators/public.decorator.js';
import type { JwtPayload } from '../../common/types/jwt-payload.js';

interface AuthenticatedRequest extends Request {
    user?: JwtPayload;
}

@Injectable()
export class JwtAuthGuard implements CanActivate {
    constructor(
        private readonly reflector: Reflector,
        private readonly jwtService: JwtService,
    ) {}

    async canActivate(context: ExecutionContext): Promise<boolean> {
        // 全局守卫会对每个请求生效，这里先看有没有 @Public() 标记
        const isPublic = this.reflector.getAllAndOverride<boolean>(
            IS_PUBLIC_KEY,
            [context.getHandler(), context.getClass()],
        );

        if (isPublic) {
            return true;
        }

        const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
        const token = extractBearerToken(request.headers.authorization);

        if (!token) {
            throw new UnauthorizedException('缺少访问令牌');
        }

        try {
            // 验签 + 校验过期时间，失败会抛错，统一转成 401
            request.user = await this.jwtService.verifyAsync<JwtPayload>(token);
        } catch {
            throw new UnauthorizedException('访问令牌无效或已过期');
        }

        return true;
    }
}

function extractBearerToken(header?: string) {
    if (!header) {
        return null;
    }

    const [scheme, token] = header.split(' ');

    if (scheme?.toLowerCase() !== 'bearer' || !token) {
        return null;
    }

    return token;
}
