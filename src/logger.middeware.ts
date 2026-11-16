import { Injectable, NestMiddleware } from '@nestjs/common';

/**
 * 示例中间件
 */
@Injectable()
export class LoggerMiddleware implements NestMiddleware {
  use(req: any, res: any, next: () => void) {
    console.log(`Request... ${req.method} ${req.originalUrl}`);
    // res.send('我被拦截了');
    next();
  }
}
