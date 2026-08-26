import type { WebBrowserAuthSessionResult } from 'expo-web-browser';

export type EbayOAuthEnvironment = 'sandbox' | 'production';

export type StartEbayLoginOptions = {
  environment?: EbayOAuthEnvironment;
  authorizationState?: string;
  clientState?: string;
};

export type StartedEbayLogin = {
  result: WebBrowserAuthSessionResult;
  authUrl: string;
  clientState: string;
  redirectUri: string;
};

export function buildEbayAuthorizationUrl(options?: {
  environment?: EbayOAuthEnvironment;
  authorizationState?: string;
}): string;

export function createEbayOAuthState(
  environment?: EbayOAuthEnvironment,
): Promise<string>;

export function clearEbayOAuthState(expectedState?: string): Promise<void>;

export function verifyAndConsumeEbayOAuthState(
  callbackState: string,
  environment?: EbayOAuthEnvironment,
): Promise<string>;

export function startEbayLogin(
  options?: StartEbayLoginOptions,
): Promise<StartedEbayLogin>;
