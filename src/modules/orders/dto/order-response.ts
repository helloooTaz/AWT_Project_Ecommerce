import type { Order } from '../entities/order.entity';

export function orderSummary(order: Order) {
  return {
    id: order.id,
    status: order.status,
    currency: order.currency,
    totalMinor: order.totalMinor,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
  };
}

export function orderDetail(order: Order) {
  return {
    ...orderSummary(order),
    shippingAddressSnapshot: order.shippingAddressSnapshot,
    items: order.items.map((item) => ({
      id: item.id,
      variantId: item.variantId,
      skuSnapshot: item.skuSnapshot,
      nameSnapshot: item.nameSnapshot,
      sizeSnapshot: item.sizeSnapshot,
      colorSnapshot: item.colorSnapshot,
      unitPriceMinor: item.unitPriceMinor,
      quantity: item.quantity,
      lineTotalMinor: item.lineTotalMinor,
      createdAt: item.createdAt,
    })),
  };
}
