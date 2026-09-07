import { useEffect, useRef } from 'react';

import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { ID } from 'react-native-appwrite';

import { useKeepFlipAuth } from '@/components/auth/keepflip-auth-context';
import { getAppwriteCoreServices } from '@/lib/appwrite';

const PUSH_TOKEN_STORAGE_KEY = 'devicePushToken';

async function registerPushTarget() {
  const { status: existingStatus } =
    await Notifications.getPermissionsAsync();

  let permissionStatus = existingStatus;
  if (permissionStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    permissionStatus = status;
  }

  if (permissionStatus !== 'granted') return;

  const nativeToken = String(
    (await Notifications.getDevicePushTokenAsync()).data,
  );
  const savedToken = await SecureStore.getItemAsync(PUSH_TOKEN_STORAGE_KEY);

  if (savedToken === nativeToken) return;

  const { account } = getAppwriteCoreServices();
  await account.createPushTarget({
    targetId: ID.unique(),
    identifier: nativeToken,
    providerId: 'FCM',
  });

  await SecureStore.setItemAsync(PUSH_TOKEN_STORAGE_KEY, nativeToken);
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
    if (status !== 'signed-in' || !user || !Device.isDevice) {
      attemptedUserIdRef.current = null;
      return;
    }

    if (attemptedUserIdRef.current === user.$id) return;
    attemptedUserIdRef.current = user.$id;

    void registerPushTarget().catch((error: unknown) => {
      if (__DEV__) {
        console.warn('[KeepFlip][Push] Could not register the device:', error);
      }
    });
  }, [status, user]);

  return null;
}
