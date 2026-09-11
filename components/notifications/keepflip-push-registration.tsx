import { useEffect, useRef } from 'react';

import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { ID } from 'react-native-appwrite';
import { Platform } from 'react-native';

import { useKeepFlipAuth } from '@/components/auth/keepflip-auth-context';
import { getAppwriteCoreServices } from '@/lib/appwrite';
import { ensureKeepFlipNotificationPermission } from '@/services/keepflip-notification-service';

const PUSH_TOKEN_STORAGE_PREFIX = 'keepflip.devicePushToken.';
const PUSH_TARGET_STORAGE_PREFIX = 'keepflip.appwritePushTargetId.';
const PUSH_PROVIDER_ID = process.env.EXPO_PUBLIC_APPWRITE_PUSH_PROVIDER_ID?.trim();

function storageKey(prefix: string, userId: string) {
  return `${prefix}${userId}`;
}

function errorCode(error: unknown) {
  if (!error || typeof error !== 'object' || !('code' in error)) return null;
  const code = Number((error as { code?: unknown }).code);
  return Number.isFinite(code) ? code : null;
}

async function registerPushTarget(userId: string, token?: string) {
  const allowed = await ensureKeepFlipNotificationPermission({
    requestIfNeeded: !token,
  });
  if (!allowed) return false;

  const nativeToken = token ?? String(
    (await Notifications.getDevicePushTokenAsync()).data,
  );
  if (!nativeToken.trim()) return false;

  const tokenStorageKey = storageKey(PUSH_TOKEN_STORAGE_PREFIX, userId);
  const targetStorageKey = storageKey(PUSH_TARGET_STORAGE_PREFIX, userId);
  const [savedToken, savedTargetId] = await Promise.all([
    SecureStore.getItemAsync(tokenStorageKey),
    SecureStore.getItemAsync(targetStorageKey),
  ]);
  const targetId = savedTargetId || `push-${ID.unique()}`;

  if (savedToken === nativeToken && savedTargetId) return true;

  const { account } = getAppwriteCoreServices();
  try {
    await account.updatePushTarget({
      targetId,
      identifier: nativeToken,
    });
  } catch (error) {
    if (errorCode(error) !== 404) throw error;

    await account.createPushTarget({
      targetId,
      identifier: nativeToken,
      ...(PUSH_PROVIDER_ID ? { providerId: PUSH_PROVIDER_ID } : {}),
    });
  }

  await Promise.all([
    SecureStore.setItemAsync(tokenStorageKey, nativeToken),
    SecureStore.setItemAsync(targetStorageKey, targetId),
  ]);
  return true;
}

/**
 * Appwrite push targets belong to the current account. Keeping this inside the
 * authenticated tree prevents the guest client from attempting targets.write
 * while the launch, login, and onboarding screens are visible.
 */
export function KeepFlipPushRegistration() {
  const { status, user } = useKeepFlipAuth();
  const attemptedUserIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (status !== 'signed-in' || !user || Platform.OS === 'web') {
      attemptedUserIdRef.current = null;
      return;
    }

    if (attemptedUserIdRef.current === user.$id) return;
    attemptedUserIdRef.current = user.$id;

    const tokenSubscription = Notifications.addPushTokenListener((token) => {
      void registerPushTarget(user.$id, String(token.data)).catch((error: unknown) => {
        if (__DEV__) {
          console.warn('[KeepFlip][Push] Could not refresh the device target:', error);
        }
      });
    });

    void registerPushTarget(user.$id).catch((error: unknown) => {
      if (attemptedUserIdRef.current === user.$id) {
        attemptedUserIdRef.current = null;
      }
      if (__DEV__) {
        console.warn('[KeepFlip][Push] Could not register the device:', error);
      }
    });

    return () => tokenSubscription.remove();
  }, [status, user]);

  return null;
}
