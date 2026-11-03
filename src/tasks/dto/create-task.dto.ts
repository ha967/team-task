import { Type } from 'class-transformer';
import {
    IsDate,
    IsEnum,
    IsInt,
    IsOptional,
    IsString,
    IsUUID,
    Max,
    MaxLength,
    Min,
    MinLength,
} from 'class-validator';
import { TaskStatus } from '../../generated/prisma/enums.js';

export class CreateTaskDto {
    // !: 明确赋值断言。在 TypeScript 的严格模式下，如果声明了一个类属性但没有在构造函数或声明时直接赋值，编译器会报错，避免忘了初始化。!: 是用来消除这种报错的。
    @IsUUID()
    teamId!: string;

    @IsString()
    @MinLength(1)
    @MaxLength(200)
    title!: string;

    // ?:可选属性标记（Optional Property），用在接口、类型字面量或类属性声明中，表示“这个属性可以存在，也可以不存在”。
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
