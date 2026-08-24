import * as Crypto from 'expo-crypto';
import * as Linking from 'expo-linking';
import * as SecureStore from 'expo-secure-store';
import * as WebBrowser from 'expo-web-browser';

import {
  APPWRITE,
  ExecutionMethod,
  functions,
} from '@/lib/appwrite';

export type EbayOAuthEnvironment = 'sandbox' | 'production';

export type EbayConnectionResult = {
  status: 'connected' | 'declined' | 'invalid' | 'error' | 'dismissed';
  environment: EbayOAuthEnvironment;
};

const EBAY_RETURN_URL = Linking.createURL('ebay/connected', {
  scheme: 'keepflip',
});
const EBAY_OAUTH_STATE_BYTES = 32;
const EBAY_OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const EBAY_OAUTH_STATE_STORAGE_PREFIX = 'keepflip.ebay-oauth.pending-state';
const EBAY_OAUTH_STATE_ALPHABET =
  'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';

WebBrowser.maybeCompleteAuthSession();

export type EbayConnectionStatus = 'connected' | 'not_connected';

export type EbayConnectionStatusResult = {
  connected: boolean;
  status: EbayConnectionStatus;
};

type EbayOAuthResponse = {
  connected?: unknown;
  environment?: unknown;
  error?: unknown;
  expiresAt?: unknown;
  ok?: unknown;
  registered?: unknown;
  status?: unknown;
};

type PendingEbayOAuthState = {
  environment: EbayOAuthEnvironment;
  expiresAt: number;
  state: string;
};

function normalizeEnvironment(value: unknown): EbayOAuthEnvironment | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim().toLowerCase();
  if (normalized === 'sandbox' || normalized === 'production') return normalized;
  return null;
}

function firstQueryValue(value: unknown) {
  if (Array.isArray(value)) {
    return typeof value[0] === 'string' ? value[0] : undefined;
  }
  return typeof value === 'string' ? value : undefined;
}

function pendingStateStorageKey(environment: EbayOAuthEnvironment) {
  return `${EBAY_OAUTH_STATE_STORAGE_PREFIX}.${environment}`;
}

async function createEbayOAuthState() {
  const bytes = await Crypto.getRandomBytesAsync(EBAY_OAUTH_STATE_BYTES);

  return Array.from(
    bytes,
    (byte) => EBAY_OAUTH_STATE_ALPHABET.charAt(byte & 63),
  ).join('');
}

async function savePendingEbayOAuthState(
  pendingState: PendingEbayOAuthState,
) {
  await SecureStore.setItemAsync(
    pendingStateStorageKey(pendingState.environment),
    JSON.stringify(pendingState),
  );
}

async function readPendingEbayOAuthState(
  environment: EbayOAuthEnvironment,
): Promise<PendingEbayOAuthState | null> {
  const key = pendingStateStorageKey(environment);
  const stored = await SecureStore.getItemAsync(key);

  if (!stored) return null;

  try {
    const parsed = JSON.parse(stored) as Partial<PendingEbayOAuthState>;
    const isValid =
      typeof parsed.state === 'string' &&
      /^[A-Za-z0-9_-]{32,128}$/.test(parsed.state) &&
      parsed.environment === environment &&
      typeof parsed.expiresAt === 'number' &&
      Number.isFinite(parsed.expiresAt) &&
      parsed.expiresAt > Date.now();

    if (isValid) {
      return parsed as PendingEbayOAuthState;
    }
  } catch {
    // Clear a corrupted or expired local correlation record below.
  }

  await SecureStore.deleteItemAsync(key);
  return null;
}

async function clearPendingEbayOAuthState(environment: EbayOAuthEnvironment) {
  try {
    await SecureStore.deleteItemAsync(pendingStateStorageKey(environment));
  } catch {
    // The server-side state remains authoritative if local cleanup fails.
  }
}

function parseOAuthResult(
  url: string,
  fallbackEnvironment: EbayOAuthEnvironment,
  expectedState: string,
): EbayConnectionResult {
  const parsed = Linking.parse(url);
  const status =
    firstQueryValue(parsed.queryParams?.status) ??
    firstQueryValue(parsed.queryParams?.ebay);
  const returnedEnvironment = normalizeEnvironment(
    firstQueryValue(parsed.queryParams?.environment) ??
      firstQueryValue(parsed.queryParams?.ebayEnvironment),
  );
  if (
    returnedEnvironment &&
    returnedEnvironment !== fallbackEnvironment
  ) {
    return { status: 'invalid', environment: fallbackEnvironment };
  }

  const environment = fallbackEnvironment;
  const returnedState = firstQueryValue(parsed.queryParams?.state);

  if (returnedState !== expectedState) {
    return { status: 'invalid', environment };
  }

  if (status === 'connected') {
    return { status, environment };
  }
  if (status === 'cancelled' || status === 'declined') {
    return { status: 'declined', environment };
  }
  if (status === 'invalid') return { status, environment };

  return { status: 'error', environment };
}

function ebayOAuthFunctionId() {
  const functionId = APPWRITE.ebayOauthFunctionId;
  if (!functionId) {
    throw new Error('eBay connection is not configured for this KeepFlip build.');
  }

  return functionId;
}

function authorizationUrlFromPublicConfig(
  environment: EbayOAuthEnvironment,
  state: string,
) {
  const configuredUrl = process.env.EXPO_PUBLIC_EBAY_OAUTH_LOGIN_URL?.trim();
  const configuredClientId = process.env.EXPO_PUBLIC_EBAY_CLIENT_ID?.trim();
  const configuredRuName = process.env.EXPO_PUBLIC_EBAY_RUNAME?.trim();

  if (!configuredUrl || !configuredClientId || !configuredRuName) {
    throw new Error(
      'eBay sign-in is not configured for this KeepFlip build.',
    );
  }

  let url: URL;
  try {
    url = new URL(configuredUrl);
  } catch {
    throw new Error('The configured eBay sign-in URL is invalid.');
  }

  const expectedAuthorizeHost =
    environment === 'sandbox' ? 'auth.sandbox.ebay.com' : 'auth.ebay.com';

  if (
    url.protocol !== 'https:' ||
    url.hostname !== expectedAuthorizeHost ||
    url.pathname !== '/oauth2/authorize' ||
    url.searchParams.get('client_id') !== configuredClientId ||
    url.searchParams.get('redirect_uri') !== configuredRuName ||
    !url.searchParams.get('scope')
  ) {
    throw new Error(
      'The configured eBay sign-in URL does not match the ' +
        environment +
        ' environment.',
    );
  }

  if (url.searchParams.get('response_type') !== 'code') {
    throw new Error('The configured eBay sign-in URL is missing response_type=code.');
  }

  url.searchParams.set('state', state);

  return url.toString();
}

function eBayDebugAuthorizationUrl(value: unknown) {
  if (typeof value !== 'string' || !value.trim()) return 'missing';

  try {
    const url = new URL(value);
    if (url.searchParams.has('state')) {
      url.searchParams.set('state', 'state');
    }
    return url.toString();
  } catch {
    return 'invalid';
  }
}

function parseResponse(responseBody: string): EbayOAuthResponse {
  try {
    return JSON.parse(responseBody || '{}') as EbayOAuthResponse;
  } catch {
    return {};
  }
}

function eBayDebugResponse(responseBody: string) {
  const payload = parseResponse(responseBody);

  return {
    connected: typeof payload.connected === 'boolean' ? payload.connected : 'missing',
    environment: typeof payload.environment === 'string' ? payload.environment : 'missing',
    error: typeof payload.error === 'string' ? payload.error : 'missing',
    expiresAt: typeof payload.expiresAt === 'string' ? 'present' : 'missing',
    registered: payload.registered === true ? true : 'missing',
    status: typeof payload.status === 'string' ? payload.status : 'missing',
  };
}

function responseError(responseBody: string, fallback: string) {
  const payload = parseResponse(responseBody);
  return typeof payload.error === 'string' && payload.error.trim()
    ? payload.error.trim()
    : fallback;
}

type EbayOAuthAction = 'connect' | 'status';

export function getEbayOAuthEnvironment(): EbayOAuthEnvironment {
  const configured = process.env.EXPO_PUBLIC_EBAY_OAUTH_ENVIRONMENT?.trim().toLowerCase();
  if (configured === 'sandbox' || configured === 'production') return configured;
  return __DEV__ ? 'sandbox' : 'production';
}

function ebayOAuthPath(action: EbayOAuthAction) {
  return action === 'connect' ? '/connect' : '/status';
}

function eBayFunctionRequestParameters(
  action: EbayOAuthAction,
  environment: EbayOAuthEnvironment,
  state?: string,
) {
  return {
    action,
    async: false,
    body:
      action === 'connect'
        ? { environment, state: state ? 'state' : 'missing' }
        : { environment },
    functionId: ebayOAuthFunctionId(),
    functionHeaders: {
      'content-type': 'application/json',
    },
    sessionAuthentication: {
      appwriteSession: 'authenticated Appwrite SDK session',
    },
    expectedAppwriteHeaders: {
      'x-appwrite-user-id': 'injected for an authenticated execution',
      'x-appwrite-user-jwt': 'injected by Appwrite when available',
    },
    method: ExecutionMethod.POST,
    xpath: ebayOAuthPath(action),
  };
}

async function executeEbayOAuthFunction(
  action: EbayOAuthAction,
  environment: EbayOAuthEnvironment,
  state?: string,
) {
  if (action === 'connect' && !state) {
    throw new Error('KeepFlip could not create a secure eBay connection state.');
  }

  const requestParameters = eBayFunctionRequestParameters(action, environment, state);
  const body = action === 'connect' ? { environment, state } : { environment };

  console.log('[KeepFlip eBay OAuth] Function request', requestParameters);

  // This is deliberately a normal SDK call. Appwrite verifies the local
  // account session and injects the invoking user into the Function request.
  // Passing a second manual JWT creates the JWT-and-cookie conflict we saw.
  const execution = await functions.createExecution({
    functionId: ebayOAuthFunctionId(),
    body: JSON.stringify(body),
    async: false,
    xpath: ebayOAuthPath(action),
    method: ExecutionMethod.POST,
    headers: {
      'content-type': 'application/json',
    },
  });

  console.log('[KeepFlip eBay OAuth] Function response', {
    requestParameters,
    response: eBayDebugResponse(execution.responseBody),
    responseStatusCode: execution.responseStatusCode,
  });

  return execution;
}

const activeEbayConnects = new Map<
  EbayOAuthEnvironment,
  Promise<EbayConnectionResult>
>();

export function connectEbayAccount(
  environment: EbayOAuthEnvironment = getEbayOAuthEnvironment(),
): Promise<EbayConnectionResult> {
  const active = activeEbayConnects.get(environment);
  if (active) return active;

  const work = connectEbayAccountInternal(environment);
  activeEbayConnects.set(environment, work);

  work.then(
    () => {
      if (activeEbayConnects.get(environment) === work) {
        activeEbayConnects.delete(environment);
      }
    },
    () => {
      if (activeEbayConnects.get(environment) === work) {
        activeEbayConnects.delete(environment);
      }
    },
  );

  return work;
}

async function connectEbayAccountInternal(
  environment: EbayOAuthEnvironment = getEbayOAuthEnvironment(),
): Promise<EbayConnectionResult> {
  const state = await createEbayOAuthState();
  let keepPendingState = true;

  await savePendingEbayOAuthState({
    environment,
    expiresAt: Date.now() + EBAY_OAUTH_STATE_TTL_MS,
    state,
  });

  try {
    const execution = await executeEbayOAuthFunction('connect', environment, state);

    if (execution.responseStatusCode !== 200) {
      throw new Error(
        responseError(execution.responseBody, 'Could not start eBay connection.'),
      );
    }

    const payload = parseResponse(execution.responseBody);
    if (payload.registered !== true) {
      throw new Error('KeepFlip could not register the eBay connection state.');
    }

    const responseEnvironment = normalizeEnvironment(
      typeof payload.environment === 'string' ? payload.environment : undefined,
    );
    if (responseEnvironment !== environment) {
      throw new Error('KeepFlip received an unexpected eBay connection environment.');
    }

    const serverExpiresAt =
      typeof payload.expiresAt === 'string' ? Date.parse(payload.expiresAt) : NaN;
    if (Number.isFinite(serverExpiresAt)) {
      await savePendingEbayOAuthState({
        environment,
        expiresAt: serverExpiresAt,
        state,
      });
    }

    const authorizationUrl = authorizationUrlFromPublicConfig(environment, state);
    console.log('[KeepFlip eBay OAuth] opening app-generated authorization URL', {
      authorizationUrl: eBayDebugAuthorizationUrl(authorizationUrl),
      environment,
      state: 'state',
    });

    const result = await WebBrowser.openAuthSessionAsync(
      authorizationUrl,
      EBAY_RETURN_URL,
    );

    if (result.type !== 'success' || !result.url) {
      return {
        status: 'dismissed',
        environment,
      };
    }

    const pendingState = await readPendingEbayOAuthState(environment);
    keepPendingState = false;

    if (!pendingState || pendingState.state !== state) {
      return {
        status: 'invalid',
        environment,
      };
    }

    const oauthResult = parseOAuthResult(result.url, environment, pendingState.state);
    if (oauthResult.status !== 'connected') {
      return oauthResult;
    }

    const connectionStatus = await getEbayConnectionStatus(environment);
    return connectionStatus.connected
      ? oauthResult
      : { status: 'error', environment };
  } catch (caught) {
    keepPendingState = false;
    throw caught;
  } finally {
    if (!keepPendingState) {
      await clearPendingEbayOAuthState(environment);
    }
  }
}

export async function getEbayConnectionStatus(
  environment: EbayOAuthEnvironment = getEbayOAuthEnvironment(),
): Promise<EbayConnectionStatusResult> {
  const execution = await executeEbayOAuthFunction('status', environment);
  if (execution.responseStatusCode !== 200) {
    throw new Error(
      responseError(
        execution.responseBody,
        'KeepFlip could not read the eBay connection status.',
      ),
    );
  }

  const payload = parseResponse(execution.responseBody);
  if (typeof payload.connected !== 'boolean') {
    throw new Error('KeepFlip could not read the eBay connection status.');
  }

  return {
    connected: payload.connected,
    status: payload.connected ? 'connected' : 'not_connected',
  };
}
