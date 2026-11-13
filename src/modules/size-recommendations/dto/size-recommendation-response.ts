import type { Measurement } from '../size-matching';

export interface SizeRecommendationResponse {
  productId: string;
  status:
    | 'RECOMMENDED'
    | 'NO_GUIDE'
    | 'INSUFFICIENT_MEASUREMENTS'
    | 'NO_MATCH'
    | 'NO_ACTIVE_VARIANT';
  recommendedSize: string | null;
  bestFitSize: string | null;
  matchedMeasurements: Measurement[];
  confidence: 'LOW' | 'MODERATE' | null;
  reason: string;
  alternatives: string[];
  availableSizes: string[];
  variantAvailable: boolean;
  stockAvailable: boolean;
}
