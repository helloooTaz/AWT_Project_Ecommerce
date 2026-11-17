import { SizeGuideRange } from '../size-guides/entities/size-guide-range.entity';
import { rankSizeMatches } from './size-matching';

const input = { heightCm: 175, weightKg: 70 };

function range(size: string, bounds: Partial<SizeGuideRange>) {
  return Object.assign(new SizeGuideRange(), {
    size,
    minHeightCm: null,
    maxHeightCm: null,
    minWeightKg: null,
    maxWeightKg: null,
    minChestCm: null,
    maxChestCm: null,
    minWaistCm: null,
    maxWaistCm: null,
    minHipCm: null,
    maxHipCm: null,
    ...bounds,
  });
}

describe('size guide matching', () => {
  it('ranks by normalized midpoint distance across units and range widths', () => {
    const narrow = range('M', {
      minHeightCm: '173',
      maxHeightCm: '175',
      minWeightKg: '65',
      maxWeightKg: '75',
    });
    const wide = range('L', {
      minHeightCm: '165',
      maxHeightCm: '195',
      minWeightKg: '60',
      maxWeightKg: '80',
    });
    const { matches } = rankSizeMatches([narrow, wide], input);
    expect(matches.map(({ size }) => size)).toEqual(['L', 'M']);
    expect(matches[1].matchedMeasurements).toEqual(['height', 'weight']);
  });

  it('breaks ties by number of compared measurements and then by label', () => {
    const medium = range('M', { minHeightCm: '170', maxHeightCm: '180' });
    const large = range('L', { minHeightCm: '170', maxHeightCm: '180' });
    const small = range('S', {
      minHeightCm: '170',
      maxHeightCm: '180',
      minWeightKg: '65',
      maxWeightKg: '75',
    });
    for (const ranges of [
      [medium, large, small],
      [small, large, medium],
    ]) {
      const { matches } = rankSizeMatches(ranges, input);
      expect(matches.map(({ size }) => size)).toEqual(['S', 'L', 'M']);
    }
  });

  it('accepts inclusive one-sided and exact decimal bounds', () => {
    const { matches } = rankSizeMatches(
      [
        range('L', { minChestCm: '98.25' }),
        range('S', { maxChestCm: '98.25' }),
        range('M', { minChestCm: '98.25', maxChestCm: '98.25' }),
      ],
      { ...input, chestCm: 98.25 },
    );
    expect(matches.map(({ size }) => size)).toEqual(['M', 'L', 'S']);
    expect(matches[0]).toMatchObject({
      distance: 0,
      matchedMeasurements: ['chest'],
    });
  });

  it('rejects a range when any comparable measurement is outside its bounds', () => {
    expect(
      rankSizeMatches([range('M', { minHeightCm: '170', maxWaistCm: '80' })], {
        ...input,
        waistCm: 81,
      }),
    ).toEqual({ matches: [], hasComparableMeasurements: true });
  });

  it('reports no comparable measurements when the guide uses omitted fields', () => {
    expect(rankSizeMatches([range('M', { maxHipCm: '100' })], input)).toEqual({
      matches: [],
      hasComparableMeasurements: false,
    });
  });
});
