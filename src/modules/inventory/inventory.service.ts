import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import {
  DataSource,
  EntityManager,
  FindOptionsWhere,
  In,
  Repository,
} from 'typeorm';
import { StockMovementType } from '../../common/enums/stock-movement-type.enum';
import { CatalogService } from '../catalog/catalog.service';
import { OrderItemEntity } from '../orders/entities/order-item.entity';
import { StockMovementsService } from '../stock-movements/stock-movements.service';
import { CreateAdjustmentDto } from './dto/create-adjustment.dto';
import { CreateReceiptDto } from './dto/create-receipt.dto';
import { InventoryQueryDto } from './dto/inventory-query.dto';
import { InventoryBalanceEntity } from './entities/inventory-balance.entity';
import {
  StockReservation,
  StockReservationEntity,
  StockReservationStatus,
} from './entities/stock-reservation.entity';

export interface StockReservationItem {
  orderItemId: string;
  variantId: string;
  quantity: number;
}

@Injectable()
export class InventoryService {
  private readonly logger = new Logger(InventoryService.name);

  constructor(
    @InjectRepository(InventoryBalanceEntity)
    private readonly balanceRepo: Repository<InventoryBalanceEntity>,
    @InjectRepository(StockReservationEntity)
    private readonly reservationRepo: Repository<StockReservationEntity>,
    private readonly stockMovementsService: StockMovementsService,
    private readonly catalogService: CatalogService,
    private readonly dataSource: DataSource,
  ) { }

  /**
   * Helper: Locks a single variant's inventory balance row (SELECT ... FOR UPDATE)
   * so two transactions cannot modify the same SKU stock at the same time.
   */
  private async lockBalance(
    manager: EntityManager,
    variantId: string,
  ): Promise<InventoryBalanceEntity | null> {
    return manager
      .getRepository(InventoryBalanceEntity)
      .createQueryBuilder('ib')
      .setLock('pessimistic_write')
      .where('ib.variantId = :variantId', { variantId })
      .getOne();
  }

  /**
   * 1. Used by Customer Cart & Size Recommendation:
   * Returns available stock (onHand - reserved) for a list of variant IDs.
   */
  async getAvailability(variantIds: string[]): Promise<Map<string, number>> {
    if (!variantIds || variantIds.length === 0) {
      return new Map();
    }

    const balances = await this.balanceRepo.findBy({
      variantId: In(variantIds),
    });

    // Default every requested variant to 0, then fill in existing balances
    const availability = new Map(variantIds.map((id) => [id, 0]));
    for (const balance of balances) {
      availability.set(balance.variantId, balance.onHand - balance.reserved);
    }

    return availability;
  }

  /**
   * 2. GET /api/v1/inventory
   * Returns a paginated list of inventory balances.
   */
  async getOverview(query: InventoryQueryDto) {
    const page = Math.max(1, Number(query.page || 1));
    const limit = Math.min(100, Math.max(1, Number(query.limit || 20)));
    const skip = (page - 1) * limit;

    const where: FindOptionsWhere<InventoryBalanceEntity> = {};
    if (query.variantId) {
      where.variantId = query.variantId;
    }

    const [items, total] = await this.balanceRepo.findAndCount({
      where,
      order: { variantId: 'ASC' },
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

  /**
   * 3. GET /api/v1/inventory/:variantId
   * Returns the stock balance for one specific variant.
   */
  async getByVariantId(variantId: string): Promise<InventoryBalanceEntity> {
    const balance = await this.balanceRepo.findOne({ where: { variantId } });
    if (!balance) {
      throw new NotFoundException(
        `Inventory balance for variant ${variantId} was not found`,
      );
    }
    return balance;
  }

  /**
   * 4. POST /api/v1/inventory/receipts
   * Receives new stock into the warehouse, increases onHand, and logs a RECEIPT movement.
   */
  async receiveStock(
    actorId: string | null,
    dto: CreateReceiptDto,
  ): Promise<InventoryBalanceEntity> {
    await this.catalogService.validateVariantExists(dto.variantId);

    return this.dataSource.transaction(async (manager) => {
      const balanceRepo = manager.getRepository(InventoryBalanceEntity);
      let balance = await this.lockBalance(manager, dto.variantId);

      if (!balance) {
        balance = balanceRepo.create({
          variantId: dto.variantId,
          onHand: dto.quantity,
          reserved: 0,
        });
      } else {
        balance.onHand += dto.quantity;
      }

      const saved = await balanceRepo.save(balance);

      await this.stockMovementsService.recordMovement(manager, {
        variantId: dto.variantId,
        actorId,
        type: StockMovementType.RECEIPT,
        quantity: dto.quantity,
        reason: dto.reason || 'STOCK_RECEIPT',
      });

      this.logger.log(
        `Received ${dto.quantity} units for variant ${dto.variantId}. New onHand=${saved.onHand}`,
      );
      return saved;
    });
  }

  /**
   * 5. POST /api/v1/inventory/adjustments
   * Adjusts stock (positive or negative delta) while preventing negative stock
   * or dropping onHand below currently reserved units.
   */
  async adjustStock(
    actorId: string | null,
    dto: CreateAdjustmentDto,
  ): Promise<InventoryBalanceEntity> {
    await this.catalogService.validateVariantExists(dto.variantId);

    return this.dataSource.transaction(async (manager) => {
      const balanceRepo = manager.getRepository(InventoryBalanceEntity);
      const balance = await this.lockBalance(manager, dto.variantId);

      if (!balance) {
        throw new NotFoundException(
          `Inventory balance for variant ${dto.variantId} was not found`,
        );
      }

      const targetOnHand = balance.onHand + dto.delta;
      if (targetOnHand < 0) {
        throw new ConflictException(
          `Adjustment conflict: resulting onHand (${targetOnHand}) cannot be negative`,
        );
      }
      if (targetOnHand < balance.reserved) {
        throw new ConflictException(
          `Adjustment conflict: resulting onHand (${targetOnHand}) cannot be less than currently reserved units (${balance.reserved})`,
        );
      }

      balance.onHand = targetOnHand;
      const saved = await balanceRepo.save(balance);

      await this.stockMovementsService.recordMovement(manager, {
        variantId: dto.variantId,
        actorId,
        type: StockMovementType.ADJUSTMENT,
        quantity: dto.delta,
        reason: dto.reason,
      });

      this.logger.log(
        `Adjusted stock for variant ${dto.variantId} by ${dto.delta}. New onHand=${saved.onHand}`,
      );
      return saved;
    });
  }

  /**
   * 6. Cross-Domain Method for Customer Checkout:
   * Reserves stock inside the caller's database transaction using row-level locks.
   */
  async reserveForOrder(
    manager: EntityManager,
    items: readonly StockReservationItem[],
    expiresAt: Date,
  ): Promise<StockReservation[]> {
    // Step 1: Must run inside an active database transaction
    if (
      manager.queryRunner !== undefined &&
      !manager.queryRunner.isTransactionActive
    ) {
      throw new Error('Stock reservation requires an active transaction');
    }

    if (!items || items.length === 0) {
      return [];
    }

    if (!expiresAt || !Number.isFinite(expiresAt.getTime())) {
      throw new BadRequestException('Reservation expiration is invalid');
    }

    // Step 2: Validate positive quantities and check for duplicate orderItemIds
    const lines = items.map((item) => {
      if (item.quantity <= 0) {
        throw new ConflictException(
          `Reservation quantity must be greater than 0, got ${item.quantity}`,
        );
      }
      return {
        orderItemId: item.orderItemId.toLowerCase(),
        variantId: item.variantId.toLowerCase(),
        quantity: item.quantity,
      };
    });

    const orderItemIds = lines.map((line) => line.orderItemId);
    if (new Set(orderItemIds).size !== lines.length) {
      throw new ConflictException('Order item already has a reservation');
    }

    // Step 3: Verify that every requested reservation matches a saved OrderItem in the DB
    const persistedItems = await manager.getRepository(OrderItemEntity).find({
      where: { id: In(orderItemIds) },
    });

    const persistedById = new Map(
      persistedItems.map((item) => [item.id.toLowerCase(), item]),
    );

    for (const line of lines) {
      const persisted = persistedById.get(line.orderItemId);
      if (
        !persisted ||
        persisted.variantId?.toLowerCase() !== line.variantId ||
        persisted.quantity !== line.quantity
      ) {
        throw new BadRequestException('Reservation must match its order item');
      }
    }

    // Step 4: Check if any of these order items already have a reservation
    const reservationRepo = manager.getRepository(StockReservationEntity);
    const existing = await reservationRepo.find({
      where: { orderItemId: In(orderItemIds) },
    });
    if (existing.length > 0) {
      throw new ConflictException('Order item already has a reservation');
    }

    // Step 5: Group total requested quantity by variantId and sort variantIds alphabetically
    // (Sorting variantIds prevents deadlocks when two carts lock the same variants)
    const quantityByVariant = new Map<string, number>();
    for (const line of lines) {
      const current = quantityByVariant.get(line.variantId) ?? 0;
      quantityByVariant.set(line.variantId, current + line.quantity);
    }

    const sortedVariantIds = Array.from(quantityByVariant.keys()).sort((a, b) =>
      a.localeCompare(b),
    );

    // Step 6: Lock each variant balance row, check available stock, and increase reserved
    const balanceRepo = manager.getRepository(InventoryBalanceEntity);
    for (const variantId of sortedVariantIds) {
      const neededQuantity = quantityByVariant.get(variantId)!;
      const balance = await this.lockBalance(manager, variantId);

      if (!balance || balance.onHand - balance.reserved < neededQuantity) {
        throw new ConflictException(
          'Insufficient stock for one or more items',
        );
      }

      balance.reserved += neededQuantity;
      await balanceRepo.save(balance);
    }

    // Step 7: Create and save an ACTIVE StockReservation row for each order item
    const createdReservations: StockReservationEntity[] = [];
    for (const line of lines) {
      const reservation = reservationRepo.create({
        orderItemId: line.orderItemId,
        variantId: line.variantId,
        quantity: line.quantity,
        status: StockReservationStatus.ACTIVE,
        expiresAt,
      });
      createdReservations.push(await reservationRepo.save(reservation));
    }

    return createdReservations;
  }

  /**
   * 7. Cross-Domain Method for Order Cancellation / Payment Expiry:
   * Releases ACTIVE reservations and subtracts from reserved (leaving onHand unchanged).
   */
  async releaseForOrder(
    manager: EntityManager,
    orderId: string,
    reason?: string,
  ): Promise<void> {
    if ('connection' in manager && !manager.queryRunner?.isTransactionActive) {
      throw new Error(
        'Stock reservation release requires an active transaction',
      );
    }

    const reservationRepo = manager.getRepository(StockReservationEntity);
    const reservations = await reservationRepo
      .createQueryBuilder('res')
      .setLock('pessimistic_write')
      .innerJoin(OrderItemEntity, 'oi', 'oi.id = res.orderItemId')
      .where('oi.orderId = :orderId AND res.status = :status', {
        orderId,
        status: StockReservationStatus.ACTIVE,
      })
      .orderBy('res.variantId', 'ASC')
      .addOrderBy('res.orderItemId', 'ASC')
      .getMany();

    if (reservations.length === 0) {
      return;
    }

    // Group quantities to release by variantId in sorted order
    const quantitiesByVariant = new Map<string, number>();
    for (const res of reservations) {
      const current = quantitiesByVariant.get(res.variantId) ?? 0;
      quantitiesByVariant.set(res.variantId, current + res.quantity);
    }

    const sortedVariantIds = Array.from(quantitiesByVariant.keys()).sort(
      (a, b) => a.localeCompare(b),
    );

    const balanceRepo = manager.getRepository(InventoryBalanceEntity);
    for (const variantId of sortedVariantIds) {
      const quantityToRelease = quantitiesByVariant.get(variantId)!;
      const balance = await this.lockBalance(manager, variantId);

      if (!balance || balance.reserved < quantityToRelease) {
        throw new ConflictException('Reserved stock could not be released');
      }

      balance.reserved -= quantityToRelease;
      await balanceRepo.save(balance);

      await this.stockMovementsService.recordMovement(manager, {
        variantId,
        type: StockMovementType.RESERVATION_RELEASED,
        quantity: quantityToRelease,
        reason: reason || `Reservation released for order ${orderId}`,
      });
    }

    for (const res of reservations) {
      res.status = StockReservationStatus.RELEASED;
      await reservationRepo.save(res);
    }
  }

  /**
   * 8. Cross-Domain Method for Warehouse Shipment:
   * Marks ACTIVE reservations as CONSUMED and subtracts from BOTH onHand and reserved.
   */
  async consumeForShipment(
    manager: EntityManager,
    orderId: string,
    actorId?: string,
  ): Promise<void> {
    const orderItems = await manager
      .getRepository(OrderItemEntity)
      .find({ where: { orderId } });

    if (orderItems.length === 0) {
      throw new ConflictException(`Order ${orderId} has no line items to ship`);
    }

    const reservationRepo = manager.getRepository(StockReservationEntity);
    const activeReservations = await reservationRepo
      .createQueryBuilder('res')
      .setLock('pessimistic_write')
      .innerJoin(OrderItemEntity, 'oi', 'oi.id = res.orderItemId')
      .where('oi.orderId = :orderId AND res.status = :status', {
        orderId,
        status: StockReservationStatus.ACTIVE,
      })
      .orderBy('res.variantId', 'ASC')
      .addOrderBy('res.orderItemId', 'ASC')
      .getMany();

    // Ensure every order item has a matching active reservation
    const reservationByItemId = new Map(
      activeReservations.map((r) => [r.orderItemId, r]),
    );
    const hasMismatch =
      activeReservations.length !== orderItems.length ||
      orderItems.some((item) => {
        const res = reservationByItemId.get(item.id);
        return (
          !res ||
          res.variantId !== item.variantId ||
          res.quantity !== item.quantity
        );
      });

    if (hasMismatch) {
      throw new ConflictException(
        `Integrity failure: active reservations do not match line items for order ${orderId}`,
      );
    }

    const balanceRepo = manager.getRepository(InventoryBalanceEntity);
    for (const res of activeReservations) {
      const balance = await this.lockBalance(manager, res.variantId);

      if (
        !balance ||
        balance.reserved < res.quantity ||
        balance.onHand < res.quantity
      ) {
        throw new ConflictException(
          `Cannot consume stock for variant ${res.variantId}`,
        );
      }

      balance.onHand -= res.quantity;
      balance.reserved -= res.quantity;
      await balanceRepo.save(balance);

      res.status = StockReservationStatus.CONSUMED;
      await reservationRepo.save(res);

      await this.stockMovementsService.recordMovement(manager, {
        variantId: res.variantId,
        actorId,
        type: StockMovementType.RESERVATION_CONSUMED,
        quantity: -res.quantity,
        reason: `Fulfillment shipment dispatch for order ${orderId}`,
      });
    }
  }
}
