import { IsEmail, IsString, MaxLength, MinLength } from 'class-validator';

export class LoginDto {
  @IsEmail()
  @MaxLength(255)
  email!: string;

  // 登录不校验密码复杂度，只校验非空：避免泄露密码策略，也兼容历史账号
  @IsString()
  @MinLength(1)
  @MaxLength(72)
  password!: string;
}
