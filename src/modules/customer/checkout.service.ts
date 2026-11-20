import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { Address, CartItem, Order, OrderItem } from '../../database/entities';
import { InventoryService } from '../inventory/inventory.service';
import { CatalogService } from '../staff/catalog.service';
import { CartService } from './cart.service';
import { toOrderDetail, type OrderDetailDto } from './order-history.dto';

const MAX_ORDER_TOTAL_MINOR = 2_147_483_647;

@Injectable()
export class CheckoutService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly carts: CartService,
    private readonly catalog: CatalogService,
    private readonly inventory: InventoryService,
  ) {}

  placeOrder(userId: string, addressId: string): Promise<OrderDetailDto> {
    return this.dataSource.transaction(async (manager) => {
      const cart = await this.carts.lockCart(manager, userId);
      if (!cart) throw new BadRequestException('Cart is empty');

      const cartItems = manager.getRepository(CartItem);
      const items = await cartItems.find({
        where: { cartId: cart.id },
        order: { variantId: 'ASC' },
      });
      if (items.length === 0) throw new BadRequestException('Cart is empty');

      const address = await manager.getRepository(Address).findOneBy({ id: addressId, userId });
      if (!address) throw new NotFoundException('Address not found');
      const { recipientName, phone, line1, line2, city, postalCode, countryCode } = address;
      const shippingAddress = { recipientName, phone, line1, line2, city, postalCode, countryCode };

      const variantIds = items.map(({ variantId }) => variantId);
      const variants = await this.catalog.findSellableVariants(manager, variantIds);
      const variantsById = new Map(variants.map((variant) => [variant.id, variant]));

      let totalMinor = 0;
      const snapshots = items.map(({ variantId, quantity }) => {
        const variant = variantsById.get(variantId);
        if (!variant) throw new ConflictException('Cart contains an unavailable variant');

        const { sku, productName, size, color, priceMinor } = variant;
        // Products of PostgreSQL integers are exact whenever they fit this limit.
        const lineTotal = priceMinor * quantity;
        if (lineTotal > MAX_ORDER_TOTAL_MINOR || totalMinor + lineTotal > MAX_ORDER_TOTAL_MINOR) {
          throw new BadRequestException('Order total exceeds the supported range');
        }
        totalMinor += lineTotal;
        return { variantId, sku, productName, size, color, quantity, unitPriceMinor: priceMinor };
      });

      const orders = manager.getRepository(Order);
      const order = await orders.save(orders.create({ userId, shippingAddress, totalMinor }));
      order.items = await manager.getRepository(OrderItem).save(snapshots.map((item) => ({
        ...item, orderId: order.id,
      })));

      // Deduct stock in the same order across checkouts to avoid deadlocks.
      for (const { variantId, quantity } of items) {
        await this.inventory.deductStock(manager, variantId, quantity, userId, order.id);
      }
      await cartItems.delete({ cartId: cart.id });
      order.items.sort((left, right) => left.id.localeCompare(right.id));
      return toOrderDetail(order);
    });
  }
}
