import * as SecureStore from 'expo-secure-store';

export type KeepFlipAppearancePreference = 'system' | 'light' | 'dark';

const APPEARANCE_PREFERENCE_KEY = 'keepflip.appearance.preference.v1';

function isAppearancePreference(value: string | null): value is KeepFlipAppearancePreference {
  return value === 'system' || value === 'light' || value === 'dark';
}

export async function getKeepFlipAppearancePreference(): Promise<KeepFlipAppearancePreference> {
  try {
    const saved = await SecureStore.getItemAsync(APPEARANCE_PREFERENCE_KEY);
    return isAppearancePreference(saved) ? saved : 'system';
  } catch {
    return 'system';
  }
}

export async function saveKeepFlipAppearancePreference(
  preference: KeepFlipAppearancePreference,
) {
  await SecureStore.setItemAsync(APPEARANCE_PREFERENCE_KEY, preference);
}
