import { randomBytes } from 'node:crypto';
import { validateDatabaseUrl, validateEnvironment } from './env.validation';

const DATABASE_URL = 'postgresql://localhost/thread';
const JWT_SECRET = randomBytes(32).toString('hex');

describe('environment configuration', () => {
  it('sets defaults and converts environment strings', () => {
    expect(validateEnvironment({ DATABASE_URL, JWT_SECRET })).toMatchObject({
      DATABASE_URL,
      PORT: 3000,
      SWAGGER_ENABLED: true,
      PAYMENT_PROVIDER: 'DISABLED',
    });
    expect(
      validateEnvironment({
        DATABASE_URL,
        JWT_SECRET,
        PORT: '3001',
        SWAGGER_ENABLED: 'false',
      }),
    ).toMatchObject({ PORT: 3001, SWAGGER_ENABLED: false });
  });

  it('requires a PostgreSQL URL and rejects invalid settings', () => {
    expect(() => validateEnvironment({})).toThrow('DATABASE_URL');
    expect(() =>
      validateEnvironment({
        DATABASE_URL: 'https://localhost',
        JWT_SECRET,
        PORT: '70000',
      }),
    ).toThrow('Invalid environment configuration: DATABASE_URL, PORT');
  });

  it('requires a sufficiently long JWT secret for application startup', () => {
    expect(() => validateEnvironment({ DATABASE_URL })).toThrow('JWT_SECRET');
    expect(() =>
      validateEnvironment({ DATABASE_URL, JWT_SECRET: 'short' }),
    ).toThrow('JWT_SECRET');
  });

  it('validates the database URL independently for the migration CLI', () => {
    expect(validateDatabaseUrl(DATABASE_URL)).toBe(DATABASE_URL);
    expect(() => validateDatabaseUrl(undefined)).toThrow('DATABASE_URL');
  });

  it('requires an explicit mock mode and a separate signing secret', () => {
    const environment = { DATABASE_URL, JWT_SECRET, PAYMENT_PROVIDER: 'MOCK' };
    const secret = randomBytes(32).toString('hex');
    expect(
      validateEnvironment({
        ...environment,
        MOCK_PAYMENT_SIGNING_SECRET: secret,
      }),
    ).toMatchObject({ PAYMENT_PROVIDER: 'MOCK' });
    for (const value of [undefined, '', 'short', JWT_SECRET]) {
      expect(() =>
        validateEnvironment({
          ...environment,
          MOCK_PAYMENT_SIGNING_SECRET: value,
        }),
      ).toThrow(
        'Invalid environment configuration: MOCK_PAYMENT_SIGNING_SECRET',
      );
    }
    expect(() =>
      validateEnvironment({ ...environment, PAYMENT_PROVIDER: 'REAL' }),
    ).toThrow('Invalid environment configuration: PAYMENT_PROVIDER');
    expect(
      validateEnvironment({
        DATABASE_URL,
        JWT_SECRET,
        MOCK_PAYMENT_SIGNING_SECRET: '',
      }),
    ).toMatchObject({ PAYMENT_PROVIDER: 'DISABLED' });
  });
});
