import { Type } from 'class-transformer';
import { IsDate, IsEnum, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength } from 'class-validator';
import { TaskStatus } from '../../generated/prisma/enums.js';

export class CreateTaskDto {
  @IsUUID()
  teamId!: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title!: string;

  @IsOptional()
  @IsString()
  @MaxLength(5000)
  description?: string;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1000)
  estimateHours?: number;

  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(3)
  priority?: number;

  @IsOptional()
  @IsUUID()
  assigneeId?: string;

  @IsOptional()
  @IsEnum(TaskStatus)
  status?: TaskStatus;

  @IsOptional()
  @Type(() => Date)
  @IsDate()
  dueAt?: Date;
}
