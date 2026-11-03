import { BadRequestException, Controller, Get, Headers, NotFoundException } from '@nestjs/common';
import { isUUID } from 'class-validator';
import { UserService } from './user.service.js';

@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  // TODO: 认证模块完成后把 x-user-id 换成 @CurrentUser('sub')
  @Get('me')
  async getCurrentUser(@Headers('x-user-id') userId?: string) {
    if (!userId || !isUUID(userId)) {
      throw new BadRequestException('x-user-id 必须是合法的 UUID');
    }

    const user = await this.userService.findById(userId);

    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    return user;
  }
}
