import { plainToInstance, Type } from 'class-transformer';
import {
  IsOptional,
  IsString,
  MinLength,
  IsInt,
  validateSync,
} from 'class-validator';

/**
 * 环境变量验证
 * 1. 通过 class-validator 验证环境变量的合法性
 * 2. 通过 class-transformer 将环境变量转换为指定类型
 * 3. 如果验证失败，抛出错误，终止应用启动
 *
 * 转换：请求到达后，先用 class-transformer 的 plainToInstance 把 JSON 数据转成 DTO 类的实例。
 * 验证：随后调用 class-validator 的 validate 方法，根据 DTO 上的装饰器规则进行检查，不通过则报错。
 */
export class EnvironmentVariables {
  @IsString()
  @MinLength(1)
  DATABASE_URL!: string;

  @IsString()
  @MinLength(32, { message: 'JWT_SECRET 至少需要 32 个字符' })
  JWT_SECRET!: string;

  @IsString()
  JWT_ACCESS_TTL!: string;

  @IsString()
  JWT_REFRESH_TTL!: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  PORT?: number;
}

export function validateEnv(config: Record<string, unknown>) {
  const validated = plainToInstance(EnvironmentVariables, config, {
    // 启用隐式类型转换
    enableImplicitConversion: true,
  });
  const errors = validateSync(validated, {
    skipMissingProperties: false,
  });
  if (errors.length > 0) {
    const details = errors
      .map((error) => Object.values(error.constraints || {}).join(', '))
      .join('; ');
    throw new Error(`环境变量验证失败: ${details}`);
  }
  return validated;
}
