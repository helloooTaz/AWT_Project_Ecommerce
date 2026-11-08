import { BadRequestException, ValidationPipe } from '@nestjs/common';
import type { ValidationError } from 'class-validator';

interface FieldError {
  field: string;
  message: string;
}

export class RequestValidationException extends BadRequestException {
  constructor(readonly details: FieldError[]) {
    super('Validation failed');
  }
}

function fieldErrors(errors: ValidationError[], parent = ''): FieldError[] {
  return errors.flatMap(({ property, constraints, children }) => {
    const field = [parent, property].filter(Boolean).join('.') || 'body';
    const ownErrors = Object.values(constraints ?? {}).map((message) => ({
      field,
      message,
    }));

    return [...ownErrors, ...fieldErrors(children ?? [], field)];
  });
}

export function createRequestValidationPipe(): ValidationPipe {
  return new ValidationPipe({
    transform: true,
    whitelist: true,
    forbidNonWhitelisted: true,
    validationError: { target: false, value: false },
    exceptionFactory: (errors) =>
      new RequestValidationException(fieldErrors(errors)),
  });
}
