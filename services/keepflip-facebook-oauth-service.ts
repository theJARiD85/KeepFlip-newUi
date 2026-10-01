import { makeRedirectUri } from 'expo-auth-session';
import { OAuthProvider } from 'react-native-appwrite';

import { getAppwriteCoreServices } from '@/lib/appwrite';

export const KEEPFLIP_FACEBOOK_CALLBACK_ROUTE = '/facebook-oauth-callback' as const;

export function getKeepFlipFacebookCallbackUri() {
  const { configuration } = getAppwriteCoreServices();

  return makeRedirectUri({
    scheme: `appwrite-callback-${configuration.projectId}`,
    path: 'facebook-oauth-callback',
    isTripleSlashed: true,
  });
}

export async function createKeepFlipFacebookOAuthLoginUrl() {
  const { account } = getAppwriteCoreServices();
  const callbackUri = getKeepFlipFacebookCallbackUri();
  const loginUrl = await account.createOAuth2Token({
    provider: OAuthProvider.Facebook,
    success: callbackUri,
    failure: callbackUri,
  });

  if (!loginUrl) {
    throw new Error('Appwrite did not return a Facebook sign-in URL.');
  }

  return `${loginUrl}`;
}
