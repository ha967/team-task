import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { CreateTaskDto } from './dto/create-task.dto.js';
import { ListTasksQueryDto } from './dto/list-tasks-query.dto.js';
import { UpdateTaskDto } from './dto/update-task.dto.js';
import { TasksService } from './tasks.service.js';

@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get()
  getTasks(
    @Query() query: ListTasksQueryDto,
    @CurrentUser('sub') userId: string,
  ) {
    return this.tasksService.getTasks(query, userId);
  }

  @Post()
  addTask(@CurrentUser('sub') userId: string, @Body() body: CreateTaskDto) {
    return this.tasksService.addTask(userId, body);
  }
  // ParseUUIDPipe会判断非法 UUID 直接返回 400, 而不是让 Prisma 抛 500
  @Patch(':taskId')
  updateTask(
    @CurrentUser('sub') userId: string,
    @Param('taskId', ParseUUIDPipe) id: string,
    @Body() body: UpdateTaskDto,
  ) {
    return this.tasksService.updateTask(userId, id, body);
  }

  @Delete(':taskId')
  deleteTask(
    @CurrentUser('sub') userId: string,
    @Param('taskId', ParseUUIDPipe) id: string,
  ) {
    return this.tasksService.deleteTask(userId, id);
  }
}
