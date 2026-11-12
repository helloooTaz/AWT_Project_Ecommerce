import { createHash } from 'node:crypto';
import {
  BadRequestException,
  ConflictException,
  Injectable,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { AddressesService } from '../addresses/addresses.service';
import { CartService } from '../cart/cart.service';
import { CatalogService } from '../catalog/catalog.service';
import { InventoryService } from '../inventory/inventory.service';
import { OrdersService } from '../orders/orders.service';
import { IdempotencyRecord } from './entities/idempotency-record.entity';

const maxPostgresBigInt = 9223372036854775807n;
const reservationDurationMs = 15 * 60 * 1000;

@Injectable()
export class CheckoutService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly cart: CartService,
    private readonly addresses: AddressesService,
    private readonly catalog: CatalogService,
    private readonly orders: OrdersService,
    private readonly inventory: InventoryService,
  ) {}

  async checkout(userId: string, addressId: string, requestKey: string) {
    const normalizedAddressId = addressId.toLowerCase();
    const requestHash = createHash('sha256')
      .update(normalizedAddressId)
      .digest('hex');

    return this.dataSource.transaction('READ COMMITTED', async (manager) => {
      // The cart row remains after checkout and serializes both same-key
      // retries and different keys competing to purchase the same items.
      const cartId = await this.cart.lockForCheckout(manager, userId);
      const records = manager.getRepository(IdempotencyRecord);
      const existing = await records.findOne({
        where: { userId, requestKey },
        relations: { order: true },
      });
      if (existing) {
        if (existing.requestHash !== requestHash) {
          throw new ConflictException(
            'Idempotency key already used for a different request',
          );
        }
        return { order: existing.order, replayed: true };
      }

      const { recipient, phone, addressLine1, addressLine2, city } =
        await this.addresses.get(userId, normalizedAddressId, manager);
      const cartItems = cartId
        ? await this.cart.getCheckoutItems(manager, cartId)
        : [];
      if (!cartId || cartItems.length === 0) {
        throw new BadRequestException('Cart is empty');
      }

      const variants = await this.catalog.getPurchasableVariants(
        manager,
        cartItems.map(({ variantId }) => variantId),
      );
      let total = 0n;
      const items = variants.map((variant, index) => {
        if (!/^\d+$/.test(variant.priceMinor)) {
          throw new ConflictException('Variant price is invalid');
        }
        const quantity = cartItems[index].quantity;
        const lineTotal = BigInt(variant.priceMinor) * BigInt(quantity);
        total += lineTotal;
        if (total > maxPostgresBigInt) {
          throw new ConflictException(
            'Order total exceeds the supported amount',
          );
        }
        return {
          variantId: variant.variantId,
          skuSnapshot: variant.sku,
          nameSnapshot: variant.productName,
          sizeSnapshot: variant.size,
          colorSnapshot: variant.color,
          unitPriceMinor: variant.priceMinor,
          quantity,
          lineTotalMinor: lineTotal.toString(),
        };
      });
      const pending = await this.orders.createPendingOrder(
        manager,
        {
          userId,
          shippingAddressSnapshot: {
            recipient,
            phone,
            addressLine1,
            addressLine2,
            city,
          },
          totalMinor: total.toString(),
        },
        items,
      );
      await this.inventory.reserveForOrder(
        manager,
        pending.items.map(({ id, variantId, quantity }) => ({
          orderItemId: id,
          variantId,
          quantity,
        })),
        new Date(Date.now() + reservationDurationMs),
      );
      await records.insert({
        userId,
        requestKey,
        requestHash,
        orderId: pending.order.id,
      });
      await this.cart.clearPurchasedItems(
        manager,
        cartId,
        cartItems.map(({ id }) => id),
      );
      return { order: pending.order, replayed: false };
    });
  }
}
