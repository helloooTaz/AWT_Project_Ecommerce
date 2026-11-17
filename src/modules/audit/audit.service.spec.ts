import type { EntityManager, Repository } from 'typeorm';
import { AuditService } from './audit.service';
import { AuditLog } from './entities/audit-log.entity';

describe('AuditService', () => {
  let service: AuditService;
  let mockRepository: {
    create: jest.Mock;
    save: jest.Mock;
    findAndCount: jest.Mock;
  };

  beforeEach(() => {
    mockRepository = {
      create: jest.fn((entry: Partial<AuditLog>) => entry),
      save: jest.fn((log: Partial<AuditLog>) =>
        Promise.resolve({ ...log, id: 'mock-log-id' } as AuditLog),
      ),
      findAndCount: jest.fn().mockResolvedValue([[], 0]),
    };
    service = new AuditService(
      mockRepository as unknown as Repository<AuditLog>,
    );
  });

  it('records an audit entry using the default repository', async () => {
    const entry = {
      actorId: 'actor-uuid',
      action: 'STAFF_CREATED',
      entity: 'users',
      entityId: 'target-uuid',
      before: null,
      after: { email: 'staff@example.com' },
    };

    const result = await service.record(entry);

    expect(mockRepository.create).toHaveBeenCalledWith({
      actorId: 'actor-uuid',
      action: 'STAFF_CREATED',
      entity: 'users',
      entityId: 'target-uuid',
      before: null,
      after: { email: 'staff@example.com' },
    });
    expect(mockRepository.save).toHaveBeenCalled();
    expect(result.id).toBe('mock-log-id');
  });

  it('records an audit entry using a transaction manager when supplied', async () => {
    const mockManagerRepository = {
      create: jest.fn((entry: Partial<AuditLog>) => entry),
      save: jest.fn((log: Partial<AuditLog>) =>
        Promise.resolve({ ...log, id: 'managed-log-id' } as AuditLog),
      ),
    };
    const getRepositoryMock = jest.fn().mockReturnValue(mockManagerRepository);
    const mockManager = {
      getRepository: getRepositoryMock,
    } as unknown as EntityManager;

    const entry = {
      action: 'STAFF_DEACTIVATED',
      entity: 'users',
      entityId: 'target-uuid',
    };

    const result = await service.record(entry, mockManager);

    expect(getRepositoryMock).toHaveBeenCalledWith(AuditLog);
    expect(mockManagerRepository.save).toHaveBeenCalled();
    expect(result.id).toBe('managed-log-id');
    expect(mockRepository.save).not.toHaveBeenCalled();
  });

  it('applies pagination and filter options in list', async () => {
    mockRepository.findAndCount.mockResolvedValue([
      [{ id: '1' } as AuditLog],
      1,
    ]);

    const result = await service.list({
      page: 2,
      limit: 10,
      action: 'STAFF_CREATED',
      entity: 'users',
      entityId: 'target-uuid',
      actorId: 'actor-uuid',
    });

    expect(mockRepository.findAndCount).toHaveBeenCalledWith(
      expect.objectContaining({
        skip: 10,
        take: 10,
        where: {
          action: 'STAFF_CREATED',
          entity: 'users',
          entityId: 'target-uuid',
          actorId: 'actor-uuid',
        },
      }),
    );
    expect(result.pagination).toEqual({
      page: 2,
      limit: 10,
      total: 1,
      totalPages: 1,
    });
  });
});
