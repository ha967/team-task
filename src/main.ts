import { NestFactory } from '@nestjs/core';
import { AppModule, ObserveInstrument } from './app.module.js';
import { VersioningType } from '@nestjs/common/enums/index.js';
import { ValidationPipe } from '@nestjs/common/pipes/index.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    instrument: ObserveInstrument,
    abortOnError: false,
  });
  // 前端统一通过 /api 访问后端，开发环境由 Vite 代理转发
  app.setGlobalPrefix('api');
  // 通过URI上的v1/v2 走不同的接口
  app.enableVersioning({ type: VersioningType.URI });
  app.useGlobalPipes(
    new ValidationPipe({
      // 按 DTO 类型转换并实例化
      transform: true,
      // 剥掉 DTO 没声明的字段
      whitelist: true,
      // 有未声明字段就返回 400
      forbidNonWhitelisted: true,
    }),
  );
  app.enableShutdownHooks();
  // 端口来自根目录 .env 的 PORT；默认 3001，避免和其他项目的 3000 端口冲突
  await app.listen(process.env.PORT ?? 3001);
}
await bootstrap();
