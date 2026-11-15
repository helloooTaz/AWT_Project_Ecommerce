import Joi from 'joi';

export interface Environment {
  DATABASE_URL: string;
  PORT: number;
  SWAGGER_ENABLED: boolean;
  JWT_SECRET: string;
}

const schema = Joi.object<Environment>({
  DATABASE_URL: Joi.string()
    .uri({ scheme: ['postgres', 'postgresql'] })
    .required(),
  PORT: Joi.number().integer().min(1).max(65535).default(3000),
  SWAGGER_ENABLED: Joi.boolean().default(true),
  JWT_SECRET: Joi.string().min(32).required(),
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
