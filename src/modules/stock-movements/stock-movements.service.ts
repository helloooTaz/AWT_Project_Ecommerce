import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { EntityManager, FindOptionsWhere, Repository } from 'typeorm';
import { StockMovementEntity } from './entities/stock-movement.entity';
import { StockMovementQueryDto } from './dto/stock-movement-query.dto';
import { StockMovementType } from '../../common/enums/stock-movement-type.enum';

export interface RecordMovementParams {
  variantId: string;
  actorId?: string | null;
  type: StockMovementType;
  quantity: number;
  reason: string;
}

@Injectable()
export class StockMovementsService {
  private readonly logger = new Logger(StockMovementsService.name);

  constructor(
    @InjectRepository(StockMovementEntity)
    private readonly movementRepo: Repository<StockMovementEntity>,
  ) {}

  async listMovements(
    query: StockMovementQueryDto,
  ): Promise<{
    items: StockMovementEntity[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
  }> {
    const page = query.page ?? 1;
    const limit = query.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: FindOptionsWhere<StockMovementEntity> = {};
    if (query.variantId) {
      where.variantId = query.variantId;
    }
    if (query.type) {
      where.type = query.type;
    }

    const [items, total] = await this.movementRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip,
      take: limit,
    });

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  async recordMovement(
    manager: EntityManager,
    params: RecordMovementParams,
  ): Promise<StockMovementEntity> {
    const repo = manager.getRepository(StockMovementEntity);
    const movement = repo.create({
      variantId: params.variantId,
      actorId: params.actorId ?? null,
      type: params.type,
      quantity: params.quantity,
      reason: params.reason,
    });

    const saved = await repo.save(movement);
    this.logger.log(
      `Recorded stock movement [${params.type}] for Variant ${params.variantId}: quantity=${params.quantity}, reason="${params.reason}" (ID: ${saved.id})`,
    );
    return saved;
  }
}
