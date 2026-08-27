import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';

const CLIENT_STATE_KEY = 'keepflip.ebay.oauth.state.v1';
const CLIENT_STATE_TTL_MS = 10 * 60 * 1000;
const KEEPFLIP_SCHEME = 'keepflip';
const EBAY_STATE_PATTERN = /^[A-Za-z0-9_-]{32,256}$/;

function normalizeEnvironment(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  return normalized === 'sandbox' || normalized === 'production'
    ? normalized
    : null;
}

function configuredEnvironment() {
  const configured = normalizeEnvironment(
    process.env.EXPO_PUBLIC_EBAY_OAUTH_ENVIRONMENT,
  );
  if (configured) return configured;
  return typeof __DEV__ !== 'undefined' && __DEV__ ? 'sandbox' : 'production';
}

function requiredPublicValue(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing ${name} in the KeepFlip build.`);
  return value;
}

function optionalPublicValue(...names) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) return value;
  }
  return '';
}

function ebayReturnUrl() {
  const generated = Linking.createURL('ebay/connected', {
    scheme: KEEPFLIP_SCHEME,
    isTripleSlashed: false,
  });

  try {
    const parsed = new URL(generated);
    if (
      parsed.protocol === `${KEEPFLIP_SCHEME}:` &&
      parsed.hostname === 'ebay' &&
      parsed.pathname === '/connected'
    ) {
      return parsed.toString();
    }
  } catch {
    // Keep a deterministic fallback for runtimes that cannot construct a
    // Linking URL. The eBay redirect_uri remains the configured RuName.
  }

  return 'keepflip://ebay/connected';
}

function expectedAuthorizeOrigin(environment) {
  return environment === 'production'
    ? 'https://auth.ebay.com'
    : 'https://auth.sandbox.ebay.com';
}

function validateAuthorizeUrl(url, environment) {
  if (
    url.protocol !== 'https:' ||
    url.origin !== expectedAuthorizeOrigin(environment) ||
    url.pathname !== '/oauth2/authorize'
  ) {
    throw new Error(
      `The eBay OAuth URL does not match the ${environment} environment.`,
    );
  }
  return url;
}

function authorizeEndpoint(environment) {
  const configured = optionalPublicValue('EXPO_PUBLIC_EBAY_AUTH_URL');
  const fallback = `${expectedAuthorizeOrigin(environment)}/oauth2/authorize`;
  let endpoint;

  try {
    endpoint = new URL(configured || fallback);
  } catch {
    throw new Error('EXPO_PUBLIC_EBAY_AUTH_URL is not a valid URL.');
  }

  return validateAuthorizeUrl(endpoint, environment);
}

function configureAuthorizeUrl(
  url,
  environment,
  authorizationState,
  { locale, prompt } = {},
) {
  validateAuthorizeUrl(url, environment);

  const scopes = optionalPublicValue(
    'EXPO_PUBLIC_EBAY_SCOPES',
    'EXPO_PUBLIC_EBAY_OAUTH_SCOPES',
  )
    .split(/\s+/)
    .filter(Boolean)
    .join(' ');
  if (!scopes) {
    throw new Error('Missing EXPO_PUBLIC_EBAY_SCOPES in the KeepFlip build.');
  }

  url.searchParams.set(
    'client_id',
    requiredPublicValue('EXPO_PUBLIC_EBAY_CLIENT_ID'),
  );
  url.searchParams.set(
    'redirect_uri',
    requiredPublicValue('EXPO_PUBLIC_EBAY_RUNAME'),
  );
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', scopes);
  url.searchParams.set('state', authorizationState);

  const configuredLocale =
    typeof locale === 'string' && locale.trim()
      ? locale.trim()
      : optionalPublicValue(
          'EXPO_PUBLIC_EBAY_OAUTH_LOCALE',
          'EXPO_PUBLIC_EBAY_LOCALE',
        );
  if (configuredLocale) url.searchParams.set('locale', configuredLocale);

  const configuredPrompt =
    typeof prompt === 'string' && prompt.trim()
      ? prompt.trim()
      : optionalPublicValue('EXPO_PUBLIC_EBAY_OAUTH_PROMPT');
  if (configuredPrompt) url.searchParams.set('prompt', configuredPrompt);

  return url;
}

function newClientState() {
  return Crypto.randomUUID().replace(/-/g, '');
}

/**
 * Builds the URL the app opens in the browser. The backend is only used to
 * register the one-time state against the signed-in KeepFlip user.
 */
export function buildEbayAuthorizationUrl({
  environment = configuredEnvironment(),
  authorizationState,
  locale,
  prompt,
} = {}) {
  const normalizedEnvironment = normalizeEnvironment(environment);
  if (!normalizedEnvironment) {
    throw new Error('eBay OAuth environment must be sandbox or production.');
  }

  const state =
    typeof authorizationState === 'string' && authorizationState.trim()
      ? authorizationState.trim()
      : newClientState();
  if (!EBAY_STATE_PATTERN.test(state)) {
    throw new Error('KeepFlip could not create a valid eBay OAuth state.');
  }

  return configureAuthorizeUrl(
    authorizeEndpoint(normalizedEnvironment),
    normalizedEnvironment,
    state,
    { locale, prompt },
  ).toString();
}

async function saveClientState(state, environment) {
  await SecureStore.setItemAsync(
    CLIENT_STATE_KEY,
    JSON.stringify({
      version: 1,
      state,
      environment,
      createdAt: Date.now(),
    }),
  );
}

async function ensureClientState(state, environment) {
  const normalized = typeof state === 'string' ? state.trim() : '';
  const clientState = normalized || newClientState();
  if (!EBAY_STATE_PATTERN.test(clientState)) {
    throw new Error('KeepFlip received an invalid eBay OAuth state.');
  }

  await saveClientState(clientState, environment);
  return clientState;
}

export async function createEbayOAuthState(
  environment = configuredEnvironment(),
) {
  const normalizedEnvironment = normalizeEnvironment(environment);
  if (!normalizedEnvironment) {
    throw new Error('eBay OAuth environment must be sandbox or production.');
  }
  return ensureClientState(newClientState(), normalizedEnvironment);
}

export async function clearEbayOAuthState(expectedState) {
  if (typeof expectedState === 'string' && expectedState.trim()) {
    const current = await SecureStore.getItemAsync(CLIENT_STATE_KEY);
    if (current) {
      try {
        const record = JSON.parse(current);
        if (record?.state && record.state !== expectedState.trim()) return;
      } catch {
        // A malformed record cannot be trusted and should be removed.
      }
    }
  }

  await SecureStore.deleteItemAsync(CLIENT_STATE_KEY);
}

export async function verifyAndConsumeEbayOAuthState(
  callbackState,
  environment = configuredEnvironment(),
) {
  try {
    const rawRecord = await SecureStore.getItemAsync(CLIENT_STATE_KEY);
    if (!rawRecord) {
      throw new Error('KeepFlip could not find the pending eBay OAuth state.');
    }

    const record = JSON.parse(rawRecord);
    const normalizedEnvironment = normalizeEnvironment(environment);
    const receivedState =
      typeof callbackState === 'string' ? callbackState.trim() : '';

    if (
      record?.version !== 1 ||
      typeof record.state !== 'string' ||
      !record.state ||
      !normalizedEnvironment ||
      record.environment !== normalizedEnvironment ||
      record.state !== receivedState ||
      !Number.isFinite(record.createdAt) ||
      Date.now() - record.createdAt > CLIENT_STATE_TTL_MS
    ) {
      throw new Error('The eBay OAuth callback state did not match this login.');
    }

    return record.state;
  } catch (error) {
    if (error instanceof SyntaxError) {
      throw new Error('The saved eBay OAuth state is invalid.');
    }
    throw error;
  } finally {
    await SecureStore.deleteItemAsync(CLIENT_STATE_KEY).catch(() => undefined);
  }
}

function authorizeUrlForLogin(rawUrl, environment) {
  let outer;
  try {
    outer = new URL(rawUrl);
  } catch {
    throw new Error('KeepFlip received an invalid eBay authorization URL.');
  }

  if (outer.protocol !== 'https:') {
    throw new Error('The eBay authorization URL must use HTTPS.');
  }

  // This branch is only for parsing older backend responses. The normal path
  // below always builds the direct authorize URL in the app.
  if (
    outer.hostname.toLowerCase() === 'signin.ebay.com' &&
    outer.pathname === '/signin'
  ) {
    const innerValue = outer.searchParams.get('ru');
    if (!innerValue) {
      throw new Error('The eBay branded login URL is missing its ru parameter.');
    }
    try {
      return validateAuthorizeUrl(new URL(innerValue), environment);
    } catch {
      throw new Error('The eBay branded login URL contains an invalid ru URL.');
    }
  }

  return validateAuthorizeUrl(outer, environment);
}

export function extractEbayAuthorizationState(
  rawUrl,
  environment = configuredEnvironment(),
) {
  const normalizedEnvironment = normalizeEnvironment(environment);
  if (!normalizedEnvironment) {
    throw new Error('eBay OAuth environment must be sandbox or production.');
  }

  const authorizeUrl = authorizeUrlForLogin(rawUrl, normalizedEnvironment);
  const state = authorizeUrl.searchParams.get('state')?.trim() || '';
  if (!EBAY_STATE_PATTERN.test(state)) {
    throw new Error('The eBay authorization URL did not contain a valid state.');
  }
  return state;
}

function callbackStateFromUrl(url) {
  try {
    return new URL(url).searchParams.get('state') || '';
  } catch {
    return '';
  }
}

export async function startEbayLogin({
  environment = configuredEnvironment(),
  authorizationUrl,
  authorizationState,
  clientState,
  locale,
  prompt,
} = {}) {
  const normalizedEnvironment = normalizeEnvironment(environment);
  if (!normalizedEnvironment) {
    throw new Error('eBay OAuth environment must be sandbox or production.');
  }

  const suppliedAuthorizationUrl =
    typeof authorizationUrl === 'string' ? authorizationUrl.trim() : '';
  const returnedState = suppliedAuthorizationUrl
    ? extractEbayAuthorizationState(
        suppliedAuthorizationUrl,
        normalizedEnvironment,
      )
    : '';
  const selectedState =
    returnedState ||
    (typeof authorizationState === 'string' ? authorizationState.trim() : '');
  const storedClientState = await ensureClientState(
    clientState || selectedState,
    normalizedEnvironment,
  );
  const redirectUri = ebayReturnUrl();

  // Even when an older backend returns a complete URL, use only its validated
  // state. The browser always receives the URL constructed here.
  const authUrl = buildEbayAuthorizationUrl({
    environment: normalizedEnvironment,
    authorizationState: selectedState || storedClientState,
    locale,
    prompt,
  });

  try {
    const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);
    if (result.type === 'success') {
      if (!result.url) {
        throw new Error('eBay returned without a KeepFlip callback URL.');
      }

      // The current callback redirects with status/environment only. If a
      // future callback echoes state, enforce the additional local check.
      const callbackState = callbackStateFromUrl(result.url);
      if (callbackState) {
        await verifyAndConsumeEbayOAuthState(
          callbackState,
          normalizedEnvironment,
        );
      }
    } else {
      await clearEbayOAuthState(storedClientState);
    }

    return {
      result,
      authUrl,
      authorizationState: returnedState || selectedState || storedClientState,
      clientState: storedClientState,
      redirectUri,
    };
  } catch (error) {
    await clearEbayOAuthState(storedClientState).catch(() => undefined);
    throw error;
  }
}

WebBrowser.maybeCompleteAuthSession();
