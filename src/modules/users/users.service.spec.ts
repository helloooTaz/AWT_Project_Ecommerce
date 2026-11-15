import { ConflictException, NotFoundException } from '@nestjs/common';
import type { DataSource, EntityManager, Repository } from 'typeorm';
import type { AuditService } from '../audit/audit.service';
import { UserRole } from '../roles/user-role.enum';
import { User, UserStatus } from './entities/user.entity';
import { UsersService } from './users.service';

describe('UsersService', () => {
  let service: UsersService;
  let mockUserRepo: {
    save: jest.Mock;
    create: jest.Mock;
    findOne: jest.Mock;
    update: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let mockAuditService: {
    record: jest.Mock;
  };
  let mockDataSource: {
    transaction: jest.Mock;
  };

  beforeEach(() => {
    mockUserRepo = {
      save: jest.fn((u: Partial<User>) =>
        Promise.resolve({ id: 'saved-id', ...u } as User),
      ),
      create: jest.fn((u: Partial<User>) => u as User),
      findOne: jest.fn(),
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      createQueryBuilder: jest.fn(),
    };

    mockAuditService = {
      record: jest.fn().mockResolvedValue({ id: 'audit-log-id' }),
    };

    mockDataSource = {
      transaction: jest.fn(
        (cb: (manager: EntityManager) => Promise<unknown>) => {
          const mockManager = {
            getRepository: jest.fn().mockReturnValue(mockUserRepo),
          } as unknown as EntityManager;
          return cb(mockManager);
        },
      ),
    };

    service = new UsersService(
      mockUserRepo as unknown as Repository<User>,
      mockAuditService as unknown as AuditService,
      mockDataSource as unknown as DataSource,
    );
  });

  describe('createStaff', () => {
    it('creates staff and writes audit log in transaction', async () => {
      mockUserRepo.findOne.mockResolvedValue(null);

      const result = await service.createStaff('admin-uuid', {
        email: 'staff@example.com',
        fullName: 'Jane Staff',
        password: 'password123',
        role: UserRole.STAFF,
      });

      expect(mockUserRepo.findOne).toHaveBeenCalledWith({
        where: { email: 'staff@example.com' },
      });
      expect(mockDataSource.transaction).toHaveBeenCalled();
      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: 'admin-uuid',
          action: 'STAFF_CREATED',
          entity: 'users',
        }),
        expect.anything(),
      );
      expect(result.email).toBe('staff@example.com');
      expect(result.role).toBe(UserRole.STAFF);
    });

    it('throws ConflictException on duplicate staff email', async () => {
      mockUserRepo.findOne.mockResolvedValue({ id: 'existing-id' });

      await expect(
        service.createStaff('admin-uuid', {
          email: 'duplicate@example.com',
          fullName: 'Staff Duplicate',
          password: 'password123',
          role: UserRole.STAFF,
        }),
      ).rejects.toThrow(ConflictException);

      expect(mockDataSource.transaction).not.toHaveBeenCalled();
    });
  });

  describe('updateStaff', () => {
    it('updates staff fields and writes audit log with before/after state', async () => {
      const existingUser = {
        id: 'staff-uuid',
        email: 'staff@example.com',
        fullName: 'Old Name',
        role: UserRole.STAFF,
        status: UserStatus.ACTIVE,
      };
      mockUserRepo.findOne.mockResolvedValue(existingUser);

      const result = await service.updateStaff('admin-uuid', 'staff-uuid', {
        fullName: 'New Name',
        role: UserRole.INVENTORY_MANAGER,
      });

      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: 'admin-uuid',
          action: 'STAFF_UPDATED',
          entity: 'users',
          entityId: 'staff-uuid',
          before: {
            fullName: 'Old Name',
            role: UserRole.STAFF,
            status: UserStatus.ACTIVE,
          },
          after: {
            fullName: 'New Name',
            role: UserRole.INVENTORY_MANAGER,
            status: UserStatus.ACTIVE,
          },
        }),
        expect.anything(),
      );
      expect(result.fullName).toBe('New Name');
      expect(result.role).toBe(UserRole.INVENTORY_MANAGER);
    });

    it('throws NotFoundException if staff does not exist', async () => {
      mockUserRepo.findOne.mockResolvedValue(null);

      await expect(
        service.updateStaff('admin-uuid', 'non-existent', { fullName: 'Test' }),
      ).rejects.toThrow(NotFoundException);
    });
  });

  describe('deactivateStaff', () => {
    it('sets staff status to INACTIVE and audits deactivation', async () => {
      const existingUser = {
        id: 'staff-uuid',
        email: 'staff@example.com',
        fullName: 'Jane Staff',
        role: UserRole.STAFF,
        status: UserStatus.ACTIVE,
      };
      mockUserRepo.findOne.mockResolvedValue(existingUser);

      const result = await service.deactivateStaff('admin-uuid', 'staff-uuid');

      expect(result.status).toBe(UserStatus.INACTIVE);
      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          actorId: 'admin-uuid',
          action: 'STAFF_DEACTIVATED',
          entityId: 'staff-uuid',
          after: { status: UserStatus.INACTIVE },
        }),
        expect.anything(),
      );
    });
  });
});
