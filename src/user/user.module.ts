import { Module } from '@nestjs/common';
import { UserService } from './user.service.js';
import { UserController } from './user.controller.js';
import { PrismaModule } from '../prisma/prisma.module.js';

@Module({
    providers: [UserService],
    controllers: [UserController],
    exports: [UserService],
    imports: [PrismaModule],
})
export class UserModule {}
