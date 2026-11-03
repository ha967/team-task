import { Controller, Get, NotFoundException } from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { UserService } from './user.service.js';

@Controller('users')
export class UserController {
  constructor(private readonly userService: UserService) {}

  @Get('me')
  async getCurrentUser(@CurrentUser('sub') userId: string) {
    const user = await this.userService.findById(userId);

    if (!user) {
      throw new NotFoundException('用户不存在');
    }

    return user;
  }
}
