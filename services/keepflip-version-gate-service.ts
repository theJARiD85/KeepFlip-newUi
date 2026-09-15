import Constants from 'expo-constants';
import * as Linking from 'expo-linking';
import { Platform } from 'react-native';

/**
 * The first release that contains the subscription experience required by the
 * current KeepFlip account and feature policy.
 *
 * This is intentionally a version-name cutoff rather than an Android
 * versionCode cutoff so the same policy can be used by Android and iOS.
 */
export const KEEPFLIP_MINIMUM_SUPPORTED_VERSION = '2.0.7';

const KEEPFLIP_ANDROID_PACKAGE_ID = 'com.keepflip.app';
const KEEPFLIP_ANDROID_MARKET_URL =
  `market://details?id=${KEEPFLIP_ANDROID_PACKAGE_ID}`;
const KEEPFLIP_ANDROID_STORE_URL =
  `https://play.google.com/store/apps/details?id=${KEEPFLIP_ANDROID_PACKAGE_ID}`;
const KEEPFLIP_IOS_STORE_URL =
  process.env.EXPO_PUBLIC_KEEPFLIP_IOS_STORE_URL?.trim() ||
  'https://apps.apple.com/us/search?term=KeepFlip';

type ParsedKeepFlipVersion = {
  core: [number, number, number];
  prerelease: string[] | null;
};

export type KeepFlipVersionGateState = {
  currentVersion: string;
  minimumVersion: string;
  updateRequired: boolean;
};

function parseKeepFlipVersion(value: string): ParsedKeepFlipVersion | null {
  const match = /^v?(\d+)(?:\.(\d+))?(?:\.(\d+))?(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/i.exec(
    value.trim(),
  );

  if (!match) return null;

  const core = [match[1], match[2] ?? '0', match[3] ?? '0'].map(Number);
  if (core.some((part) => !Number.isSafeInteger(part) || part < 0)) {
    return null;
  }

  return {
    core: core as [number, number, number],
    prerelease: match[4] ? match[4].split('.') : null,
  };
}

function comparePrereleaseIdentifiers(
  left: string[],
  right: string[],
): number {
  const length = Math.max(left.length, right.length);

  for (let index = 0; index < length; index += 1) {
    const leftIdentifier = left[index];
    const rightIdentifier = right[index];

    if (leftIdentifier === undefined) return -1;
    if (rightIdentifier === undefined) return 1;
    if (leftIdentifier === rightIdentifier) continue;

    const leftIsNumeric = /^\d+$/.test(leftIdentifier);
    const rightIsNumeric = /^\d+$/.test(rightIdentifier);

    if (leftIsNumeric && rightIsNumeric) {
      return Number(leftIdentifier) < Number(rightIdentifier) ? -1 : 1;
    }
    if (leftIsNumeric !== rightIsNumeric) return leftIsNumeric ? -1 : 1;

    return leftIdentifier < rightIdentifier ? -1 : 1;
  }

  return 0;
}

/**
 * Compares two KeepFlip semantic versions. Returns null when either value is
 * not a valid one-to-three-part version string.
 */
export function compareKeepFlipVersions(
  left: string,
  right: string,
): number | null {
  const parsedLeft = parseKeepFlipVersion(left);
  const parsedRight = parseKeepFlipVersion(right);

  if (!parsedLeft || !parsedRight) return null;

  for (let index = 0; index < parsedLeft.core.length; index += 1) {
    if (parsedLeft.core[index] === parsedRight.core[index]) continue;
    return parsedLeft.core[index] < parsedRight.core[index] ? -1 : 1;
  }

  if (parsedLeft.prerelease === null && parsedRight.prerelease === null) {
    return 0;
  }
  if (parsedLeft.prerelease === null) return 1;
  if (parsedRight.prerelease === null) return -1;

  return comparePrereleaseIdentifiers(
    parsedLeft.prerelease,
    parsedRight.prerelease,
  );
}

export function getKeepFlipCurrentAppVersion() {
  const nativeVersion = Constants.nativeAppVersion?.trim();
  if (nativeVersion) return nativeVersion;

  const configuredVersion = Constants.expoConfig?.version?.trim();
  return configuredVersion || '0.0.0';
}

export function isKeepFlipVersionSupported(
  currentVersion: string,
  minimumVersion = KEEPFLIP_MINIMUM_SUPPORTED_VERSION,
) {
  const comparison = compareKeepFlipVersions(currentVersion, minimumVersion);
  // An unreadable version fails closed. A release with an unknown version
  // should not bypass the migration gate accidentally.
  return comparison !== null && comparison >= 0;
}

export function getKeepFlipVersionGateState(
  currentVersion = getKeepFlipCurrentAppVersion(),
  minimumVersion = KEEPFLIP_MINIMUM_SUPPORTED_VERSION,
): KeepFlipVersionGateState {
  return {
    currentVersion,
    minimumVersion,
    updateRequired: !isKeepFlipVersionSupported(currentVersion, minimumVersion),
  };
}

function configuredUpdateUrl() {
  return process.env.EXPO_PUBLIC_KEEPFLIP_UPDATE_URL?.trim() || '';
}

export function getKeepFlipUpdateUrl() {
  return (
    configuredUpdateUrl() ||
    (Platform.OS === 'ios' ? KEEPFLIP_IOS_STORE_URL : KEEPFLIP_ANDROID_STORE_URL)
  );
}

export async function openKeepFlipUpdatePage() {
  const configuredUrl = configuredUpdateUrl();
  if (configuredUrl) {
    await Linking.openURL(configuredUrl);
    return;
  }

  if (Platform.OS === 'android') {
    try {
      if (await Linking.canOpenURL(KEEPFLIP_ANDROID_MARKET_URL)) {
        await Linking.openURL(KEEPFLIP_ANDROID_MARKET_URL);
        return;
      }
    } catch {
      // Fall back to the browser URL below when Play Store app routing is not
      // available in the current device or emulator.
    }
  }

  await Linking.openURL(getKeepFlipUpdateUrl());
}
