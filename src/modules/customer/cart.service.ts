import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { Cart, CartItem, ProductVariant } from '../../database/entities';
import type { CartResponseDto } from './cart.dto';

@Injectable()
export class CartService {
  constructor(private readonly dataSource: DataSource) {}

  get(userId: string): Promise<CartResponseDto> {
    return this.readCart(this.dataSource.manager, userId);
  }

  setItem(userId: string, variantId: string, quantity: number): Promise<CartResponseDto> {
    return this.dataSource.transaction(async (manager) => {
      const carts = manager.getRepository(Cart);
      let cart = await this.lockCart(manager, userId);
      if (!cart) {
        // A concurrent first PUT may insert this user's cart before this one.
        await carts.createQueryBuilder().insert().values({ userId })
          .onConflict('("userId") DO NOTHING').execute();
        cart = await carts.findOneOrFail({ where: { userId }, lock: { mode: 'pessimistic_write' } });
      }

      const variant = await manager.getRepository(ProductVariant).findOne({
        where: { id: variantId },
        relations: { product: true },
      });
      if (!variant) throw new NotFoundException('Variant not found');
      if (!this.isAvailable(variant)) throw new ConflictException('Variant is unavailable');

      await manager.getRepository(CartItem).upsert({ cartId: cart.id, variantId, quantity }, {
        conflictPaths: ['cartId', 'variantId'],
        skipUpdateIfNoValuesChanged: true,
      });
      return this.readCart(manager, userId);
    });
  }

  removeItem(userId: string, variantId: string): Promise<void> {
    return this.dataSource.transaction(async (manager) => {
      const cart = await this.lockCart(manager, userId);
      if (!cart) throw new NotFoundException('Cart item not found');

      const result = await manager.getRepository(CartItem).delete({ cartId: cart.id, variantId });
      if (!result.affected) throw new NotFoundException('Cart item not found');
    });
  }

  lockCart(manager: EntityManager, userId: string): Promise<Cart | null> {
    // Cart mutations and checkout take this lock before accessing the items.
    return manager.getRepository(Cart).findOne({ where: { userId }, lock: { mode: 'pessimistic_write' } });
  }

  private async readCart(manager: EntityManager, userId: string): Promise<CartResponseDto> {
    const cart = await manager.getRepository(Cart).createQueryBuilder('cart')
      .leftJoinAndSelect('cart.items', 'item')
      .leftJoinAndSelect('item.variant', 'variant')
      .leftJoinAndSelect('variant.product', 'product')
      .where('cart.userId = :userId', { userId })
      .orderBy('item.variantId', 'ASC')
      .getOne();
    if (!cart) return { id: null, items: [], totalMinor: 0 };

    const items = cart.items.map(({ variant, variantId, quantity }) => ({
      variantId,
      sku: variant.sku,
      productName: variant.product.name,
      size: variant.size,
      color: variant.color,
      quantity,
      unitPriceMinor: variant.priceMinor,
      available: this.isAvailable(variant),
    }));
    const totalMinor = items.reduce((total, item) =>
      total + (item.available ? item.quantity * item.unitPriceMinor : 0), 0);
    if (!Number.isSafeInteger(totalMinor)) throw new ConflictException('Cart total is too large');

    return { id: cart.id, items, totalMinor };
  }

  private isAvailable(variant: ProductVariant): boolean {
    return variant.isActive && variant.product.isActive;
  }
}
