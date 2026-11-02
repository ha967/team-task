import { Module } from '@nestjs/common';
import { TasksController } from './tasks.controller.js';
import { TasksService } from './tasks.service.js';
import { PrismaModule } from '../prisma/prisma.module.js';

@Module({
    controllers: [TasksController],
    providers: [TasksService],
    imports: [PrismaModule],
})
export class TasksModule { };