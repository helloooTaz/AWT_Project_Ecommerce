import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { HttpExceptionFilter } from './common/filters/http-exception.filter';
import { createRequestValidationPipe } from './common/pipes/request-validation.pipe';

export function configureApp(
  app: INestApplication,
  swaggerEnabled: boolean,
): void {
  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(createRequestValidationPipe());
  app.useGlobalFilters(new HttpExceptionFilter());

  if (swaggerEnabled) {
    const options = new DocumentBuilder()
      .setTitle('THREAD Commerce API')
      .setDescription('Single-brand fashion commerce REST API')
      .setVersion('1.0')
      .addBearerAuth(
        {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description:
            'Enter your signed JWT access token (obtainable from POST /api/v1/auth/login)',
        },
        'bearer',
      )
      .build();

    SwaggerModule.setup('api/docs', app, () =>
      SwaggerModule.createDocument(app, options),
    );
  }
}
