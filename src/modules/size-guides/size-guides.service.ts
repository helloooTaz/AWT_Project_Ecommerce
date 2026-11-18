import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Product } from '../catalog/entities/product.entity';
import type { CreateSizeGuideDto } from './dto/create-size-guide.dto';
import type { SizeGuideRangeDto } from './dto/size-guide-range.dto';
import type { UpdateSizeGuideDto } from './dto/update-size-guide.dto';
import { SizeGuideRange } from './entities/size-guide-range.entity';
import { SizeGuide } from './entities/size-guide.entity';

function toDecimalString(val: number | undefined): string | null {
  return val !== undefined && val !== null ? val.toFixed(2) : null;
}

@Injectable()
export class SizeGuidesService {
  constructor(
    @InjectRepository(SizeGuide)
    private readonly guides: Repository<SizeGuide>,
    @InjectRepository(SizeGuideRange)
    private readonly ranges: Repository<SizeGuideRange>,
    @InjectRepository(Product)
    private readonly products: Repository<Product>,
    private readonly dataSource: DataSource,
  ) {}

  private validateRanges(ranges: SizeGuideRangeDto[]): void {
    const sizes = ranges.map((r) => r.size.trim().toUpperCase());
    if (new Set(sizes).size !== sizes.length) {
      throw new BadRequestException('Size labels in ranges must be unique');
    }

    for (const r of ranges) {
      if (
        r.minHeightCm !== undefined &&
        r.maxHeightCm !== undefined &&
        r.minHeightCm > r.maxHeightCm
      ) {
        throw new BadRequestException(
          `For size "${r.size}", minHeightCm (${r.minHeightCm}) cannot exceed maxHeightCm (${r.maxHeightCm})`,
        );
      }
      if (
        r.minWeightKg !== undefined &&
        r.maxWeightKg !== undefined &&
        r.minWeightKg > r.maxWeightKg
      ) {
        throw new BadRequestException(
          `For size "${r.size}", minWeightKg (${r.minWeightKg}) cannot exceed maxWeightKg (${r.maxWeightKg})`,
        );
      }
      if (
        r.minChestCm !== undefined &&
        r.maxChestCm !== undefined &&
        r.minChestCm > r.maxChestCm
      ) {
        throw new BadRequestException(
          `For size "${r.size}", minChestCm cannot exceed maxChestCm`,
        );
      }
      if (
        r.minWaistCm !== undefined &&
        r.maxWaistCm !== undefined &&
        r.minWaistCm > r.maxWaistCm
      ) {
        throw new BadRequestException(
          `For size "${r.size}", minWaistCm cannot exceed maxWaistCm`,
        );
      }
      if (
        r.minHipCm !== undefined &&
        r.maxHipCm !== undefined &&
        r.minHipCm > r.maxHipCm
      ) {
        throw new BadRequestException(
          `For size "${r.size}", minHipCm cannot exceed maxHipCm`,
        );
      }

      const hasMeasurement = [
        r.minHeightCm,
        r.maxHeightCm,
        r.minWeightKg,
        r.maxWeightKg,
        r.minChestCm,
        r.maxChestCm,
        r.minWaistCm,
        r.maxWaistCm,
        r.minHipCm,
        r.maxHipCm,
      ].some((val) => val !== undefined && val !== null);

      if (!hasMeasurement) {
        throw new BadRequestException(
          `Size "${r.size}" must specify at least one valid measurement range`,
        );
      }
    }
  }

  async findByProductId(productId: string): Promise<SizeGuide> {
    const guide = await this.guides.findOne({
      where: { productId },
      relations: { ranges: true },
    });

    if (!guide) {
      throw new NotFoundException(
        `Size guide for product ${productId} was not found`,
      );
    }

    return guide;
  }

  async create(
    productId: string,
    input: CreateSizeGuideDto,
  ): Promise<SizeGuide> {
    const product = await this.products.findOne({ where: { id: productId } });
    if (!product) {
      throw new NotFoundException(`Product with ID ${productId} was not found`);
    }

    const existing = await this.guides.findOne({ where: { productId } });
    if (existing) {
      throw new ConflictException(
        `Product ${productId} already has a configured size guide`,
      );
    }

    this.validateRanges(input.ranges);

    return this.dataSource.transaction(async (manager) => {
      const guideRepo = manager.getRepository(SizeGuide);
      const rangeRepo = manager.getRepository(SizeGuideRange);

      const guide = guideRepo.create({
        productId,
        name: input.name.trim(),
        measurementUnit: 'cm',
      });

      const savedGuide = await guideRepo.save(guide);

      const rangesToCreate = rangeRepo.create(
        input.ranges.map((r) => ({
          sizeGuideId: savedGuide.id,
          size: r.size.trim().toUpperCase(),
          minHeightCm: toDecimalString(r.minHeightCm),
          maxHeightCm: toDecimalString(r.maxHeightCm),
          minWeightKg: toDecimalString(r.minWeightKg),
          maxWeightKg: toDecimalString(r.maxWeightKg),
          minChestCm: toDecimalString(r.minChestCm),
          maxChestCm: toDecimalString(r.maxChestCm),
          minWaistCm: toDecimalString(r.minWaistCm),
          maxWaistCm: toDecimalString(r.maxWaistCm),
          minHipCm: toDecimalString(r.minHipCm),
          maxHipCm: toDecimalString(r.maxHipCm),
        })),
      );

      savedGuide.ranges = await rangeRepo.save(rangesToCreate);
      return savedGuide;
    });
  }

  async update(
    productId: string,
    input: UpdateSizeGuideDto,
  ): Promise<SizeGuide> {
    const guide = await this.findByProductId(productId);

    if (input.ranges) {
      this.validateRanges(input.ranges);
    }

    return this.dataSource.transaction(async (manager) => {
      const guideRepo = manager.getRepository(SizeGuide);
      const rangeRepo = manager.getRepository(SizeGuideRange);

      if (input.name !== undefined) {
        guide.name = input.name.trim();
      }

      if (input.ranges !== undefined) {
        await rangeRepo.delete({ sizeGuideId: guide.id });

        const newRanges = rangeRepo.create(
          input.ranges.map((r) => ({
            sizeGuideId: guide.id,
            size: r.size.trim().toUpperCase(),
            minHeightCm: toDecimalString(r.minHeightCm),
            maxHeightCm: toDecimalString(r.maxHeightCm),
            minWeightKg: toDecimalString(r.minWeightKg),
            maxWeightKg: toDecimalString(r.maxWeightKg),
            minChestCm: toDecimalString(r.minChestCm),
            maxChestCm: toDecimalString(r.maxChestCm),
            minWaistCm: toDecimalString(r.minWaistCm),
            maxWaistCm: toDecimalString(r.maxWaistCm),
            minHipCm: toDecimalString(r.minHipCm),
            maxHipCm: toDecimalString(r.maxHipCm),
          })),
        );

        guide.ranges = await rangeRepo.save(newRanges);
      }

      return guideRepo.save(guide);
    });
  }

  async delete(
    productId: string,
  ): Promise<{ deleted: boolean; productId: string }> {
    const guide = await this.findByProductId(productId);
    await this.guides.remove(guide);
    return { deleted: true, productId };
  }
}
