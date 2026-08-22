import * as WebBrowser from 'expo-web-browser';
import { makeRedirectUri } from 'expo-auth-session';

const EBAY_SANDBOX_AUTH_URL = 'https://ebay.com'; // Use .sandbox.ebay.com for testing
const CLIENT_ID = 'YOUR_EBAY_CLIENT_ID';
const RUNAME = 'YOUR_EBAY_RUNAME_VAL'; // Exact RuName configured in eBay dev portal


export async function startEbayLogin() {
  const redirectUri = makeRedirectUri({ scheme: 'yourcsprefix' });
  const authUrl = `${EBAY_AUTH_URL}?client_id=${CLIENT_ID}&redirect_uri=${RUNAME}&response_type=code&scope=YOUR_SCOPES&state=${encodeURIComponent(redirectUri)}`;

  const result = await WebBrowser.openAuthSessionAsync(authUrl, redirectUri);
  if (result.type === 'success') {
    // Extract code or pass parameters from result.url
  }
}
