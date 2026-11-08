import Joi from 'joi';

export interface Environment {
  DATABASE_URL: string;
  PORT: number;
  SWAGGER_ENABLED: boolean;
}

const schema = Joi.object<Environment>({
  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgres', 'postgresql'] })
    .required(),
  PORT: Joi.number().integer().min(1).max(65535).default(3000),
  SWAGGER_ENABLED: Joi.boolean().default(true),
});

export function validateEnvironment(
  environment: Record<string, unknown>,
): Environment {
  const result = schema.validate(environment, {
    abortEarly: false,
    allowUnknown: true,
  });

  if (result.error) {
    const keys = result.error.details.map(({ path }) => path.join('.'));
    throw new Error(`Invalid environment configuration: ${keys.join(', ')}`);
  }

  return result.value;
}
