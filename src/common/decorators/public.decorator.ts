import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'isPublic';

// 标记某个 controller / 路由不需要登录。
// 默认所有接口都需要认证（deny by default），只有显式标记的才放行。
// 用法：
//   @Public() class AuthController { ... }  → 整个 controller 放行
//   @Public() @Get('login') login() { ... } → 某个路由放行
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
