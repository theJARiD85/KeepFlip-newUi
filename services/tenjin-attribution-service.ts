import { Platform } from 'react-native';
import { requestTrackingPermissionsAsync } from 'expo-tracking-transparency';
import Tenjin from 'react-native-tenjin';

const TENJIN_API_KEY = process.env.EXPO_PUBLIC_TENJIN_API_KEY?.trim() ?? '';

export type KeepFlipTenjinEventName =
  | 'registration_completed'
  | 'inventory_item_saved';

let initializationPromise: Promise<void> | null = null;
let isConnected = false;
const pendingEvents: KeepFlipTenjinEventName[] = [];

function sendEvent(name: KeepFlipTenjinEventName) {
  try {
    Tenjin.eventWithName(name);
  } catch (error) {
    if (__DEV__) {
      console.warn(`[Tenjin] Could not send ${name}.`, error);
    }
  }
}

export function trackTenjinEvent(name: KeepFlipTenjinEventName) {
  if (Platform.OS === 'web' || !TENJIN_API_KEY) return;

  if (!isConnected) {
    pendingEvents.push(name);
    return;
  }

  sendEvent(name);
}

export function initializeTenjinAtLaunch() {
  if (Platform.OS === 'web' || !TENJIN_API_KEY) {
    return Promise.resolve();
  }

  if (!initializationPromise) {
    initializationPromise = (async () => {
      if (Platform.OS === 'ios') {
        try {
          await requestTrackingPermissionsAsync();
        } catch (error) {
          if (__DEV__) {
            console.warn('[Tenjin] ATT authorization request failed.', error);
          }
        }
      }

      Tenjin.initialize(TENJIN_API_KEY);

      if (Platform.OS === 'android') {
        Tenjin.setAppStore('googleplay');
      }

      Tenjin.connect();
      isConnected = true;

      for (const eventName of pendingEvents.splice(0)) {
        sendEvent(eventName);
      }
    })().catch((error) => {
      initializationPromise = null;
      if (__DEV__) {
        console.warn('[Tenjin] SDK initialization failed.', error);
      }
    });
  }

  return initializationPromise;
}
