import * as WebBrowser from 'expo-web-browser';

import { APPWRITE, ExecutionMethod, functions } from '@/lib/appwrite';

export type EbayOAuthEnvironment = 'sandbox' | 'production';
export type EbayConnectionResultStatus =
  | 'connected'
  | 'declined'
  | 'invalid'
  | 'error'
  | 'dismissed';

export type EbayConnectionResult = {
  status: EbayConnectionResultStatus;
  environment: EbayOAuthEnvironment;
};

export type EbayConnectionStatusResult = {
  connected: boolean;
  environment: EbayOAuthEnvironment;
  accessTokenExpiresAt?: string;
  refreshTokenExpiresAt?: string;
  accessTokenExpired?: boolean;
  needsReconnect?: boolean;
};

export type EbayRefreshResult = {
  refreshed: boolean;
  connected: boolean;
  environment: EbayOAuthEnvironment;
  accessTokenExpiresAt?: string;
};

type EbayFunctionResponse = {
  authorizationUrl?: unknown;
  environment?: unknown;
  connected?: unknown;
  accessTokenExpiresAt?: unknown;
  refreshTokenExpiresAt?: unknown;
  accessTokenExpired?: unknown;
  needsReconnect?: unknown;
  refreshed?: unknown;
  error?: unknown;
};

const EBAY_RETURN_URL = 'keepflip://ebay/connected';

WebBrowser.maybeCompleteAuthSession();

function normalizeEnvironment(value: unknown): EbayOAuthEnvironment | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  return normalized === 'sandbox' || normalized === 'production'
    ? normalized
    : null;
}

export function getEbayOAuthEnvironment(): EbayOAuthEnvironment {
  return (
    normalizeEnvironment(process.env.EXPO_PUBLIC_EBAY_OAUTH_ENVIRONMENT) ??
    (__DEV__ ? 'sandbox' : 'production')
  );
}

function ebayOAuthFunctionId() {
  const functionId = APPWRITE.ebayOauthFunctionId.trim();
  if (!functionId) {
    throw new Error(
      'eBay connection is not configured. Set EXPO_PUBLIC_APPWRITE_EBAY_OAUTH_FUNCTION_ID.',
    );
  }
  return functionId;
}

function parseFunctionResponse(responseBody: string): EbayFunctionResponse {
  try {
    return JSON.parse(responseBody || '{}') as EbayFunctionResponse;
  } catch {
    return {};
  }
}

function responseError(responseBody: string, fallback: string) {
  const payload = parseFunctionResponse(responseBody);
  return typeof payload.error === 'string' && payload.error.trim()
    ? payload.error.trim()
    : fallback;
}

async function executeEbayOAuthFunction(
  path: '/connect' | '/status' | '/refresh',
  environment: EbayOAuthEnvironment,
) {
  return functions.createExecution({
    functionId: ebayOAuthFunctionId(),
    body: JSON.stringify({ environment }),
    async: false,
    xpath: path,
    method: ExecutionMethod.POST,
    headers: {
      'content-type': 'application/json',
    },
  });
}

function assertAuthorizationUrl(
  authorizationUrl: string,
  environment: EbayOAuthEnvironment,
) {
  let url: URL;
  try {
    url = new URL(authorizationUrl);
  } catch {
    throw new Error('KeepFlip received an invalid eBay authorization URL.');
  }

  const expectedHost =
    environment === 'production' ? 'auth.ebay.com' : 'auth.sandbox.ebay.com';

  if (
    url.protocol !== 'https:' ||
    url.hostname !== expectedHost ||
    url.pathname !== '/oauth2/authorize'
  ) {
    throw new Error('KeepFlip received an unexpected eBay authorization endpoint.');
  }

  const requiredParameters = [
    'client_id',
    'redirect_uri',
    'response_type',
    'scope',
    'state',
  ] as const;

  for (const parameter of requiredParameters) {
    if (!url.searchParams.get(parameter)) {
      throw new Error(
        `KeepFlip's eBay authorization request is missing ${parameter}.`,
      );
    }
  }

  if (url.searchParams.get('response_type') !== 'code') {
    throw new Error("KeepFlip's eBay authorization request must use response_type=code.");
  }
}

function parseOAuthReturn(
  returnUrl: string,
  fallbackEnvironment: EbayOAuthEnvironment,
): EbayConnectionResult {
  let url: URL;
  try {
    url = new URL(returnUrl);
  } catch {
    return { status: 'invalid', environment: fallbackEnvironment };
  }

  if (
    url.protocol !== 'keepflip:' ||
    url.hostname !== 'ebay' ||
    url.pathname !== '/connected'
  ) {
    return { status: 'invalid', environment: fallbackEnvironment };
  }

  const environment =
    normalizeEnvironment(url.searchParams.get('environment')) ??
    fallbackEnvironment;
  const status = url.searchParams.get('status');

  if (
    status === 'connected' ||
    status === 'declined' ||
    status === 'invalid' ||
    status === 'error'
  ) {
    return { status, environment };
  }

  return { status: 'invalid', environment };
}

export async function connectEbayAccount(
  environment: EbayOAuthEnvironment = getEbayOAuthEnvironment(),
): Promise<EbayConnectionResult> {
  const execution = await executeEbayOAuthFunction('/connect', environment);

  if (execution.responseStatusCode !== 200) {
    throw new Error(
      responseError(execution.responseBody, 'Could not start the eBay connection.'),
    );
  }

  const payload = parseFunctionResponse(execution.responseBody);
  const responseEnvironment = normalizeEnvironment(payload.environment) ?? environment;

  if (typeof payload.authorizationUrl !== 'string' || !payload.authorizationUrl) {
    throw new Error('KeepFlip did not receive an eBay authorization URL.');
  }

  assertAuthorizationUrl(payload.authorizationUrl, responseEnvironment);

  const result = await WebBrowser.openAuthSessionAsync(
    payload.authorizationUrl,
    EBAY_RETURN_URL,
  );

  if (result.type !== 'success' || !result.url) {
    return {
      status: 'dismissed',
      environment: responseEnvironment,
    };
  }

  return parseOAuthReturn(result.url, responseEnvironment);
}

export async function getEbayConnectionStatus(
  environment: EbayOAuthEnvironment = getEbayOAuthEnvironment(),
): Promise<EbayConnectionStatusResult> {
  const execution = await executeEbayOAuthFunction('/status', environment);

  if (execution.responseStatusCode !== 200) {
    throw new Error(
      responseError(
        execution.responseBody,
        'KeepFlip could not read the eBay connection status.',
      ),
    );
  }

  const payload = parseFunctionResponse(execution.responseBody);
  if (typeof payload.connected !== 'boolean') {
    throw new Error('KeepFlip received an invalid eBay connection status.');
  }

  return {
    connected: payload.connected,
    environment: normalizeEnvironment(payload.environment) ?? environment,
    ...(typeof payload.accessTokenExpiresAt === 'string'
      ? { accessTokenExpiresAt: payload.accessTokenExpiresAt }
      : {}),
    ...(typeof payload.refreshTokenExpiresAt === 'string'
      ? { refreshTokenExpiresAt: payload.refreshTokenExpiresAt }
      : {}),
    ...(typeof payload.accessTokenExpired === 'boolean'
      ? { accessTokenExpired: payload.accessTokenExpired }
      : {}),
    ...(typeof payload.needsReconnect === 'boolean'
      ? { needsReconnect: payload.needsReconnect }
      : {}),
  };
}

export async function refreshEbayConnection(
  environment: EbayOAuthEnvironment = getEbayOAuthEnvironment(),
): Promise<EbayRefreshResult> {
  const execution = await executeEbayOAuthFunction('/refresh', environment);

  if (execution.responseStatusCode !== 200) {
    throw new Error(
      responseError(
        execution.responseBody,
        'KeepFlip could not refresh the eBay connection.',
      ),
    );
  }

  const payload = parseFunctionResponse(execution.responseBody);
  if (payload.refreshed !== true || payload.connected !== true) {
    throw new Error('KeepFlip received an invalid eBay refresh response.');
  }

  return {
    refreshed: true,
    connected: true,
    environment: normalizeEnvironment(payload.environment) ?? environment,
    ...(typeof payload.accessTokenExpiresAt === 'string'
      ? { accessTokenExpiresAt: payload.accessTokenExpiresAt }
      : {}),
  };
}
