import 'reflect-metadata';
import { Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { configureApp } from './app.setup';
import { env } from './config/env';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  configureApp(app);
  await app.listen(env().PORT);
  Logger.log(`Hostly API listening on :${env().PORT}`, 'Bootstrap');
}

void bootstrap();
