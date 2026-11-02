import { Body, Request, Controller, Get, Post } from '@nestjs/common';
import { TasksService } from './tasks.service.js';


@Controller('tasks')
export class TasksController {
    constructor(private readonly tasksService: TasksService) { };

    @Get()
    getTasks() {
        return this.tasksService.getTasks();
    }

    @Post()
    addTask(@Request() req: Request, @Body() body: any) {
        return "1";
    }
}