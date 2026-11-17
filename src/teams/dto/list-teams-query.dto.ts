import { Type } from 'class-transformer';
import {
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ListTeamsQueryDto {
  // 团队名模糊搜索。长度对齐 prisma schema 里 Team.name 的 VarChar(64)；
  // 注意 @IsOptional() 必须配一个真正的校验装饰器，只挂 @IsOptional() 等于完全不校验。
  @IsOptional()
  @IsString()
  @MaxLength(64)
  teamName?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page: number = 1;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize: number = 20;
}
