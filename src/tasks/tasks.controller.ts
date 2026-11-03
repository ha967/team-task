import {
  Body,
  Param,
  Headers,
  Controller,
  Get,
  Post,
  Query,
  Patch,
  Delete,
} from '@nestjs/common';
import { TasksService } from './tasks.service.js';
import { ListTasksQueryDto } from './dto/list-tasks-query.dto.js';
import { CreateTaskDto } from './dto/create-task.dto.js';
import { UpdateTaskDto } from './dto/update-task.dto.js';

@Controller('tasks')
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Get()
  getTasks(@Query() query: ListTasksQueryDto) {
    return this.tasksService.getTasks(query);
  }

  @Post()
  addTask(@Headers('x-user-id') userId: string, @Body() body: CreateTaskDto) {
    return this.tasksService.addTask(userId, body);
  }

  @Patch(':taskId')
  updateTask(
    @Headers('x-user-id') userId: string,
    @Param('taskId') id: string,
    @Body() body: UpdateTaskDto,
  ) {
    return this.tasksService.updateTask(userId, id, body);
  }

  @Delete(':taskId')
  deleteTask(
    @Headers('x-user-id') userId: string,
    @Param('taskId') id: string,
  ) {
    return this.tasksService.deleteTask(userId, id);
  }
}
