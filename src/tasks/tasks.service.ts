import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Injectable()
export class TasksService {
    constructor(private readonly prismaService: PrismaService) { }
    getTasks() {
        const tasks = this.prismaService.task.findMany();
        console.log('tasks', tasks);
        return tasks;
    }

}