import {
  createCrosslistingAutomationPlan,
  type CrosslistingAutomationInput,
} from '@/services/crosslisting-automation-plan';
import { requestCrosslistingExtension } from '@/services/crosslisting-extension-bridge.web';
import { loadCrosslistingExtensionPhotos } from '@/services/crosslisting-extension-photos.web';

type DesktopDispatchInput = CrosslistingAutomationInput & {
  ownerId: string;
  runId: string;
  onPhotosReady?: () => void;
};

/** Send the generated run through the installed extension's versioned, same-origin bridge. */
export async function dispatchToAutomationEngine({
  ownerId, runId, onPhotosReady, ...input
}: DesktopDispatchInput) {
  const plan = createCrosslistingAutomationPlan(input);
  const { photos, unavailablePhotoCount } = await loadCrosslistingExtensionPhotos(plan.photoFileIds);
  onPhotosReady?.();
  const reply = await requestCrosslistingExtension({
    action: 'LISTING_START',
    ownerId,
    itemId: input.item.id,
    runId,
    jobs: plan.jobs,
    photos,
    unavailablePhotoCount,
  });
  if (!reply.run?.jobs.length) {
    throw new Error('KeepFlip extension did not open any marketplace tabs. Try this listing run again.');
  }
  return reply.run.jobs;
}
