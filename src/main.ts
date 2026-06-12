import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module';
import { Logger, ValidationPipe } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { ConfigService } from '@nestjs/config';
import { PrismaExceptionFilter } from './common/filters/prisma-exception.filter';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create<NestExpressApplication>(AppModule, {
    bufferLogs: true,
  });

  const config = app.get(ConfigService);
  const isProd = config.get<string>('NODE_ENV') === 'production';
  const trustProxy = config.get<string>('TRUST_PROXY');
  if (trustProxy) {
    const parsed =
      trustProxy === 'true'
        ? true
        : /^\d+$/.test(trustProxy)
          ? parseInt(trustProxy, 10)
          : trustProxy.split(',').map((s) => s.trim());
    app.set('trust proxy', parsed);
  }

  app.enableCors({
    origin: config.get<string>('CORS_ORIGIN')?.split(',') ?? [
      'http://localhost:3000', 'http://localhost:3001', 'http://localhost:3333',
    ],
    credentials: true,
  });

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
      transformOptions: { enableImplicitConversion: false },
    }),
  );

  app.useGlobalFilters(new PrismaExceptionFilter());

  app.enableShutdownHooks();

  if (!isProd) {
    const swaggerCfg = new DocumentBuilder()
      .setTitle('Telemedicine API')
      .setDescription('API docs (development only)')
      .setVersion('1.0')
      .addBearerAuth()
      .build();
    const document = SwaggerModule.createDocument(app, swaggerCfg);
    SwaggerModule.setup('api-docs', app, document);
  }

  const port = parseInt(config.get<string>('PORT') ?? '8888', 10);
  const host = config.get<string>('HOST') ?? '127.0.0.1';
  await app.listen(port, host);
  logger.log(`Server running at http://${host}:${port}`);
  if (!isProd) logger.log(`Swagger at http://${host}:${port}/api-docs`);
}
void bootstrap();
