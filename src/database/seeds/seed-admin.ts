import { config } from 'dotenv';
import { hash } from 'bcrypt';
import dataSource from '../data-source';
import { UserRole } from '../../modules/roles/user-role.enum';
import { User, UserStatus } from '../../modules/users/entities/user.entity';

config({ quiet: true });

async function seedAdmin() {
  const email = (process.env.ADMIN_EMAIL || 'admin@thread.local')
    .toLowerCase()
    .trim();
  const password = process.env.ADMIN_PASSWORD || 'AdminPass123!';
  const fullName = process.env.ADMIN_FULL_NAME || 'System Administrator';

  console.log(`[SeedAdmin] Connecting to database...`);
  await dataSource.initialize();

  try {
    const userRepository = dataSource.getRepository(User);
    let admin = await userRepository.findOne({ where: { email } });

    const passwordHash = await hash(password, 12);

    if (admin) {
      admin.role = UserRole.ADMIN;
      admin.status = UserStatus.ACTIVE;
      admin.fullName = fullName;
      admin.passwordHash = passwordHash;
      await userRepository.save(admin);
      console.log(`[SeedAdmin] Updated existing admin user: ${email}`);
    } else {
      admin = userRepository.create({
        email,
        fullName,
        passwordHash,
        role: UserRole.ADMIN,
        status: UserStatus.ACTIVE,
      });
      await userRepository.save(admin);
      console.log(`[SeedAdmin] Created initial admin user: ${email}`);
    }
  } finally {
    await dataSource.destroy();
  }
}

seedAdmin().catch((err) => {
  console.error('[SeedAdmin] Failed to seed administrator:', err);
  process.exit(1);
});
