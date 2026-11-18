import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { AuditService } from '../audit/audit.service';
import { Order, OrderStatus } from '../orders/entities/order.entity';
import type { CreateReturnRequestDto } from './dto/create-return-request.dto';
import type { ReturnQueryDto } from './dto/return-query.dto';
import type { ReviewReturnRequestDto } from './dto/review-return-request.dto';
import { ReturnRequest, ReturnStatus } from './entities/return-request.entity';

@Injectable()
export class ReturnsService {
  constructor(
    @InjectRepository(ReturnRequest)
    private readonly returnRequests: Repository<ReturnRequest>,
    @InjectRepository(Order)
    private readonly orders: Repository<Order>,
    private readonly auditService: AuditService,
  ) {}

  async createRequest(
    userId: string,
    input: CreateReturnRequestDto,
  ): Promise<ReturnRequest> {
    const order = await this.orders.findOne({
      where: { id: input.orderId, userId },
    });

    if (!order) {
      throw new NotFoundException(
        `Delivered order with ID ${input.orderId} was not found for this customer`,
      );
    }

    if (order.status !== OrderStatus.DELIVERED) {
      throw new BadRequestException(
        `Returns can only be requested for orders in DELIVERED status (current: ${order.status})`,
      );
    }

    const existing = await this.returnRequests.findOne({
      where: {
        orderId: input.orderId,
      },
    });

    if (
      existing &&
      (existing.status === ReturnStatus.REQUESTED ||
        existing.status === ReturnStatus.APPROVED)
    ) {
      throw new ConflictException(
        'A return request for this order is already pending or approved',
      );
    }

    const request = this.returnRequests.create({
      orderId: order.id,
      userId,
      reason: input.reason.trim(),
      status: ReturnStatus.REQUESTED,
    });

    return this.returnRequests.save(request);
  }

  async findMyReturns(userId: string, query: ReturnQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const qb = this.returnRequests
      .createQueryBuilder('ret')
      .leftJoinAndSelect('ret.order', 'order')
      .where('ret.userId = :userId', { userId });

    if (query.status) {
      qb.andWhere('ret.status = :status', { status: query.status });
    }

    qb.orderBy('ret.createdAt', 'DESC').skip(skip).take(limit);

    const [items, total] = await qb.getManyAndCount();
    const totalPages = Math.ceil(total / limit) || 1;

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  async findStaffReturns(query: ReturnQueryDto) {
    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const qb = this.returnRequests
      .createQueryBuilder('ret')
      .leftJoinAndSelect('ret.order', 'order')
      .leftJoinAndSelect('ret.user', 'user')
      .leftJoinAndSelect('ret.reviewer', 'reviewer');

    if (query.status) {
      qb.andWhere('ret.status = :status', { status: query.status });
    }

    qb.orderBy('ret.createdAt', 'DESC').skip(skip).take(limit);

    const [items, total] = await qb.getManyAndCount();
    const totalPages = Math.ceil(total / limit) || 1;

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages,
      },
    };
  }

  async findById(id: string): Promise<ReturnRequest> {
    const request = await this.returnRequests.findOne({
      where: { id },
      relations: {
        order: true,
        user: true,
        reviewer: true,
      },
    });

    if (!request) {
      throw new NotFoundException(`Return request with ID ${id} was not found`);
    }

    return request;
  }

  async reviewRequest(
    reviewerId: string,
    id: string,
    input: ReviewReturnRequestDto,
  ): Promise<ReturnRequest> {
    const request = await this.findById(id);

    if (request.status !== ReturnStatus.REQUESTED) {
      throw new BadRequestException(
        `Only return requests in REQUESTED status can be reviewed (current: ${request.status})`,
      );
    }

    const beforeState = { status: request.status };

    request.status = input.status;
    request.reviewedBy = reviewerId;
    if (input.staffNotes !== undefined) {
      request.staffNotes = input.staffNotes.trim();
    }

    const saved = await this.returnRequests.save(request);

    await this.auditService.record({
      actorId: reviewerId,
      action: `RETURN_${input.status}`,
      entity: 'ReturnRequest',
      entityId: saved.id,
      before: beforeState,
      after: {
        status: saved.status,
        reviewedBy: reviewerId,
        staffNotes: saved.staffNotes,
      },
    });

    return saved;
  }
}
