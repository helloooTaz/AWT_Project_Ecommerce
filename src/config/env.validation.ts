import Joi from 'joi';

export interface Environment {
  DATABASE_URL: string;
  JWT_SECRET: string;
  PORT: number;
  SWAGGER_ENABLED: boolean;
  PAYMENT_PROVIDER: 'DISABLED' | 'MOCK';
  MOCK_PAYMENT_SIGNING_SECRET?: string;
}

const databaseUrlSchema = Joi.string()
  .uri({ scheme: ['postgres', 'postgresql'] })
  .required();

const schema = Joi.object<Environment>({
  DATABASE_URL: databaseUrlSchema,
  JWT_SECRET: Joi.string().trim().min(32).required(),
  PORT: Joi.number().integer().min(1).max(65535).default(3000),
  SWAGGER_ENABLED: Joi.boolean().default(true),
  PAYMENT_PROVIDER: Joi.string().valid('DISABLED', 'MOCK').default('DISABLED'),
  MOCK_PAYMENT_SIGNING_SECRET: Joi.when('PAYMENT_PROVIDER', {
    is: 'MOCK',
    then: Joi.string().trim().min(32).invalid(Joi.ref('JWT_SECRET')).required(),
    otherwise: Joi.string().allow(''),
  }),
});

export function validateDatabaseUrl(value: unknown): string {
  const result = databaseUrlSchema.validate(value);
  if (result.error) {
    throw new Error('Invalid environment configuration: DATABASE_URL');
  }
  return result.value;
}

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
