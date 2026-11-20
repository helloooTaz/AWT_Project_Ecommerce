import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, type EntityManager, Repository } from 'typeorm';
import { Page } from '../../common/http/pagination';
import { InventoryMovement, InventoryStock, ProductVariant } from '../../database/entities';
import { MovementType } from '../../database/entities/inventory.entity';
import {
  MAX_STOCK, type AdjustStockDto, type InventoryPageQueryDto, type MovementResponseDto,
  type ReceiveStockDto, type StockChangeResponseDto, type StockResponseDto,
} from './inventory.dto';

@Injectable()
export class InventoryService {
  constructor(
    private readonly dataSource: DataSource,
    @InjectRepository(ProductVariant) private readonly variants: Repository<ProductVariant>,
    @InjectRepository(InventoryMovement) private readonly movements: Repository<InventoryMovement>,
  ) {}

  async listStock(query: InventoryPageQueryDto): Promise<Page<StockResponseDto>> {
    const stock = this.stockQuery(query.variantId);
    const total = await stock.getCount();
    const items = await stock.orderBy('variant.sku', 'ASC').addOrderBy('variant.id', 'ASC')
      .offset((query.page - 1) * query.limit).limit(query.limit).getRawMany<StockResponseDto>();
    return new Page(items, total, query);
  }

  async getStock(variantId: string): Promise<StockResponseDto> {
    const stock = await this.stockQuery(variantId).getRawOne<StockResponseDto>();
    if (!stock) throw new NotFoundException('Variant not found');
    return stock;
  }

  receive(input: ReceiveStockDto, actorId: string): Promise<StockChangeResponseDto> {
    return this.changeStock(input.variantId, input.quantity, input.reason, actorId, MovementType.Receipt);
  }

  adjust(input: AdjustStockDto, actorId: string): Promise<StockChangeResponseDto> {
    return this.changeStock(input.variantId, input.delta, input.reason, actorId, MovementType.Adjustment);
  }

  async listMovements(query: InventoryPageQueryDto): Promise<Page<MovementResponseDto>> {
    const [items, total] = await this.movements.findAndCount({
      where: query.variantId ? { variantId: query.variantId } : {},
      select: { id: true, variantId: true, actorId: true, type: true, delta: true, reason: true, createdAt: true },
      order: { createdAt: 'DESC', id: 'DESC' },
      skip: (query.page - 1) * query.limit,
      take: query.limit,
    });
    return new Page(items, total, query);
  }

  private stockQuery(variantId?: string) {
    const query = this.variants.createQueryBuilder('variant')
      .innerJoin('variant.product', 'product')
      .leftJoin(InventoryStock, 'stock', 'stock.variantId = variant.id')
      .select('variant.id', 'variantId')
      .addSelect('product.id', 'productId')
      .addSelect('variant.sku', 'sku')
      .addSelect('product.name', 'productName')
      .addSelect('variant.size', 'size')
      .addSelect('variant.color', 'color')
      .addSelect('COALESCE(stock.quantity, 0)', 'quantity');
    if (variantId) query.where('variant.id = :variantId', { variantId });
    return query;
  }

  private changeStock(
    variantId: string, delta: number, reason: string, actorId: string,
    type: MovementType.Receipt | MovementType.Adjustment,
  ): Promise<StockChangeResponseDto> {
    return this.dataSource.transaction(async (manager) => {
      if (!await manager.getRepository(ProductVariant).existsBy({ id: variantId })) {
        throw new NotFoundException('Variant not found');
      }
      const stock = manager.getRepository(InventoryStock);
      if (delta > 0) {
        // The unique variant ID lets concurrent increases share one balance row.
        await stock.createQueryBuilder().insert().values({ variantId, quantity: 0 })
          .onConflict('("variantId") DO NOTHING').execute();
      }

      // PostgreSQL locks the updated row and rechecks the bounds after a competing write.
      const updated = await stock.createQueryBuilder().update()
        .set({ quantity: () => '"quantity" + :delta' })
        .where('"variantId" = :variantId AND "quantity" + CAST(:delta AS bigint) BETWEEN 0 AND :maximum', {
          variantId, delta, maximum: MAX_STOCK,
        })
        .returning(['variantId', 'quantity'])
        .execute();
      const [balance]: Array<{ variantId: string; quantity: number }> = updated.raw;
      if (!balance) {
        throw new ConflictException(delta < 0 ? 'Adjustment would make stock negative' : 'Stock limit exceeded');
      }

      const movements = manager.getRepository(InventoryMovement);
      const saved = await movements.save(movements.create({
        variantId: balance.variantId, actorId, type, delta, reason,
      }));
      const movement = { id: saved.id, variantId: saved.variantId, actorId, type, delta, reason, createdAt: saved.createdAt };
      return { ...balance, movement };
    });
  }

  /**
   * Call within checkout's transaction and visit variants in ascending ID order.
   * The update and movement are committed or rolled back by the caller.
   */
  async deductStock(
    manager: EntityManager,
    variantId: string,
    quantity: number,
    actorId: string,
    orderId: string,
  ): Promise<void> {
    if (!manager.queryRunner?.isTransactionActive) {
      throw new Error('Stock deduction requires an active transaction');
    }
    if (!Number.isInteger(quantity) || quantity < 1 || quantity > 2_147_483_647) {
      throw new BadRequestException('Stock deduction quantity must be a positive integer');
    }

    const update = await manager.getRepository(InventoryStock).createQueryBuilder()
      .update()
      .set({ quantity: () => '"quantity" - :quantity' })
      .where('"variantId" = :variantId AND "quantity" >= :quantity', { variantId, quantity })
      .execute();

    if (update.affected !== 1) {
      throw new ConflictException('Insufficient stock');
    }
    await manager.insert(InventoryMovement, {
      variantId,
      actorId,
      type: MovementType.Sale,
      delta: -quantity,
      reason: `Order ${orderId}`,
    });
  }
}
