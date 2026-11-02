import 'dotenv/config';
import { NestFactory } from '@nestjs/core';
import { AppModule, ObserveInstrument } from './app.module.js';
import { VersioningType } from '@nestjs/common/enums/index.js';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    instrument: ObserveInstrument,
    abortOnError: false,
  });
  // 通过URI上的v1/v2 走不同的接口
  app.enableVersioning({
    type: VersioningType.URI
  });
  await app.listen(process.env.PORT ?? 3000);
  app.enableShutdownHooks();
}
await bootstrap();
