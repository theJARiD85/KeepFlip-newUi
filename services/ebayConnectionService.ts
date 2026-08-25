import * as WebBrowser from 'expo-web-browser';

import { ExecutionMethod, functions } from '../lib/appwrite';

export type EbayOAuthEnvironment = 'sandbox' | 'production';

export type EbayConnectionResult = {
  status: 'connected' | 'declined' | 'error' | 'dismissed';
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

type FunctionPayload = {
  authorizationUrl?: unknown;
  connected?: unknown;
  environment?: unknown;
  accessTokenExpiresAt?: unknown;
  refreshTokenExpiresAt?: unknown;
  accessTokenExpired?: unknown;
  needsReconnect?: unknown;
  refreshed?: unknown;
  error?: unknown;
};

const EBAY_RETURN_URL = 'keepflip://ebay/connected';

WebBrowser.maybeCompleteAuthSession();

function ebayOAuthFunctionId(): string {
  const value = process.env.EXPO_PUBLIC_APPWRITE_EBAY_OAUTH_FUNCTION_ID?.trim();

  if (!value) {
    throw new Error(
      'Missing EXPO_PUBLIC_APPWRITE_EBAY_OAUTH_FUNCTION_ID in the KeepFlip build.',
    );
  }

  return value;
}

function normalizeEnvironment(value: unknown): EbayOAuthEnvironment | null {
  if (typeof value !== 'string') return null;

  const normalized = value.trim().toLowerCase();
  if (normalized === 'sandbox' || normalized === 'production') {
    return normalized;
  }

  return null;
}

export function getEbayOAuthEnvironment(): EbayOAuthEnvironment {
  return (
    normalizeEnvironment(process.env.EXPO_PUBLIC_EBAY_OAUTH_ENVIRONMENT) ??
    (__DEV__ ? 'sandbox' : 'production')
  );
}

function parseFunctionPayload(responseBody: string): FunctionPayload {
  try {
    const parsed = JSON.parse(responseBody || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
}

function functionError(responseBody: string, fallback: string): Error {
  const payload = parseFunctionPayload(responseBody);
  const message =
    typeof payload.error === 'string' && payload.error.trim()
      ? payload.error.trim()
      : fallback;

  return new Error(message);
}

async function executeOAuthFunction(
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
  value: unknown,
  environment: EbayOAuthEnvironment,
): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error('The eBay OAuth Function did not return an authorization URL.');
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error('The eBay OAuth Function returned an invalid authorization URL.');
  }

  const expectedOrigin =
    environment === 'production'
      ? 'https://auth.ebay.com'
      : 'https://auth.sandbox.ebay.com';

  if (
    url.origin !== expectedOrigin ||
    url.pathname !== '/oauth2/authorize' ||
    !url.searchParams.get('client_id') ||
    !url.searchParams.get('redirect_uri') ||
    url.searchParams.get('response_type') !== 'code' ||
    !url.searchParams.get('scope') ||
    !url.searchParams.get('state')
  ) {
    throw new Error('The eBay authorization URL failed KeepFlip validation.');
  }

  return url.toString();
}

function parseReturnUrl(
  url: string,
  fallbackEnvironment: EbayOAuthEnvironment,
): EbayConnectionResult {
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { status: 'error', environment: fallbackEnvironment };
  }

  const status = parsed.searchParams.get('status');
  const environment =
    normalizeEnvironment(parsed.searchParams.get('environment')) ??
    fallbackEnvironment;

  if (status === 'connected') {
    return { status: 'connected', environment };
  }

  if (status === 'declined') {
    return { status: 'declined', environment };
  }

  return { status: 'error', environment };
}

/**
 * Starts eBay's authorization-code grant exactly through the backend function.
 * The app never receives the eBay Client Secret, authorization code, access
 * token, or refresh token.
 */
export async function connectEbayAccount(
  environment: EbayOAuthEnvironment = getEbayOAuthEnvironment(),
): Promise<EbayConnectionResult> {
  const execution = await executeOAuthFunction('/connect', environment);

  if (execution.responseStatusCode !== 200) {
    throw functionError(
      execution.responseBody,
      'KeepFlip could not start the eBay authorization flow.',
    );
  }

  const payload = parseFunctionPayload(execution.responseBody);
  const responseEnvironment = normalizeEnvironment(payload.environment);
  const activeEnvironment = responseEnvironment ?? environment;
  const authorizationUrl = assertAuthorizationUrl(
    payload.authorizationUrl,
    activeEnvironment,
  );

  const browserResult = await WebBrowser.openAuthSessionAsync(
    authorizationUrl,
    EBAY_RETURN_URL,
  );

  if (browserResult.type !== 'success' || !browserResult.url) {
    return {
      status: 'dismissed',
      environment: activeEnvironment,
    };
  }

  return parseReturnUrl(browserResult.url, activeEnvironment);
}

/**
 * Reads server-side connection state. No eBay token is returned to the app.
 */
export async function getEbayConnectionStatus(
  environment: EbayOAuthEnvironment = getEbayOAuthEnvironment(),
): Promise<EbayConnectionStatusResult> {
  const execution = await executeOAuthFunction('/status', environment);

  if (execution.responseStatusCode !== 200) {
    throw functionError(
      execution.responseBody,
      'KeepFlip could not read the eBay connection status.',
    );
  }

  const payload = parseFunctionPayload(execution.responseBody);
  if (typeof payload.connected !== 'boolean') {
    throw new Error('The eBay OAuth Function returned an invalid connection status.');
  }

  const responseEnvironment = normalizeEnvironment(payload.environment) ?? environment;

  return {
    connected: payload.connected,
    environment: responseEnvironment,
    accessTokenExpiresAt:
      typeof payload.accessTokenExpiresAt === 'string'
        ? payload.accessTokenExpiresAt
        : undefined,
    refreshTokenExpiresAt:
      typeof payload.refreshTokenExpiresAt === 'string'
        ? payload.refreshTokenExpiresAt
        : undefined,
    accessTokenExpired:
      typeof payload.accessTokenExpired === 'boolean'
        ? payload.accessTokenExpired
        : undefined,
    needsReconnect:
      typeof payload.needsReconnect === 'boolean'
        ? payload.needsReconnect
        : undefined,
  };
}

/**
 * Explicitly asks the backend to use the stored eBay refresh token to mint a
 * fresh access token. The new token remains server-side.
 */
export async function refreshEbayConnection(
  environment: EbayOAuthEnvironment = getEbayOAuthEnvironment(),
): Promise<EbayConnectionStatusResult> {
  const execution = await executeOAuthFunction('/refresh', environment);

  if (execution.responseStatusCode !== 200) {
    throw functionError(
      execution.responseBody,
      'KeepFlip could not refresh the eBay authorization.',
    );
  }

  const payload = parseFunctionPayload(execution.responseBody);
  if (payload.refreshed !== true || payload.connected !== true) {
    throw new Error('The eBay OAuth Function did not confirm the token refresh.');
  }

  return {
    connected: true,
    environment: normalizeEnvironment(payload.environment) ?? environment,
    accessTokenExpiresAt:
      typeof payload.accessTokenExpiresAt === 'string'
        ? payload.accessTokenExpiresAt
        : undefined,
    accessTokenExpired: false,
    needsReconnect: false,
  };
}
