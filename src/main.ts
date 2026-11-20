import 'reflect-metadata';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import type { AppEnvironment } from './config/environment';
import { configureApp } from './configure-app';

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule, { abortOnError: false });
  configureApp(app);
  app.enableShutdownHooks();

  const config = app.get<ConfigService<AppEnvironment, true>>(ConfigService);
  await app.listen(
    config.getOrThrow('PORT', { infer: true }),
    config.getOrThrow('HOST', { infer: true }),
  );
}

void bootstrap().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Minimal THREAD failed to start.');
  process.exitCode = 1;
});
