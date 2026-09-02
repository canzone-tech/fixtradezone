import { ValidationPipe } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import { AppModule } from './app.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { PermissionsGuard } from './auth/permissions.guard';
import { SecurityConfigService } from './security-config/security-config.service';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      transformOptions: {
        enableImplicitConversion: false,
      },
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
      validationError: {
        target: false,
        value: false,
      },
    }),
  );

  const reflector = app.get(Reflector);

  const securityConfigService = app.get(SecurityConfigService);

  app.useGlobalGuards(
    new JwtAuthGuard(reflector, securityConfigService),
    new PermissionsGuard(reflector),
  );

  await app.listen(process.env.PORT ?? 3000);
}

void bootstrap();
