import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import dataSource from '../../database/data-source';
import { User } from '../../database/entities';
import { RegisterDto } from '../auth/auth.dto';
import { hashPassword } from '../auth/password';
import { Role } from '../auth/role';

async function seedAdmin(): Promise<void> {
  const input = plainToInstance(RegisterDto, {
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
    name: 'Administrator',
  });
  if (validateSync(input).length) {
    throw new Error('Set a valid ADMIN_EMAIL and ADMIN_PASSWORD in .env');
  }
  const passwordHash = await hashPassword(input.password);

  await dataSource.initialize();
  try {
    const users = dataSource.getRepository(User);
    const result = await users.createQueryBuilder().insert().values({
      email: input.email,
      name: input.name,
      role: Role.Admin,
      passwordHash,
    }).onConflict('("email") DO NOTHING').returning('id').execute();

    if (result.raw.length === 1) {
      console.log('Admin account created.');
      return;
    }

    const existing = await users.findOneBy({ email: input.email });
    if (existing?.role !== Role.Admin || !existing.isActive) {
      throw new Error('That email belongs to an ineligible account. Use a distinct admin email.');
    }
    console.log('Admin account already exists. Its existing credentials are still in effect.');
  } finally {
    await dataSource.destroy();
  }
}

void seedAdmin().catch((error: unknown) => {
  if (error instanceof Error && error.name !== 'QueryFailedError') {
    console.error(error.message);
  } else {
    console.error('Admin seed failed. Check PostgreSQL connectivity and run the migrations.');
  }
  process.exitCode = 1;
});
