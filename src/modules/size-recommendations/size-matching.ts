import type { SizeGuideRange } from '../size-guides/entities/size-guide-range.entity';
import type { SizeRecommendationDto } from './dto/size-recommendation.dto';

const measurements = [
  ['height', 'heightCm', 'minHeightCm', 'maxHeightCm'],
  ['weight', 'weightKg', 'minWeightKg', 'maxWeightKg'],
  ['chest', 'chestCm', 'minChestCm', 'maxChestCm'],
  ['waist', 'waistCm', 'minWaistCm', 'maxWaistCm'],
  ['hip', 'hipCm', 'minHipCm', 'maxHipCm'],
] as const;

export type Measurement = (typeof measurements)[number][0];

export function compareSizeLabels(a: string, b: string): number {
  return a < b ? -1 : Number(a > b);
}

export function rankSizeMatches(
  ranges: readonly SizeGuideRange[],
  input: SizeRecommendationDto,
) {
  let hasComparableMeasurements = false;
  const matches = ranges.flatMap((range) => {
    const matchedMeasurements: Measurement[] = [];
    const distances: number[] = [];

    for (const [name, field, minField, maxField] of measurements) {
      const value = input[field];
      const min = range[minField] === null ? null : Number(range[minField]);
      const max = range[maxField] === null ? null : Number(range[maxField]);
      if (value === undefined || (min === null && max === null)) {
        continue;
      }

      hasComparableMeasurements = true;
      if ((min !== null && value < min) || (max !== null && value > max)) {
        return [];
      }

      matchedMeasurements.push(name);
      if (min !== null && max !== null) {
        const width = max - min;
        distances.push(width === 0 ? 0 : Math.abs((value - min) / width - 0.5));
      }
    }

    if (matchedMeasurements.length === 0) {
      return [];
    }

    // Two-sided scores are at most 0.5. One-sided-only matches have no midpoint.
    const distance = distances.length
      ? distances.reduce((sum, value) => sum + value, 0) / distances.length
      : 1;
    return [
      {
        size: range.size,
        matchedMeasurements,
        distance: Number(distance.toFixed(12)),
      },
    ];
  });

  matches.sort(
    (a, b) =>
      a.distance - b.distance ||
      b.matchedMeasurements.length - a.matchedMeasurements.length ||
      compareSizeLabels(a.size, b.size),
  );
  return { matches, hasComparableMeasurements };
}
