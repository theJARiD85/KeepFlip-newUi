import * as SecureStore from 'expo-secure-store';

const LAUNCH_EXPERIENCE_COMPLETED_KEY =
  'keepflip.launch-experience.completed.v1';

export async function hasCompletedKeepFlipLaunchExperience() {
  try {
    return (
      (await SecureStore.getItemAsync(LAUNCH_EXPERIENCE_COMPLETED_KEY)) ===
      'true'
    );
  } catch {
    return false;
  }
}

export async function markKeepFlipLaunchExperienceCompleted() {
  try {
    await SecureStore.setItemAsync(
      LAUNCH_EXPERIENCE_COMPLETED_KEY,
      'true',
    );
  } catch {
    // The launch experience remains fail-safe if secure storage is unavailable.
    // A future launch can show it again rather than skipping required setup.
  }
}
