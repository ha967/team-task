import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

export class CreateTeamDto {
  // 长度对齐 prisma schema 里 Team.name 的 VarChar(64)
  @IsString()
  @MinLength(1)
  @MaxLength(64)
  name!: string;

  @IsOptional()
  @IsString()
  @MaxLength(500)
  description?: string;
}
