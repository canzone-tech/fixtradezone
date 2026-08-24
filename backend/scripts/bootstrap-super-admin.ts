import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { FounderSuperAdminBootstrapService } from '../src/auth/founder-super-admin-bootstrap.service';

const logger = new Logger('FounderSuperAdminBootstrap');

async function bootstrap(): Promise<void> {
  const email = process.argv[2];

  if (!email) {
    throw new Error(
      'Usage: npm run super-admin:bootstrap -- founder@example.com',
    );
  }

  const application = await NestFactory.createApplicationContext(AppModule, {
    logger: ['error', 'warn', 'log'],
  });

  try {
    const service = application.get(FounderSuperAdminBootstrapService);
    const user = await service.bootstrap(email);

    logger.log(`Founder SUPER_ADMIN ready for ${user.email}.`);
  } finally {
    await application.close();
  }
}

bootstrap().catch((error: unknown) => {
  const message =
    error instanceof Error ? error.message : 'Founder bootstrap failed.';

  logger.error(message);
  process.exitCode = 1;
});
