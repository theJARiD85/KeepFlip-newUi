export type EbayLoginResult = {
  type: string;
  url?: string;
  [key: string]: unknown;
};

export function buildEbayAuthorizationUrl(options?: {
  environment?: 'sandbox' | 'production';
  authorizationState?: string;
  locale?: string;
  prompt?: string;
}): string;

export function extractEbayAuthorizationState(
  authorizationUrl: string,
  environment?: 'sandbox' | 'production',
): string;

export function createEbayOAuthState(
  environment?: 'sandbox' | 'production',
): Promise<string>;

export function clearEbayOAuthState(expectedState?: string): Promise<void>;

export function verifyAndConsumeEbayOAuthState(
  callbackState: string,
  environment?: 'sandbox' | 'production',
): Promise<string>;

export function startEbayLogin(options?: {
  environment?: 'sandbox' | 'production';
  authorizationUrl?: string;
  authorizationState?: string;
  clientState?: string;
  locale?: string;
  prompt?: string;
}): Promise<{
  result: EbayLoginResult;
  authUrl: string;
  authorizationState: string;
  clientState: string;
  redirectUri: string;
}>;
