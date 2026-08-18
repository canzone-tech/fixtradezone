// Prisma CLI configuration. Runtime connections use PrismaService and the
// MariaDB adapter; the CLI uses DATABASE_URL for generate/deploy operations.
import 'dotenv/config';
import { defineConfig, env } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',

  migrations: {
    path: 'prisma/migrations',
  },

  datasource: {
    url: env('DATABASE_URL'),
  },
});

