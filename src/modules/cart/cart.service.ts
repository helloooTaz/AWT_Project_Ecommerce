import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CatalogService } from '../catalog/catalog.service';
import { InventoryService } from '../inventory/inventory.service';
import type { AddCartItemDto } from './dto/add-cart-item.dto';
import { CartItem } from './entities/cart-item.entity';
import { Cart } from './entities/cart.entity';

@Injectable()
export class CartService {
  constructor(
    @InjectRepository(Cart) private readonly carts: Repository<Cart>,
    @InjectRepository(CartItem) private readonly items: Repository<CartItem>,
    private readonly catalog: CatalogService,
    private readonly inventory: InventoryService,
  ) {}

  async get(userId: string) {
    const cartItems = await this.items.find({
      where: { cart: { userId } },
      order: { id: 'ASC' },
    });
    if (cartItems.length === 0) {
      return { items: [], subtotalMinor: 0, currency: 'BDT' };
    }

    const variantIds = cartItems.map((item) => item.variantId);
    const [variants, availability] = await Promise.all([
      this.catalog.findVariantsWithProducts(variantIds),
      this.inventory.getAvailability(variantIds),
    ]);
    const variantsById = new Map(
      variants.map((variant) => [variant.id, variant]),
    );
    const items = cartItems.map(({ id, variantId, quantity }) => {
      const variant = variantsById.get(variantId);
      const product = variant?.product;
      const availableQuantity = variant
        ? (availability.get(variantId) ?? 0)
        : 0;
      return {
        id,
        variantId,
        quantity,
        product: product
          ? {
              id: product.id,
              name: product.name,
              slug: product.slug,
              status: product.status,
            }
          : null,
        variant: variant
          ? {
              sku: variant.sku,
              size: variant.size,
              color: variant.color,
              isActive: variant.isActive,
            }
          : null,
        priceMinor: variant?.priceMinor ?? null,
        availableQuantity,
        canPurchase:
          !!variant &&
          this.catalog.isPurchasable(variant) &&
          availableQuantity >= quantity,
      };
    });

    const subtotal = items.reduce(
      (sum, item) => sum + BigInt(item.priceMinor ?? 0) * BigInt(item.quantity),
      0n,
    );
    const subtotalMinor =
      subtotal <= BigInt(Number.MAX_SAFE_INTEGER) ? Number(subtotal) : null;
    return { items, subtotalMinor, currency: 'BDT' };
  }

  async add(userId: string, { variantId, quantity }: AddCartItemDto) {
    const [variant] = await this.catalog.findVariantsWithProducts([variantId]);
    if (!variant || !this.catalog.isPurchasable(variant)) {
      if (await this.items.existsBy({ variantId, cart: { userId } })) {
        throw new ConflictException('Variant is already in your cart');
      }
      throw new NotFoundException('Purchasable variant not found');
    }

    return this.carts.manager.transaction(async (manager) => {
      const carts = manager.getRepository(Cart);
      const items = manager.getRepository(CartItem);

      // The unique user key lets simultaneous requests reuse the same cart.
      await carts
        .createQueryBuilder()
        .insert()
        .values({ userId })
        .orIgnore()
        .execute();
      const cart = await carts.findOneByOrFail({ userId });
      const item = await items.save(
        items.create({ cartId: cart.id, variantId: variant.id, quantity }),
      );
      return {
        id: item.id,
        variantId: item.variantId,
        quantity: item.quantity,
      };
    });
  }

  async update(userId: string, id: string, quantity: number) {
    const item = await this.getOwnedItem(userId, id);
    const { affected } = await this.items.update(
      { id: item.id, cartId: item.cartId },
      { quantity },
    );
    if (!affected) {
      throw new NotFoundException('Cart item not found');
    }
    return { id: item.id, variantId: item.variantId, quantity };
  }

  async remove(userId: string, id: string): Promise<void> {
    const item = await this.getOwnedItem(userId, id);
    const { affected } = await this.items.delete({
      id: item.id,
      cartId: item.cartId,
    });
    if (!affected) {
      throw new NotFoundException('Cart item not found');
    }
  }

  private async getOwnedItem(userId: string, id: string): Promise<CartItem> {
    const item = await this.items.findOneBy({ id, cart: { userId } });
    if (!item) {
      throw new NotFoundException('Cart item not found');
    }
    return item;
  }
}
