import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Page, type PageQueryDto } from '../../common/http/pagination';
import { Order } from '../../database/entities';
import { toOrderDetail, type OrderDetailDto, type OrderSummaryDto } from './order-history.dto';

@Injectable()
export class OrderHistoryService {
  constructor(@InjectRepository(Order) private readonly orders: Repository<Order>) {}

  async list(userId: string, query: PageQueryDto): Promise<Page<OrderSummaryDto>> {
    const [orders, total] = await this.orders.findAndCount({
      where: { userId },
      select: { id: true, createdAt: true, totalMinor: true },
      order: { createdAt: 'DESC', id: 'DESC' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });
    return new Page(orders, total, query);
  }

  async get(userId: string, id: string): Promise<OrderDetailDto> {
    const order = await this.orders.findOne({
      where: { id, userId },
      relations: { items: true },
      order: { items: { id: 'ASC' } },
    });
    if (!order) throw new NotFoundException('Order not found');

    return toOrderDetail(order);
  }
}
