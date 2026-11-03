import { Injectable } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';
import { ConfigService } from '@nestjs/config';

@Injectable()
export class PrismaService extends PrismaClient {
    constructor(config: ConfigService) {
        super({
            adapter: new PrismaPg({
                connectionString: config.getOrThrow<string>('DATABASE_URL'),
            }),
        });
    }

    onModuleInit() {
        return this.$connect();
    }

    onModuleDestroy() {
        return this.$disconnect();
    }
}
