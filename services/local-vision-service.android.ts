import KeepFlipLocalVisionModule from '@/modules/keepflip-local-vision/src/KeepFlipLocalVisionModule';
import type { KeepFlipLocalVisionResult } from '@/modules/keepflip-local-vision/src/KeepFlipLocalVision.types';
import {
  combineLocalVisionResults,
  emptyLocalVisionSignals,
} from '@/services/local-vision-heuristics';
import type {
  LocalVisionOptions,
  LocalVisionSignals,
} from '@/services/local-vision-service.types';

const DEFAULT_TIMEOUT_MS = 4_500;
const MAX_LOCAL_PHOTOS = 2;

function selectedPhotoUris(photoUris: string[]) {
  const cleaned = photoUris.map((uri) => uri.trim()).filter(Boolean);
  if (cleaned.length <= MAX_LOCAL_PHOTOS) return cleaned;
  return [cleaned[0], cleaned[cleaned.length - 1]].filter(
    (uri, index, all) => all.indexOf(uri) === index,
  );
}

function abortError() {
  const error = new Error('On-device analysis was cancelled.');
  error.name = 'AbortError';
  return error;
}

function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  signal?: AbortSignal,
): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (callback: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      signal?.removeEventListener('abort', onAbort);
      callback();
    };
    const onAbort = () => finish(() => reject(abortError()));
    const timeout = setTimeout(
      () => finish(() => reject(new Error('On-device analysis timed out.'))),
      timeoutMs,
    );
    signal?.addEventListener('abort', onAbort, { once: true });
    promise.then(
      (value) => finish(() => resolve(value)),
      (error) => finish(() => reject(error)),
    );
  });
}

export async function analyzePhotosLocally(
  photoUris: string[],
  options: LocalVisionOptions = {},
): Promise<LocalVisionSignals> {
  const startedAt = Date.now();
  const selected = selectedPhotoUris(photoUris);
  if (!selected.length) return emptyLocalVisionSignals('no_local_photos');

  try {
    const results = await withTimeout(
      (async () => {
        const analyzed: KeepFlipLocalVisionResult[] = [];
        for (const uri of selected) {
          analyzed.push(
            await KeepFlipLocalVisionModule.analyzeImage(uri).catch(
              (): KeepFlipLocalVisionResult => ({
                barcodes: [],
                labels: [],
                lines: [],
                processingMs: 0,
                text: '',
                warnings: ['local_photo_analysis_failed'],
              }),
            ),
          );
        }
        return analyzed;
      })(),
      options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
      options.signal,
    );
    return combineLocalVisionResults(results, Date.now() - startedAt);
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw error;
    return emptyLocalVisionSignals(
      error instanceof Error && /timed out/i.test(error.message)
        ? 'on_device_vision_timeout'
        : 'on_device_vision_failed',
    );
  }
}

export type {
  LocalVisionOptions,
  LocalVisionSignals,
} from '@/services/local-vision-service.types';
