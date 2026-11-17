import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { CatalogService } from '../catalog/catalog.service';
import { StockMovementsService } from '../stock-movements/stock-movements.service';
import { InventoryBalanceEntity } from './entities/inventory-balance.entity';
import { InventoryService } from './inventory.service';

describe('InventoryService', () => {
  let service: InventoryService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        InventoryService,
        { provide: getRepositoryToken(InventoryBalanceEntity), useValue: {} },
        { provide: StockMovementsService, useValue: {} },
        { provide: CatalogService, useValue: {} },
        { provide: DataSource, useValue: {} },
      ],
    }).compile();

    service = module.get<InventoryService>(InventoryService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });
});
