import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { APPWRITE, ExecutionMethod, functions } from '@/lib/appwrite';

export type EbayOAuthEnvironment = 'sandbox' | 'production';

export type EbayConnectionResult = {
  status: 'connected' | 'declined' | 'invalid' | 'error' | 'dismissed';
  environment: EbayOAuthEnvironment;
};

const EBAY_RETURN_URL = Linking.createURL('ebay/connected', {
  scheme: 'keepflip',
});

WebBrowser.maybeCompleteAuthSession();

function normalizeEnvironment(value: string | undefined): EbayOAuthEnvironment | null {
  const normalized = value?.trim().toLowerCase();
  if (normalized === 'sandbox' || normalized === 'production') {
    return normalized;
  }
  return null;
}

/**
 * A public app setting chooses which eBay environment this build starts.
 * Development builds default to Sandbox; release builds default to Production.
 */
export function getEbayOAuthEnvironment(): EbayOAuthEnvironment {
  return (
    normalizeEnvironment(process.env.EXPO_PUBLIC_EBAY_OAUTH_ENVIRONMENT) ??
    (__DEV__ ? 'sandbox' : 'production')
  );
}

function firstQueryValue(value: unknown) {
  if (Array.isArray(value)) {
    return typeof value[0] === 'string' ? value[0] : undefined;
  }
  return typeof value === 'string' ? value : undefined;
}

function parseFunctionError(responseBody: string) {
  try {
    const payload = JSON.parse(responseBody || '{}') as { error?: unknown };
    return typeof payload.error === 'string' && payload.error.trim()
      ? payload.error.trim()
      : null;
  } catch {
    return null;
  }
}

function parseOAuthResult(
  url: string,
  fallbackEnvironment: EbayOAuthEnvironment,
): EbayConnectionResult {
  const parsed = Linking.parse(url);
  const status = firstQueryValue(parsed.queryParams?.ebay);
  const returnedEnvironment = normalizeEnvironment(
    firstQueryValue(parsed.queryParams?.ebayEnvironment),
  );
  const environment = returnedEnvironment ?? fallbackEnvironment;

  if (
    status === 'connected' ||
    status === 'declined' ||
    status === 'invalid' ||
    status === 'error'
  ) {
    return { status, environment };
  }

  return { status: 'error', environment };
}

export async function connectEbayAccount(
  environment: EbayOAuthEnvironment = getEbayOAuthEnvironment(),
): Promise<EbayConnectionResult> {
  const functionId = APPWRITE.ebayOauthFunctionId;
  if (!functionId) {
    throw new Error(
      'Add EXPO_PUBLIC_APPWRITE_EBAY_OAUTH_FUNCTION_ID before connecting eBay.',
    );
  }

  const execution = await functions.createExecution({
    functionId,
    body: JSON.stringify({
      action: 'start',
      environment,
    }),
    async: false,
    xpath: '/',
    method: ExecutionMethod.POST,
    headers: {
      'content-type': 'application/json',
    },
  });

  if (execution.responseStatusCode !== 200) {
    throw new Error(
      parseFunctionError(execution.responseBody) ??
        'Could not start the eBay connection.',
    );
  }

  const payload = JSON.parse(execution.responseBody || '{}') as {
    authorizationUrl?: unknown;
    environment?: unknown;
  };

  if (typeof payload.authorizationUrl !== 'string' || !payload.authorizationUrl) {
    throw new Error('KeepFlip could not start the eBay connection.');
  }

  const responseEnvironment = normalizeEnvironment(
    typeof payload.environment === 'string' ? payload.environment : undefined,
  );
  const activeEnvironment = responseEnvironment ?? environment;

  const result = await WebBrowser.openAuthSessionAsync(
    payload.authorizationUrl,
    EBAY_RETURN_URL,
  );

  if (result.type !== 'success' || !result.url) {
    return {
      status: 'dismissed',
      environment: activeEnvironment,
    };
  }

  return parseOAuthResult(result.url, activeEnvironment);
}
