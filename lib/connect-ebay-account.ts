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

export type EbayConnectionStatus = 'connected' | 'not_connected';

export type EbayConnectionStatusResult = {
  connected: boolean;
  status: EbayConnectionStatus;
};

type EbayOAuthResponse = {
  authorizationUrl?: unknown;
  connected?: unknown;
  environment?: unknown;
  error?: unknown;
  ok?: unknown;
  state?: unknown;
  status?: unknown;
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

function parseOAuthResult(
  url: string,
  fallbackEnvironment: EbayOAuthEnvironment,
): EbayConnectionResult {
  const parsed = Linking.parse(url);
  const status =
    firstQueryValue(parsed.queryParams?.status) ??
    firstQueryValue(parsed.queryParams?.ebay);
  const returnedEnvironment = normalizeEnvironment(
    firstQueryValue(parsed.queryParams?.environment) ??
      firstQueryValue(parsed.queryParams?.ebayEnvironment),
  );
  const environment = returnedEnvironment ?? fallbackEnvironment;

  if (status === 'connected') return { status, environment };
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

function authorizationUrlFromResponse(
  environment: EbayOAuthEnvironment,
  value: unknown,
  state: string,
) {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(
      "KeepFlip did not receive an eBay authorization URL from the backend.",
    );
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("The eBay authorization URL returned by the backend is invalid.");
  }

  const expectedAuthorizeHost =
    environment === "sandbox" ? "auth.sandbox.ebay.com" : "auth.ebay.com";

  if (
    url.protocol !== "https:" ||
    url.hostname !== expectedAuthorizeHost ||
    url.pathname !== "/oauth2/authorize"
  ) {
    throw new Error(
      "The eBay authorization URL returned by the backend does not match the " +
        environment +
        " environment.",
    );
  }

  if (url.searchParams.get("response_type") !== "code") {
    throw new Error("The eBay authorization URL is missing response_type=code.");
  }

  if (url.searchParams.get("state") !== state) {
    throw new Error("The eBay authorization URL does not contain the issued state.");
  }

  return url.toString();
}

function parseResponse(responseBody: string): EbayOAuthResponse {
  try {
    return JSON.parse(responseBody || '{}') as EbayOAuthResponse;
  } catch {
    return {};
  }
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

async function executeEbayOAuthFunction(
  action: EbayOAuthAction,
  environment: EbayOAuthEnvironment,
) {
  return functions.createExecution({
    functionId: ebayOAuthFunctionId(),
    body: JSON.stringify({ environment }),
    async: false,
    xpath: ebayOAuthPath(action),
    method: ExecutionMethod.POST,
    headers: {
      'content-type': 'application/json',
    },
  });
}

export async function connectEbayAccount(
  environment: EbayOAuthEnvironment = getEbayOAuthEnvironment(),
): Promise<EbayConnectionResult> {
  const execution = await executeEbayOAuthFunction('connect', environment);

  if (execution.responseStatusCode !== 200) {
    throw new Error(
      responseError(execution.responseBody, 'Could not start eBay connection.'),
    );
  }

  const payload = parseResponse(execution.responseBody);
  if (typeof payload.state !== 'string' || !payload.state) {
    throw new Error('KeepFlip did not receive a secure eBay connection state.');
  }

  const responseEnvironment = normalizeEnvironment(
    typeof payload.environment === 'string' ? payload.environment : undefined,
  );
  const activeEnvironment = responseEnvironment ?? environment;

  const result = await WebBrowser.openAuthSessionAsync(
    authorizationUrlFromResponse(
      activeEnvironment,
      payload.authorizationUrl,
      payload.state,
    ),
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
