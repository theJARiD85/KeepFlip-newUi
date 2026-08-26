import * as Crypto from 'expo-crypto';
import * as SecureStore from 'expo-secure-store';
import * as Linking from 'expo-linking';
import * as WebBrowser from 'expo-web-browser';
const CLIENT_STATE_KEY = 'keepflip.ebay.oauth.state.v1';
const CLIENT_STATE_TTL_MS = 10 * 60 * 1000;
const KEEPFLIP_SCHEME = 'keepflip';
function normalizeEnvironment(value) {
  const normalized = String(value ?? '').trim().toLowerCase();
  if (normalized === 'sandbox' || normalized === 'production') {
    return normalized;
  }
  return null;
}
function configuredEnvironment() {
  return (
    normalizeEnvironment(process.env.EXPO_PUBLIC_EBAY_OAUTH_ENVIRONMENT) ??
    (__DEV__ ? 'sandbox' : 'production')
  );
}
function requiredPublicValue(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`Missing ${name} in the KeepFlip build.`);
  }
  return value;
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
    // The configured scheme below is the production fallback if a development
    // runtime cannot construct the URL for some reason.
  }
  return 'keepflip://ebay/connected';
}
function configuredLoginUrl() {
  const value =
    process.env.EXPO_PUBLIC_EBAY_OAUTH_LOGIN_URL?.trim() ||
    process.env.EXPO_PUBLIC_EBAY_AUTH_URL?.trim();
  if (!value) {
    throw new Error(
      'Missing EXPO_PUBLIC_EBAY_OAUTH_LOGIN_URL or EXPO_PUBLIC_EBAY_AUTH_URL in the KeepFlip build.',
    );
  }
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error('KeepFlip has an invalid eBay OAuth login URL.');
  }
  if (url.protocol !== 'https:') {
    throw new Error('The eBay OAuth login URL must use HTTPS.');
  }
  return url;
}
function expectedAuthorizeOrigin(environment) {
  return environment === 'production'
    ? 'https://auth.ebay.com'
    : 'https://auth.sandbox.ebay.com';
}
function configureAuthorizeUrl(url, environment, authorizationState, scopeFallback = '') {
  if (
    url.origin !== expectedAuthorizeOrigin(environment) ||
    url.pathname !== '/oauth2/authorize'
  ) {
    throw new Error(
      `The configured eBay OAuth URL does not match the ${environment} environment.`,
    );
  }
  const clientId = requiredPublicValue('EXPO_PUBLIC_EBAY_CLIENT_ID');
  const ruName = requiredPublicValue('EXPO_PUBLIC_EBAY_RUNAME');
  const configuredScope =
    url.searchParams.get('scope')?.trim() || scopeFallback.trim();
  const scopes =
    configuredScope ||
    requiredPublicValue(
      process.env.EXPO_PUBLIC_EBAY_SCOPES
        ? 'EXPO_PUBLIC_EBAY_SCOPES'
        : 'EXPO_PUBLIC_EBAY_OAUTH_SCOPES',
    );
  url.searchParams.set('client_id', clientId);
  url.searchParams.set('redirect_uri', ruName);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set('scope', scopes.split(/\s+/).filter(Boolean).join(' '));
  url.searchParams.set('state', authorizationState);
  return url;
}
/**
 * Builds the eBay authorize URL from public build configuration. Both eBay's
 * direct authorize URL and the branded signin.ebay.com wrapper are supported.
 * The wrapper's `ru` parameter contains the configured authorize URL.
 */
export function buildEbayAuthorizationUrl({
  environment = configuredEnvironment(),
  authorizationState,
} = {}) {
  const normalizedEnvironment = normalizeEnvironment(environment);
  if (!normalizedEnvironment) {
    throw new Error('eBay OAuth environment must be sandbox or production.');
  }
  if (typeof authorizationState !== 'string' || !authorizationState.trim()) {
    throw new Error('KeepFlip could not create an eBay OAuth state.');
  }
  const configured = configuredLoginUrl();
  const isBrandedSignin =
    configured.hostname.toLowerCase() === 'signin.ebay.com' &&
    configured.pathname === '/signin';
  if (!isBrandedSignin) {
    return configureAuthorizeUrl(
      configured,
      normalizedEnvironment,
      authorizationState.trim(),
    ).toString();
  }
  const innerValue = configured.searchParams.get('ru');
  if (!innerValue) {
    throw new Error('The branded eBay login URL is missing its ru parameter.');
  }
  let authorizeUrl;
  try {
    authorizeUrl = new URL(innerValue);
  } catch {
    throw new Error('The branded eBay login URL contains an invalid ru URL.');
  }
  const configuredAuthorizeUrl = configureAuthorizeUrl(
    authorizeUrl,
    normalizedEnvironment,
    authorizationState.trim(),
    configured.searchParams.get('scope')?.trim() || '',
  ).toString();
  configured.searchParams.set('ru', configuredAuthorizeUrl);
  return configured.toString();
}
function newClientState() {
  // randomUUID provides 122 bits of entropy; removing hyphens keeps the value
  // URL-safe and within the backend's clientState validation bounds.
  return Crypto.randomUUID().replace(/-/g, '');
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
  if (!/^[A-Za-z0-9_-]{32,128}$/.test(clientState)) {
    throw new Error('KeepFlip generated an invalid eBay OAuth state.');
  }
  await saveClientState(clientState, environment);
  return clientState;
}
/**
 * Creates and persists the app-side correlation state for one eBay login.
 * This state is not a token and is safe to use only as a short-lived marker.
 */
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
        if (record?.state && record.state !== expectedState.trim()) {
          return;
        }
      } catch {
        // A malformed record cannot be trusted and should be removed.
      }
    }
  }
  await SecureStore.deleteItemAsync(CLIENT_STATE_KEY);
}
/**
 * Verifies the state echoed by the KeepFlip callback and consumes it so it
 * cannot be replayed. No authorization code or eBay token is stored locally.
 */
export async function verifyAndConsumeEbayOAuthState(
  callbackState,
  environment = configuredEnvironment(),
) {
  let rawRecord;
  try {
    rawRecord = await SecureStore.getItemAsync(CLIENT_STATE_KEY);
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
    // Consume the pending attempt whether it succeeds, fails, or expires.
    await SecureStore.deleteItemAsync(CLIENT_STATE_KEY).catch(() => undefined);
  }
}
function callbackStateFromUrl(url) {
  try {
    return new URL(url).searchParams.get('state') || '';
  } catch {
    return '';
  }
}
/**
 * Opens eBay's authorize URL and verifies the final KeepFlip callback. The
 * backend-signed authorizationState is what eBay returns to the callback;
 * clientState is the app-owned marker echoed by that callback for local
 * verification.
 */
export async function startEbayLogin({
  environment = configuredEnvironment(),
  authorizationState,
  clientState,
} = {}) {
  const normalizedEnvironment = normalizeEnvironment(environment);
  if (!normalizedEnvironment) {
    throw new Error('eBay OAuth environment must be sandbox or production.');
  }
  const storedClientState = await ensureClientState(
    clientState,
    normalizedEnvironment,
  );
  const redirectUri = ebayReturnUrl();
  const authUrl = buildEbayAuthorizationUrl({
    environment: normalizedEnvironment,
    authorizationState: authorizationState || storedClientState,
  });
  try {
    const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);
    if (result.type === 'success') {
      if (!result.url) {
        throw new Error('eBay returned without a KeepFlip callback URL.');
      }
      await verifyAndConsumeEbayOAuthState(
        callbackStateFromUrl(result.url),
        normalizedEnvironment,
      );
    } else {
      await clearEbayOAuthState(storedClientState);
    }
    return {
      result,
      authUrl,
      clientState: storedClientState,
      redirectUri,
    };
  } catch (error) {
    await clearEbayOAuthState(storedClientState).catch(() => undefined);
    throw error;
  }
}
