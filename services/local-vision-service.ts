import { emptyLocalVisionSignals } from '@/services/local-vision-heuristics';
import type {
  LocalVisionOptions,
  LocalVisionSignals,
} from '@/services/local-vision-service.types';

export async function analyzePhotosLocally(
  _photoUris: string[],
  _options: LocalVisionOptions = {},
): Promise<LocalVisionSignals> {
  return emptyLocalVisionSignals();
}

export type {
  LocalVisionOptions,
  LocalVisionSignals,
} from '@/services/local-vision-service.types';
