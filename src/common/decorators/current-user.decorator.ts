import { createParamDecorator, ExecutionContext } from '@nestjs/common';
import type { JwtPayload } from '../types/jwt-payload.js';

// 创建一个参数装饰器 @CurrentUser()，用于在控制器方法中获取当前登录用户的 JWT payload。
// 用法：
//   @CurrentUser() user: JwtPayload        → 整个 payload
//   @CurrentUser('sub') userId: string     → 只取用户 ID
export const CurrentUser = createParamDecorator(
  (data: keyof JwtPayload | undefined, ctx: ExecutionContext) => {
    const request = ctx.switchToHttp().getRequest<{ user?: JwtPayload }>();
    const user = request.user;

    return data ? user?.[data] : user;
  },
);
