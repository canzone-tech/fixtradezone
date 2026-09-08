import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaMariaDb } from '@prisma/adapter-mariadb';
import { PrismaClient } from '../generated/prisma/client';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  constructor() {
    const adapter = new PrismaMariaDb({
      host: process.env.MYSQL_HOST ?? '127.0.0.1',
      port: Number(process.env.MYSQL_PORT ?? 3306),
      user: process.env.MYSQL_USER,
      password: process.env.MYSQL_PASSWORD,
      database: process.env.MYSQL_DATABASE,
      // FixTradeZone stores absolute operational/financial timestamps in UTC.
      // The SUPER_ADMIN platform timezone is a display/scheduling policy only.
      // Pinning every application DB session to UTC also makes DB defaults and
      // raw CURRENT_TIMESTAMP expressions independent of the host/server zone.
      timezone: '+00:00',
      allowPublicKeyRetrieval: true,
      connectionLimit: 10,
      connectTimeout: 5000,
      acquireTimeout: 10000,
    });

    super({ adapter });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }
}
