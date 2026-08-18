import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
import { APPWRITE, ExecutionMethod, functions } from '@/lib/appwrite';

const EBAY_RETURN_URL = Linking.createURL('ebay/connected', {
  scheme: 'keepflip',
});

export async function connectEbayAccount() {
  const functionId = APPWRITE.ebayOauthFunctionId;
  if (!functionId) {
    throw new Error(
      'Add EXPO_PUBLIC_APPWRITE_EBAY_OAUTH_FUNCTION_ID before connecting eBay.',
    );
  }

  const execution = await functions.createExecution({
    functionId,
    body: '{}',
    async: false,
    xpath: '/connect',
    method: ExecutionMethod.POST,
    headers: {
      'content-type': 'application/json',
    },
  });

  if (execution.responseStatusCode !== 200) {
    throw new Error('Could not start eBay connection.');
  }

  const payload = JSON.parse(execution.responseBody || '{}') as {
    authorizationUrl?: unknown;
  };
  if (typeof payload.authorizationUrl !== 'string' || !payload.authorizationUrl) {
    throw new Error('KeepFlip could not start the eBay connection.');
  }

  return WebBrowser.openAuthSessionAsync(payload.authorizationUrl, EBAY_RETURN_URL);
}
