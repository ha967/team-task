import { Transform } from 'class-transformer';
import { IsEmail, IsString, MaxLength } from 'class-validator';

export class InviteTeamMemberDto {
  // 邮箱统一 trim + 小写后再校验/查询：唯一索引大小写敏感，
  // UserService.findByEmail 内部也会 normalize；这里先做是为了让带空格的输入也能通过校验。
  @Transform(({ value }) =>
    typeof value === 'string' ? value.trim().toLowerCase() : value,
  )
  @IsString()
  @IsEmail()
  @MaxLength(255)
  email!: string;
}
