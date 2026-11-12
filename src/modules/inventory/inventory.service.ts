import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { InventoryBalance } from './entities/inventory-balance.entity';

@Injectable()
export class InventoryService {
  constructor(
    @InjectRepository(InventoryBalance)
    private readonly balances: Repository<InventoryBalance>,
  ) {}

  async getAvailability(variantIds: string[]): Promise<Map<string, number>> {
    const balances = await this.balances.findBy({ variantId: In(variantIds) });
    const availability = new Map(variantIds.map((id) => [id, 0]));
    for (const balance of balances) {
      availability.set(balance.variantId, balance.onHand - balance.reserved);
    }
    return availability;
  }
}
