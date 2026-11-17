import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { hash } from 'bcrypt';
import { DataSource, In, Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { UserRole } from '../roles/user-role.enum';
import type { CreateStaffDto } from './dto/create-staff.dto';
import type { StaffQueryDto } from './dto/staff-query.dto';
import type { UpdateStaffDto } from './dto/update-staff.dto';
import { User, UserStatus } from './entities/user.entity';

export interface SafeUser {
  id: string;
  email: string;
  fullName: string;
  role: UserRole;
  status: UserStatus;
  createdAt: Date;
  updatedAt: Date;
}

@Injectable()
export class UsersService {
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly audit: AuditService,
    private readonly dataSource: DataSource,
  ) {}

  async createCustomer(email: string, fullName: string, passwordHash: string) {
    const user = await this.users.save(
      this.users.create({
        email,
        fullName,
        passwordHash,
        role: UserRole.CUSTOMER,
      }),
    );
    return {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
    };
  }

  findActiveCredentials(email: string) {
    return this.users.findOne({
      where: { email, status: UserStatus.ACTIVE },
      select: { id: true, passwordHash: true },
    });
  }

  findActiveIdentity(id: string) {
    return this.users.findOne({
      where: { id, status: UserStatus.ACTIVE },
      select: { id: true, role: true },
    });
  }

  async findProfileById(id: string): Promise<SafeUser> {
    const user = await this.users.findOne({
      where: { id },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    if (!user) {
      throw new NotFoundException('User profile not found');
    }
    return user;
  }

  async updateActiveFullName(id: string, fullName: string): Promise<boolean> {
    const { affected } = await this.users.update(
      { id, status: UserStatus.ACTIVE },
      { fullName },
    );
    return affected === 1;
  }

  async createStaff(actorId: string, input: CreateStaffDto): Promise<SafeUser> {
    const email = input.email.toLowerCase().trim();
    const existing = await this.users.findOne({ where: { email } });
    if (existing) {
      throw new ConflictException('Email already registered');
    }

    const passwordHash = await hash(input.password, 12);

    return this.dataSource.transaction(async (manager) => {
      const userRepository = manager.getRepository(User);
      const user = await userRepository.save(
        userRepository.create({
          email,
          fullName: input.fullName.trim(),
          passwordHash,
          role: input.role,
          status: UserStatus.ACTIVE,
        }),
      );

      await this.audit.record(
        {
          actorId,
          action: 'STAFF_CREATED',
          entity: 'users',
          entityId: user.id,
          after: {
            email: user.email,
            fullName: user.fullName,
            role: user.role,
            status: user.status,
          },
        },
        manager,
      );

      return {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        status: user.status,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      };
    });
  }

  async listStaff(query: StaffQueryDto) {
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const queryBuilder = this.users
      .createQueryBuilder('user')
      .select([
        'user.id',
        'user.email',
        'user.fullName',
        'user.role',
        'user.status',
        'user.createdAt',
        'user.updatedAt',
      ])
      .orderBy('user.createdAt', 'DESC')
      .skip(skip)
      .take(limit);

    if (query.role) {
      queryBuilder.andWhere('user.role = :role', { role: query.role });
    } else {
      queryBuilder.andWhere('user.role IN (:...roles)', {
        roles: [UserRole.STAFF, UserRole.INVENTORY_MANAGER, UserRole.ADMIN],
      });
    }

    if (query.status) {
      queryBuilder.andWhere('user.status = :status', { status: query.status });
    }

    if (query.search) {
      queryBuilder.andWhere(
        '(user.email ILIKE :search OR user.fullName ILIKE :search)',
        { search: `%${query.search.trim()}%` },
      );
    }

    const [staff, total] = await queryBuilder.getManyAndCount();

    return {
      staff,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 0,
      },
    };
  }

  async findStaffById(id: string): Promise<SafeUser> {
    const user = await this.users.findOne({
      where: {
        id,
        role: In([UserRole.STAFF, UserRole.INVENTORY_MANAGER, UserRole.ADMIN]),
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        status: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!user) {
      throw new NotFoundException('Staff member not found');
    }

    return user;
  }

  async updateStaff(
    actorId: string,
    id: string,
    input: UpdateStaffDto,
  ): Promise<SafeUser> {
    const user = await this.findStaffById(id);

    const before = {
      fullName: user.fullName,
      role: user.role,
      status: user.status,
    };

    return this.dataSource.transaction(async (manager) => {
      const userRepository = manager.getRepository(User);

      if (input.fullName !== undefined) {
        user.fullName = input.fullName.trim();
      }
      if (input.role !== undefined) {
        user.role = input.role;
      }
      if (input.status !== undefined) {
        user.status = input.status;
      }

      const updated = await userRepository.save(user);

      const after = {
        fullName: updated.fullName,
        role: updated.role,
        status: updated.status,
      };

      await this.audit.record(
        {
          actorId,
          action: 'STAFF_UPDATED',
          entity: 'users',
          entityId: updated.id,
          before,
          after,
        },
        manager,
      );

      return {
        id: updated.id,
        email: updated.email,
        fullName: updated.fullName,
        role: updated.role,
        status: updated.status,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      };
    });
  }

  async deactivateStaff(actorId: string, id: string): Promise<SafeUser> {
    const user = await this.findStaffById(id);

    const before = { status: user.status };

    return this.dataSource.transaction(async (manager) => {
      const userRepository = manager.getRepository(User);
      user.status = UserStatus.INACTIVE;
      const updated = await userRepository.save(user);

      await this.audit.record(
        {
          actorId,
          action: 'STAFF_DEACTIVATED',
          entity: 'users',
          entityId: updated.id,
          before,
          after: { status: UserStatus.INACTIVE },
        },
        manager,
      );

      return {
        id: updated.id,
        email: updated.email,
        fullName: updated.fullName,
        role: updated.role,
        status: updated.status,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      };
    });
  }
}
