import { BadRequestException, ConflictException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import type { AuditService } from '../audit/audit.service';
import {
  Order,
  OrderStatus,
  type ShippingAddressSnapshot,
} from '../orders/entities/order.entity';
import type { User } from '../users/entities/user.entity';
import { ReturnRequest, ReturnStatus } from './entities/return-request.entity';
import { ReturnsService } from './returns.service';

describe('ReturnsService', () => {
  let service: ReturnsService;
  let mockReturnRepo: {
    findOne: jest.Mock;
    create: jest.Mock;
    save: jest.Mock;
    createQueryBuilder: jest.Mock;
  };
  let mockOrderRepo: {
    findOne: jest.Mock;
  };
  let mockAuditService: {
    record: jest.Mock;
  };

  const mockOrder: Order = {
    id: '11111111-1111-1111-1111-111111111111',
    userId: '22222222-2222-2222-2222-222222222222',
    status: OrderStatus.DELIVERED,
    currency: 'BDT',
    totalMinor: '500000',
    shippingAddressSnapshot: null as unknown as ShippingAddressSnapshot,
    user: null as unknown as User,
    items: [],
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockReturn: ReturnRequest = {
    id: '33333333-3333-3333-3333-333333333333',
    orderId: mockOrder.id,
    order: mockOrder,
    userId: mockOrder.userId,
    user: null as unknown as User,
    reviewedBy: null,
    reviewer: null,
    status: ReturnStatus.REQUESTED,
    reason: 'Size too large',
    staffNotes: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(() => {
    mockReturnRepo = {
      findOne: jest.fn(),
      create: jest.fn((r: Partial<ReturnRequest>) => r as ReturnRequest),
      save: jest.fn((r: Partial<ReturnRequest>) =>
        Promise.resolve({ id: mockReturn.id, ...r } as ReturnRequest),
      ),
      createQueryBuilder: jest.fn(),
    };

    mockOrderRepo = {
      findOne: jest.fn(),
    };

    mockAuditService = {
      record: jest.fn().mockResolvedValue({ id: 'audit-id' }),
    };

    service = new ReturnsService(
      mockReturnRepo as unknown as Repository<ReturnRequest>,
      mockOrderRepo as unknown as Repository<Order>,
      mockAuditService as unknown as AuditService,
    );
  });

  describe('createRequest', () => {
    it('creates return request for delivered order', async () => {
      mockOrderRepo.findOne.mockResolvedValue(mockOrder);
      mockReturnRepo.findOne.mockResolvedValue(null);

      const result = await service.createRequest(mockOrder.userId, {
        orderId: mockOrder.id,
        reason: 'Size too large',
      });

      expect(result.reason).toBe('Size too large');
      expect(result.status).toBe(ReturnStatus.REQUESTED);
    });

    it('throws BadRequestException if order is not DELIVERED', async () => {
      mockOrderRepo.findOne.mockResolvedValue({
        ...mockOrder,
        status: OrderStatus.PROCESSING,
      });

      await expect(
        service.createRequest(mockOrder.userId, {
          orderId: mockOrder.id,
          reason: 'Size too large',
        }),
      ).rejects.toThrow(BadRequestException);
    });

    it('throws ConflictException if return request is already active', async () => {
      mockOrderRepo.findOne.mockResolvedValue(mockOrder);
      mockReturnRepo.findOne.mockResolvedValue(mockReturn);

      await expect(
        service.createRequest(mockOrder.userId, {
          orderId: mockOrder.id,
          reason: 'Size too large',
        }),
      ).rejects.toThrow(ConflictException);
    });
  });

  describe('reviewRequest', () => {
    it('approves return request and records audit log', async () => {
      mockReturnRepo.findOne.mockResolvedValue(mockReturn);

      const result = await service.reviewRequest(
        'staff-reviewer-id',
        mockReturn.id,
        {
          status: ReturnStatus.APPROVED,
          staffNotes: 'Approved for return',
        },
      );

      expect(result.status).toBe(ReturnStatus.APPROVED);
      expect(result.staffNotes).toBe('Approved for return');
      expect(mockAuditService.record).toHaveBeenCalledWith(
        expect.objectContaining({
          action: 'RETURN_APPROVED',
          entity: 'ReturnRequest',
        }),
      );
    });

    it('throws BadRequestException if reviewing non-REQUESTED return', async () => {
      mockReturnRepo.findOne.mockResolvedValue({
        ...mockReturn,
        status: ReturnStatus.APPROVED,
      });

      await expect(
        service.reviewRequest('staff-reviewer-id', mockReturn.id, {
          status: ReturnStatus.REJECTED,
        }),
      ).rejects.toThrow(BadRequestException);
    });
  });
});
