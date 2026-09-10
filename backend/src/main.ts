import { ValidationPipe } from '@nestjs/common';
import { NestFactory, Reflector } from '@nestjs/core';
import {
  json,
  urlencoded,
  type NextFunction,
  type Request,
  type Response,
} from 'express';
import { AppModule } from './app.module';
import { JwtAuthGuard } from './auth/jwt-auth.guard';
import { PermissionsGuard } from './auth/permissions.guard';
import { SecurityConfigService } from './security-config/security-config.service';

function applySecurityHeaders(
  _request: Request,
  response: Response,
  next: NextFunction,
): void {
  response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
  response.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
  response.setHeader(
    'Permissions-Policy',
    'camera=(), microphone=(), geolocation=()',
  );
  response.setHeader('Referrer-Policy', 'no-referrer');
  response.setHeader('X-Content-Type-Options', 'nosniff');
  response.setHeader('X-Frame-Options', 'DENY');

  if (process.env.NODE_ENV === 'production') {
    response.setHeader(
      'Strict-Transport-Security',
      'max-age=63072000; includeSubDomains; preload',
    );
  }

  next();
}

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  const expressApp = app.getHttpAdapter().getInstance() as {
    disable(name: string): void;
    set(name: string, value: string | boolean): void;
  };

  // QR images are capped at 256 KiB in the admin UI and 360,000 characters
  // after base64 encoding in the DTO. Keep the transport limit bounded but
  // large enough for a valid QR payload to reach validation.
  app.use(json({ limit: '512kb' }));
  app.use(urlencoded({ limit: '512kb', extended: true }));

  expressApp.disable('x-powered-by');

  const trustProxy = process.env.TRUST_PROXY?.trim() || 'loopback';
  expressApp.set('trust proxy', trustProxy === 'false' ? false : trustProxy);

  app.use(applySecurityHeaders);
  app.enableShutdownHooks();

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
