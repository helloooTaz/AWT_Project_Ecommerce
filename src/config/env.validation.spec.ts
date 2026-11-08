import { validateEnvironment } from './env.validation';

const DATABASE_URL = 'postgresql://localhost/thread';

describe('environment configuration', () => {
  it('sets defaults and converts environment strings', () => {
    expect(validateEnvironment({ DATABASE_URL })).toMatchObject({
      DATABASE_URL,
      PORT: 3000,
      SWAGGER_ENABLED: true,
    });
    expect(
      validateEnvironment({
        DATABASE_URL,
        PORT: '3001',
        SWAGGER_ENABLED: 'false',
      }),
    ).toMatchObject({ PORT: 3001, SWAGGER_ENABLED: false });
  });

  it('requires a PostgreSQL URL and rejects invalid settings', () => {
    expect(() => validateEnvironment({})).toThrow('DATABASE_URL');
    expect(() =>
      validateEnvironment({ DATABASE_URL: 'https://localhost', PORT: '70000' }),
    ).toThrow('Invalid environment configuration: DATABASE_URL, PORT');
  });
});
