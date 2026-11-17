import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { CatalogService } from '../catalog/catalog.service';
import { InventoryService } from '../inventory/inventory.service';
import { SizeGuide } from '../size-guides/entities/size-guide.entity';
import type { SizeRecommendationResponse } from './dto/size-recommendation-response';
import type { SizeRecommendationDto } from './dto/size-recommendation.dto';
import { compareSizeLabels, rankSizeMatches } from './size-matching';

@Injectable()
export class SizeRecommendationService {
  constructor(
    @InjectRepository(SizeGuide)
    private readonly guides: Repository<SizeGuide>,
    private readonly catalog: CatalogService,
    private readonly inventory: InventoryService,
  ) {}

  async recommend(
    productId: string,
    input: SizeRecommendationDto,
  ): Promise<SizeRecommendationResponse> {
    const product =
      await this.catalog.findPublishedProductWithActiveVariants(productId);
    if (!product) {
      throw new NotFoundException('Product not found');
    }

    const guide = await this.guides.findOne({
      where: { productId: product.id },
      relations: { ranges: true },
    });
    const activeSizes = new Set(product.variants.map(({ size }) => size));
    const result: SizeRecommendationResponse = {
      productId: product.id,
      status: 'NO_GUIDE',
      recommendedSize: null,
      bestFitSize: null,
      matchedMeasurements: [],
      confidence: null,
      reason: 'This product has no configured size guide with ranges.',
      alternatives: [],
      availableSizes: [...activeSizes].sort(compareSizeLabels),
      variantAvailable: false,
      stockAvailable: false,
    };
    if (!guide?.ranges.length) {
      return result;
    }

    const { matches, hasComparableMeasurements } = rankSizeMatches(
      guide.ranges,
      input,
    );
    const [best, ...otherMatches] = matches;
    if (!best) {
      return hasComparableMeasurements
        ? {
            ...result,
            status: 'NO_MATCH',
            reason:
              'Your measurements fall outside this product’s size guide ranges.',
          }
        : {
            ...result,
            status: 'INSUFFICIENT_MEASUREMENTS',
            reason:
              'Provide a chest, waist or hip measurement covered by this product’s size guide.',
          };
    }

    const { size, matchedMeasurements } = best;
    const limitedFit =
      matchedMeasurements.length === 1 ||
      matchedMeasurements.every(
        (name) => name === 'height' || name === 'weight',
      );
    result.bestFitSize = size;
    result.matchedMeasurements = matchedMeasurements;
    result.confidence = limitedFit ? 'LOW' : 'MODERATE';
    result.alternatives = otherMatches
      .map((match) => match.size)
      .filter((label) => activeSizes.has(label));

    const variants = product.variants.filter(
      (variant) => variant.size === size,
    );
    if (!variants.length) {
      return {
        ...result,
        status: 'NO_ACTIVE_VARIANT',
        reason: `Size ${size} best fits the compared measurements but has no active variant.`,
      };
    }

    const availability = await this.inventory.getAvailability(
      variants.map(({ id }) => id),
    );
    return {
      ...result,
      status: 'RECOMMENDED',
      recommendedSize: size,
      reason: limitedFit
        ? `Size ${size} fits the compared measurements. This estimate uses limited measurements.`
        : `Your compared measurements fall within this product’s size ${size} range.`,
      variantAvailable: true,
      stockAvailable: [...availability.values()].some(
        (quantity) => quantity > 0,
      ),
    };
  }
}
