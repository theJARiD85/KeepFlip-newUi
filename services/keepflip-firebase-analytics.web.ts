import {
  getApp,
  getApps,
  initializeApp,
  type FirebaseApp,
  type FirebaseOptions,
} from 'firebase/app';
import {
  getAnalytics,
  isSupported,
  logEvent,
  type Analytics,
} from 'firebase/analytics';

const firebaseConfig: FirebaseOptions = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_WEB_API_KEY,
  appId: process.env.EXPO_PUBLIC_FIREBASE_WEB_APP_ID,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_WEB_AUTH_DOMAIN,
  measurementId: process.env.EXPO_PUBLIC_FIREBASE_WEB_MEASUREMENT_ID,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_WEB_MESSAGING_SENDER_ID,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_WEB_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_WEB_STORAGE_BUCKET,
};

let analyticsPromise: Promise<Analytics | null> | null = null;

function configuredFirebaseApp(): FirebaseApp | null {
  const requiredValues = [
    firebaseConfig.apiKey,
    firebaseConfig.appId,
    firebaseConfig.authDomain,
    firebaseConfig.measurementId,
    firebaseConfig.messagingSenderId,
    firebaseConfig.projectId,
    firebaseConfig.storageBucket,
  ];

  if (requiredValues.some((value) => !value?.trim())) {
    return null;
  }

  return getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
}

/**
 * Firebase Analytics is intentionally initialized only in the browser. The
 * native resolver is a no-op so this JavaScript SDK is never pulled into an
 * Android or iOS bundle.
 */
export function initializeKeepFlipFirebaseAnalytics() {
  if (!analyticsPromise) {
    analyticsPromise = (async () => {
      if (typeof window === 'undefined') return null;

      const app = configuredFirebaseApp();
      if (!app || !(await isSupported())) return null;

      return getAnalytics(app);
    })().catch(() => null);
  }

  return analyticsPromise;
}

function analyticsScreenName(pathname: string) {
  const normalizedPathname = pathname.split('?')[0].trim() || '/';
  const safeSegments = normalizedPathname
    .split('/')
    .filter(Boolean)
    .map((segment) => {
      const looksLikeRecordId =
        /^\d+$/.test(segment) ||
        /^[0-9a-f]{8,}$/i.test(segment) ||
        segment.length > 24;

      return looksLikeRecordId ? ':id' : segment.slice(0, 64);
    });

  return safeSegments.length ? `/${safeSegments.join('/')}` : '/';
}

/**
 * Expo Router is a single-page app on web. Record route transitions as
 * screen views without attaching a KeepFlip/Appwrite user identifier.
 */
export async function trackKeepFlipFirebaseWebScreen(pathname: string) {
  const analytics = await initializeKeepFlipFirebaseAnalytics();
  if (!analytics) return;

  try {
    logEvent(analytics, 'screen_view', {
      firebase_screen: analyticsScreenName(pathname),
      firebase_screen_class: 'expo-router',
    });
  } catch {
    // Analytics must never interfere with routing or rendering.
  }
}
