import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { RequestLoggingMiddleware } from './common/middleware/request-logging.middleware';
import { createRequestValidationPipe } from './common/pipes/request-validation.pipe';

export function configureApp(
  app: INestApplication,
  swaggerEnabled: boolean,
): void {
  // Nest registers its body parsers during init, so mount this before parsing and Swagger.
  const requestLogging = app.get(RequestLoggingMiddleware);
  app.use(requestLogging.use.bind(requestLogging));

  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(createRequestValidationPipe());
  app.useGlobalFilters(new HttpExceptionFilter());

  if (swaggerEnabled) {
    const options = new DocumentBuilder()
      .setTitle('THREAD Commerce API')
      .setVersion('1.0')
      .addBearerAuth()
      .build();

    SwaggerModule.setup('api/docs', app, () =>
      SwaggerModule.createDocument(app, options),
    );
  }
}
