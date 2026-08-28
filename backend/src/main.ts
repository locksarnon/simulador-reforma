import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { cors: false });
  const config = app.get(ConfigService);

  const prefix = config.get<string>('API_PREFIX', 'api/v1');
  app.setGlobalPrefix(prefix);

  const origins = (config.get<string>('CORS_ORIGINS') ?? 'http://localhost:5175')
    .split(',')
    .map((o) => o.trim())
    .filter(Boolean);

  app.enableCors({
    origin: origins,
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization'],
  });

  app.use(helmet({ crossOriginResourcePolicy: false }));

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: false, transform: true }));
  app.useGlobalFilters(new AllExceptionsFilter());

  const port = Number(config.get('API_PORT') ?? 3003);
  await app.listen(port);
  // eslint-disable-next-line no-console
  console.log(`Simulador Reforma API listening on http://localhost:${port}/${prefix}`);
}

bootstrap();
