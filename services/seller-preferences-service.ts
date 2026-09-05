import { ExecutionMethod, functions } from '@/lib/appwrite';
import { validateSellerPreferences, type SellerPreferences } from '@/lib/seller-assistance';

async function execute(xpath: string, body: Record<string, unknown>) {
  const functionId = process.env.EXPO_PUBLIC_APPWRITE_SELLER_OPERATIONS_FUNCTION_ID?.trim();
  if (!functionId) throw new Error('Seller preferences are not configured in this build. Your changes have not been saved.');
  const execution = await functions.createExecution({ functionId, xpath, body: JSON.stringify(body), async: false, method: ExecutionMethod.POST, headers: { 'content-type': 'application/json' } });
  let payload: Record<string, unknown>;
  try { payload = JSON.parse(execution.responseBody); } catch { throw new Error('Seller service returned an unreadable response. Refresh before retrying.'); }
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) throw new Error('Seller service returned an invalid response.');
  if (execution.responseStatusCode === 409) throw new Error('Preferences changed on another device. Reload preferences, then apply your change again.');
  if (execution.status !== 'completed' || execution.responseStatusCode < 200 || execution.responseStatusCode >= 300 || payload.error) throw new Error(typeof payload.error === 'string' ? payload.error : 'Seller service could not complete this request.');
  return payload;
}

export type SellerPreferencesSnapshot = { preferences: SellerPreferences; revision: number; serious: boolean };
function snapshot(payload: Record<string, unknown>): SellerPreferencesSnapshot {
  if (typeof payload.revision !== 'number' || !Number.isSafeInteger(payload.revision) || payload.revision < 0) throw new Error('Seller service returned an invalid revision.');
  return { preferences: validateSellerPreferences(payload.preferences), revision: payload.revision, serious: payload.serious === true };
}
export async function getSellerPreferences(): Promise<SellerPreferencesSnapshot> {
  return snapshot(await execute('/preferences/get', { namespace: 'seller-assistance' }));
}
export async function saveSellerPreferences(preferences: SellerPreferences, expectedRevision: number): Promise<SellerPreferencesSnapshot> {
  if (!Number.isSafeInteger(expectedRevision) || expectedRevision < 0) throw new Error('Reload preferences before saving.');
  return snapshot(await execute('/preferences/save', { namespace: 'seller-assistance', value: validateSellerPreferences(preferences), expectedRevision }));
}
export async function getSellerAssistanceCapabilities() {
  const payload = await execute('/capabilities', {});
  return { advancedAnalytics: payload.advancedAnalytics === true, offerGuardrails: payload.offerGuardrails === true || payload.advancedAnalytics === true };
}
