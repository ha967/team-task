import { IsEmail, IsString, Length, Matches, MaxLength, MinLength } from 'class-validator';

export class RegisterDto {
  @IsEmail()
  @MaxLength(255)
  email!: string;

  @IsString()
  @Length(3, 32)
  @Matches(/^[a-zA-Z0-9_]+$/, { message: '用户名只能包含字母、数字和下划线' })
  username!: string;

  // bcrypt 只处理前 72 字节，超出的部分会被静默忽略
  @IsString()
  @MinLength(8)
  @MaxLength(72)
  password!: string;
}
