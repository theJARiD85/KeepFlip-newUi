import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

import { ExecutionMethod, functions } from '../lib/appwrite';
import {
  clearEbayOAuthState,
  startEbayLogin,
} from '../lib/start-ebay-login';

export type EbayOAuthEnvironment = 'sandbox' | 'production';

export type EbayConnectionResult = {
  status: 'connected' | 'declined' | 'error' | 'dismissed';
  environment: EbayOAuthEnvironment;
  connection?: EbayConnectionStatusResult;
};

export type EbayConnectionStatusResult = {
  connected: boolean;
  environment: EbayOAuthEnvironment;
  ebayUsername?: string;
  accessTokenExpiresAt?: string;
  refreshTokenExpiresAt?: string;
  accessTokenExpired?: boolean;
  needsReconnect?: boolean;
};

type FunctionPayload = {
  ok?: unknown;
  state?: unknown;
  expiresAt?: unknown;
  connected?: unknown;
  environment?: unknown;
  ebayUsername?: unknown;
  accessTokenExpiresAt?: unknown;
  refreshTokenExpiresAt?: unknown;
  accessTokenExpired?: unknown;
  needsReconnect?: unknown;
  refreshed?: unknown;
  revoked?: unknown;
  remoteRevocation?: unknown;
  error?: unknown;
};

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

function ebayReturnUrl(): string {
  const generated = Linking.createURL('ebay/connected', {
    scheme: 'keepflip',
    isTripleSlashed: false,
  });

  try {
    const parsed = new URL(generated);
    if (
      parsed.protocol === 'keepflip:' &&
      parsed.hostname === 'ebay' &&
      parsed.pathname === '/connected'
    ) {
      return parsed.toString();
    }
  } catch {
    // A production build always has the keepflip scheme; use the configured
    // callback convention if a development runtime cannot construct it.
  }

  return 'keepflip://ebay/connected';
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
  path: '/connect' | '/status' | '/refresh' | '/revoke',
  environment: EbayOAuthEnvironment,
  extra: Record<string, unknown> = {},
) {
  return functions.createExecution({
    // This is the active authenticated helper. The eBay-facing callback is a
    // separate function (ebay_oauth_callback) and is never called by mobile.
    functionId: ebayOAuthFunctionId(),
    body: JSON.stringify({ ...extra, environment }),
    async: false,
    xpath: path,
    method: ExecutionMethod.POST,
    headers: {
      'content-type': 'application/json',
    },
  });
}

function isExpectedReturnUrl(parsed: URL): boolean {
  try {
    const expected = new URL(ebayReturnUrl());
    return (
      parsed.protocol === expected.protocol &&
      parsed.hostname === expected.hostname &&
      parsed.pathname === expected.pathname
    );
  } catch {
    return false;
  }
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

  if (!isExpectedReturnUrl(parsed)) {
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
 * Starts eBay's authorization-code grant through the active backend. The
 * backend creates and records the opaque state; the app persists that exact
 * state in SecureStore, builds the environment-specific eBay authorize URL,
 * and opens the browser. eBay calls ebay_oauth_callback directly after consent.
 */
export async function connectEbayAccount(
  environment: EbayOAuthEnvironment = getEbayOAuthEnvironment(),
): Promise<EbayConnectionResult> {
  let pendingState: string | undefined;

  try {
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
    const authorizationState =
      typeof payload.state === 'string' ? payload.state.trim() : '';

    if (!authorizationState) {
      throw new Error(
        'The eBay OAuth backend did not return an OAuth state.',
      );
    }

    const browserSession = await startEbayLogin({
      environment: activeEnvironment,
      authorizationState,
      // A reconnect authorizes sensitive marketplace access. Never let an
      // existing eBay browser session silently approve it on a borrowed or
      // unlocked phone.
      prompt: 'login',
    });
    pendingState = browserSession.authorizationState || browserSession.clientState;

    const browserResult = browserSession.result;
    if (browserResult.type !== 'success' || !browserResult.url) {
      await clearEbayOAuthState(pendingState).catch(() => undefined);
      return {
        status: 'dismissed',
        environment: activeEnvironment,
      };
    }

    const callbackResult = parseReturnUrl(browserResult.url, activeEnvironment);
    if (callbackResult.status !== 'connected') {
      await clearEbayOAuthState(pendingState).catch(() => undefined);
      return callbackResult;
    }

    try {
      // ebay_oauth_callback has already validated/claimed the opaque state and
      // stored the tokens. This status request verifies the result belongs to
      // the signed-in KeepFlip user before the app reports success.
      const status = await getEbayConnectionStatus(callbackResult.environment);
      await clearEbayOAuthState(pendingState).catch(() => undefined);
      return status.connected
        ? {
            status: 'connected',
            environment: status.environment,
            connection: status,
          }
        : { status: 'error', environment: callbackResult.environment };
    } catch {
      await clearEbayOAuthState(pendingState).catch(() => undefined);
      return { status: 'error', environment: callbackResult.environment };
    }
  } catch (error) {
    await clearEbayOAuthState(pendingState).catch(() => undefined);
    throw error;
  }
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

  const responseEnvironment =
    normalizeEnvironment(payload.environment) ?? environment;

  return {
    connected: payload.connected,
    environment: responseEnvironment,
    ebayUsername:
      typeof payload.ebayUsername === 'string' && payload.ebayUsername.trim()
        ? payload.ebayUsername.trim()
        : undefined,
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

/**
 * Revokes the user grant at eBay and clears the locally stored token material.
 * The app receives only the confirmed disconnected result.
 */
export type EbayConnectionRevocationResult = Pick<
  EbayConnectionStatusResult,
  'connected' | 'environment'
> & {
  remoteRevocation?: boolean;
};

export async function revokeEbayConnection(
  environment: EbayOAuthEnvironment = getEbayOAuthEnvironment(),
): Promise<EbayConnectionRevocationResult> {
  const execution = await executeOAuthFunction('/revoke', environment);

  if (execution.responseStatusCode !== 200) {
    throw functionError(
      execution.responseBody,
      'KeepFlip could not revoke eBay access.',
    );
  }

  const payload = parseFunctionPayload(execution.responseBody);
  if (payload.revoked !== true || payload.connected !== false) {
    throw new Error('The eBay OAuth Function did not confirm eBay access was revoked.');
  }

  return {
    connected: false,
    environment: normalizeEnvironment(payload.environment) ?? environment,
    ...(typeof payload.remoteRevocation === 'boolean'
      ? { remoteRevocation: payload.remoteRevocation }
      : {}),
  };
}




