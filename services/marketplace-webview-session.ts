import * as SecureStore from 'expo-secure-store';
import NitroCookies from 'react-native-nitro-cookies';

import {
  CROSSLISTING_DESTINATIONS,
  type CrosslistingMarketplace,
} from '@/services/crosslisting-service';

// The marker contains no marketplace credential. The WebView's native cookie
// store retains the actual session between visits to the same marketplace.
function sessionKey(userId: string, marketplace: CrosslistingMarketplace) {
  return `keepflip_marketplace_webview_${userId}_${marketplace}`;
}

function activeOwnerKey(marketplace: CrosslistingMarketplace) {
  return `keepflip_marketplace_webview_owner_${marketplace}`;
}

async function clearMarketplaceCookies(marketplace: CrosslistingMarketplace) {
  const origin = CROSSLISTING_DESTINATIONS[marketplace].origin;
  const cookies = await NitroCookies.get(origin);
  for (const name of Object.keys(cookies)) {
    await NitroCookies.clearByName(origin, name);
  }
  await NitroCookies.flush();
}

export async function hasMarketplaceWebViewSession(
  userId: string,
  marketplace: CrosslistingMarketplace,
) {
  const [remembered, activeOwner] = await Promise.all([
    SecureStore.getItemAsync(sessionKey(userId, marketplace)),
    SecureStore.getItemAsync(activeOwnerKey(marketplace)),
  ]);
  if (remembered === 'ready' && activeOwner === userId) return true;

  // The native cookie jar is shared by WebViews in this app. Clear an older
  // marketplace login before a different KeepFlip user signs in here.
  await clearMarketplaceCookies(marketplace);
  await SecureStore.setItemAsync(activeOwnerKey(marketplace), userId);
  return false;
}

export async function rememberMarketplaceWebViewSession(
  userId: string,
  marketplace: CrosslistingMarketplace,
) {
  await SecureStore.setItemAsync(sessionKey(userId, marketplace), 'ready');
  await SecureStore.setItemAsync(activeOwnerKey(marketplace), userId);
  await NitroCookies.flush();
}

export async function forgetMarketplaceWebViewSession(
  userId: string,
  marketplace: CrosslistingMarketplace,
) {
  await clearMarketplaceCookies(marketplace);
  await SecureStore.deleteItemAsync(sessionKey(userId, marketplace));
  await SecureStore.deleteItemAsync(activeOwnerKey(marketplace));
}
