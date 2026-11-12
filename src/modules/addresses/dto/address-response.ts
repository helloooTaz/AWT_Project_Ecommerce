import type { Address } from '../entities/address.entity';

export function addressResponse(address: Address) {
  return {
    id: address.id,
    recipient: address.recipient,
    phone: address.phone,
    addressLine1: address.addressLine1,
    addressLine2: address.addressLine2,
    city: address.city,
    createdAt: address.createdAt,
    updatedAt: address.updatedAt,
  };
}
