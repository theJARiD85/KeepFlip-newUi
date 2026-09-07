import * as Application from 'expo-application';
import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const INSTALLATION_ID_KEY = 'keepflip.trial.installation-id.v1';
const HASH_NAMESPACE = 'keepflip|trial-device|v1|';

function cleanIdentifier(value: string | null | undefined) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

async function persistentInstallationId() {
  try {
    const existing = cleanIdentifier(
      await SecureStore.getItemAsync(INSTALLATION_ID_KEY),
    );
    if (existing) return existing;

    const next = Crypto.randomUUID();
    await SecureStore.setItemAsync(INSTALLATION_ID_KEY, next);
    return next;
  } catch {
    // A random value that cannot be persisted would let the same installation
    // appear new on each launch. Fail closed instead of issuing a weak trial.
    return null;
  }
}

async function deviceInstallationIdentifier() {
  try {
    if (Platform.OS === 'android') {
      const androidId = cleanIdentifier(Application.getAndroidId());
      if (androidId) return `android:${androidId}`;
    }

    if (Platform.OS === 'ios') {
      const iosId = cleanIdentifier(await Application.getIosIdForVendorAsync());
      if (iosId) return `ios:${iosId}`;
    }
  } catch {
    // Fall through to an installation-scoped ID for unsupported platforms.
  }

  const installId = await persistentInstallationId();
  return installId ? `install:${installId}` : null;
}

/**
 * Returns a one-way SHA-256 value for the entitlement service. The raw
 * Android ID, IDFV, and installation UUID never leave this device.
 */
export async function getKeepFlipTrialDeviceIdHash() {
  const identifier = await deviceInstallationIdentifier();
  if (!identifier) return null;

  return Crypto.digestStringAsync(
    Crypto.CryptoDigestAlgorithm.SHA256,
    `${HASH_NAMESPACE}${identifier}`,
  );
}
