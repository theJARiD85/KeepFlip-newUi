import { APPWRITE, ExecutionMethod, functions } from '@/lib/appwrite';
import type { PublishEbayListingInput } from '@/services/ebayListingService';

export type EbayListingReview = {
  identityConfirmed: boolean;
  photosReviewed: boolean;
  conditionConfirmed: boolean;
  measurementsConfirmed: boolean;
  shippingConfirmed: boolean;
  returnsConfirmed: boolean;
  measurements: 'provided' | 'not_applicable' | '';
};
export const EMPTY_EBAY_LISTING_REVIEW: EbayListingReview = {
  identityConfirmed: false, photosReviewed: false, conditionConfirmed: false,
  measurementsConfirmed: false, shippingConfirmed: false, returnsConfirmed: false,
  measurements: '',
};
export type EbayListingReadiness = {
  ready: boolean;
  score: number;
  checkedAt: string;
  checks: { id: string; label: string; complete: boolean; detail: string }[];
  requiredAspects: { name: string; field: string; values: string[]; allowedValues: string[]; mode: string; cardinality: string }[];
};

export async function checkEbayListingReadiness(input: PublishEbayListingInput): Promise<EbayListingReadiness> {
  if (!APPWRITE.ebayOauthFunctionId) throw new Error('Connect seller services before checking eBay readiness.');
  const execution = await functions.createExecution({ functionId: APPWRITE.ebayOauthFunctionId,
    async: false, method: ExecutionMethod.POST, xpath: '/listing/readiness',
    headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) });
  let payload: Record<string, unknown>;
  try { payload = JSON.parse(execution.responseBody || '{}'); } catch { throw new Error('The readiness response could not be read. Retry the check.'); }
  if (!payload || typeof payload !== 'object' || payload.ok !== true || execution.responseStatusCode >= 400) {
    throw new Error(typeof payload?.error === 'string' ? payload.error : 'Could not verify eBay readiness. Update the seller backend and retry.');
  }
  if (typeof payload.ready !== 'boolean' || !Number.isFinite(payload.score) || !Array.isArray(payload.checks)
    || !Array.isArray(payload.requiredAspects)) throw new Error('The readiness response was incomplete.');
  const checks = payload.checks.map((entry: Record<string, unknown>) => {
    if (!entry || typeof entry.id !== 'string' || typeof entry.complete !== 'boolean' || typeof entry.detail !== 'string') throw new Error('The readiness checklist was incomplete.');
    return { id: entry.id, label: typeof entry.label === 'string' ? entry.label : entry.id, complete: entry.complete, detail: entry.detail };
  });
  const requiredAspects = payload.requiredAspects.map((entry: Record<string, unknown>) => {
    if (!entry || typeof entry.name !== 'string' || !Array.isArray(entry.values) || !Array.isArray(entry.allowedValues)) throw new Error('Required item specifics could not be read.');
    return { name: entry.name, field: String(entry.field || entry.name), values: entry.values.filter((v): v is string => typeof v === 'string'),
      allowedValues: entry.allowedValues.filter((v): v is string => typeof v === 'string'), mode: String(entry.mode || 'FREE_TEXT'), cardinality: String(entry.cardinality || 'SINGLE') };
  });
  return { ready: payload.ready && checks.every(entry => entry.complete), score: Math.max(0, Math.min(100, Number(payload.score))),
    checkedAt: typeof payload.checkedAt === 'string' ? payload.checkedAt : '', checks, requiredAspects };
}
