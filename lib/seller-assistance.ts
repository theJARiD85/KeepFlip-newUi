import { calculateNetProceeds, netProfitFloor, type NetProceedsInput } from './seller-net-proceeds';

export type SavedResponse = { id: string; title: string; body: string };
export type ShippingPreset = { id: string; name: string; shippingExpenseCents: number | null; packagingCents: number | null; packageType: string; weightGrams: number | null; lengthCm: number | null; widthCm: number | null; heightCm: number | null; handlingDays: number | null; shippingServices: string[]; returnsAccepted: boolean; returnWindowDays: number | null; returnShippingPaidBy: 'seller' | 'buyer' | null };
export type AssistanceHistory = { id: string; itemId: string; itemTitle: string; occurredAt: string; action: 'review' | 'reply_draft' | 'offer_review'; notes: string };
export type SellerPreferences = { version: number; savedResponses: SavedResponse[]; shippingPresets: ShippingPreset[]; responseReminderHours: number; manualHistory: AssistanceHistory[] };
export const EMPTY_SELLER_PREFERENCES: SellerPreferences = { version: 1, savedResponses: [], shippingPresets: [], responseReminderHours: 24, manualHistory: [] };

export function parseMoneyInput(value: string): number | null {
  if (!value.trim()) return null;
  if (!/^\d+(?:\.\d{1,2})?$/.test(value.trim())) throw new Error('Use a non-negative amount with at most two decimal places.');
  const cents = Math.round(Number(value) * 100);
  if (!Number.isSafeInteger(cents) || cents > 1_000_000_000) throw new Error('Amount is too large.');
  return cents;
}

/** Structural inputs keep business logic independent of the native Appwrite SDK. */
export function responseReminder(thread: { sellerId: string; latest: { senderId: string; recipientId: string; createdAt: string; status: string } }, sellerId: string, hours = 24, now = Date.now()) {
  if (!sellerId || thread.sellerId !== sellerId || thread.latest.senderId === sellerId || thread.latest.recipientId !== sellerId || thread.latest.status !== 'sent') return null;
  const sent = Date.parse(thread.latest.createdAt);
  if (!Number.isFinite(sent) || sent > now || !Number.isFinite(hours) || hours < 1) return null;
  const elapsedHours = Math.floor((now - sent) / 3_600_000);
  return elapsedHours >= hours ? { elapsedHours, label: `Awaiting your review for ${elapsedHours} hours` } : null;
}

export type AgingEvidence = {
  listedAt: string | null;
  photoCount: number;
  condition: string | null;
  typicalDays: number | null;
  verifiedComparableCents: number | null;
  comparableCheckedAt: string | null;
  askingPriceCents: number | null;
};
export function agingRecommendations(evidence: AgingEvidence, now = Date.now()) {
  const start = evidence.listedAt ? Date.parse(evidence.listedAt) : NaN;
  if (!Number.isFinite(start) || start > now) return { ageDays: null, checkpoint: null, recommendations: ['Enter the actual listing date to review 7, 14, 30 and 45 day checkpoints. Inventory acquisition dates are not listing dates.'] };
  const ageDays = Math.floor((now - start) / 86_400_000);
  const checkpoint = ([45, 30, 14, 7] as const).find(day => ageDays >= day) ?? null;
  const recommendations: string[] = [];
  if (!checkpoint) recommendations.push('Before day 7: verify the listing facts and record buyer questions.');
  if (checkpoint && evidence.photoCount < 3) recommendations.push(`Only ${evidence.photoCount} saved photos: review coverage of labels, condition and defects before changing price.`);
  if (checkpoint && !evidence.condition?.trim()) recommendations.push('Condition is missing. Inspect and document it before revising the listing.');
  if (checkpoint && checkpoint >= 14) {
    const checked = evidence.comparableCheckedAt ? Date.parse(evidence.comparableCheckedAt) : NaN;
    const fresh = Number.isFinite(checked) && checked <= now && now - checked <= 14 * 86_400_000;
    if (fresh && evidence.verifiedComparableCents != null && evidence.verifiedComparableCents > 0 && evidence.askingPriceCents != null && evidence.askingPriceCents > evidence.verifiedComparableCents) recommendations.push('Your asking price exceeds the seller-verified comparable you entered. Review identity, condition and shipping differences, then check your profit floor before choosing a price.');
    else recommendations.push('No current evidence of overpricing has been established. Refresh matching sold comparables before considering a price change.');
  }
  if (checkpoint && checkpoint >= 30) recommendations.push(evidence.typicalDays != null && evidence.typicalDays > 0 ? `Saved research suggests about ${evidence.typicalDays} days to sell; this is directional, not a verified sell-through rate. Compare it with this listing’s ${ageDays} days.` : 'Selling-speed evidence is missing. Review category demand and relevant sold dates.');
  if (checkpoint === 45) recommendations.push('Review storage cost and your selling deadline. Choose to hold, improve the listing, or manually consider another channel after checking its rules and costs.');
  if (checkpoint && !recommendations.length) recommendations.push('Saved photo coverage and condition are present. Review their accuracy and buyer questions; age alone does not support a markdown.');
  return { ageDays, checkpoint, recommendations };
}

export function assessOffer(input: NetProceedsInput, minimumProfitCents: number, serious: boolean) {
  if (!serious) throw new Error('Offer floor guardrails require Serious access.');
  // Combined rates above 100% make price-to-profit non-monotonic for floor search.
  if (input.marketplaceFeeBps !== null && input.marketplaceFeeBps + input.promotedFeeBps > 10_000) throw new Error('Combined percentage fees cannot exceed 100% for floor planning.');
  const estimate = calculateNetProceeds(input);
  const floorCents = netProfitFloor(input, minimumProfitCents);
  return { estimate, floorCents, status: estimate.profitCents === null ? 'needs_costs' as const : floorCents === null ? 'unreachable' as const : estimate.profitCents >= minimumProfitCents ? 'meets_floor' as const : 'below_floor' as const };
}

export function itemFactLines(item: { title: string; brand: string | null; model: string | null; condition: string; conditionNotes: string; sku: string | null; storageLocation: string | null }) {
  return [['Title', item.title], ['Brand', item.brand], ['Model', item.model], ['Condition', item.condition], ['Condition notes', item.conditionNotes], ['SKU (private)', item.sku], ['Storage (private)', item.storageLocation]].filter((entry): entry is [string, string] => Boolean(entry[1]?.trim())).map(([label, value]) => `${label}: ${value}`);
}

export function summarizeManualHistory(history: AssistanceHistory[]) {
  return { recordedActions: history.length, reviews: history.filter(x => x.action === 'review').length, draftReviews: history.filter(x => x.action === 'reply_draft').length, offerReviews: history.filter(x => x.action === 'offer_review').length };
}

export function validateSellerPreferences(value: unknown): SellerPreferences {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('Invalid seller preferences.');
  const p = value as Record<string, unknown>;
  const integer = (v: unknown, max: number, min = 0): number => { if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < min || v > max) throw new Error('Invalid preference number.'); return v; };
  const str = (v: unknown, max: number, empty = false): string => { if (typeof v !== 'string' || (!empty && !v.trim()) || v.length > max) throw new Error('Invalid preference text.'); return v.trim(); };
  const list = (v: unknown, max: number): Record<string, unknown>[] => { if (!Array.isArray(v) || v.length > max || v.some(x => !x || typeof x !== 'object' || Array.isArray(x))) throw new Error('Invalid preference list.'); const ids = v.map(x => str(x.id, 36)); if (new Set(ids).size !== ids.length) throw new Error('Duplicate preference IDs.'); return v; };

  return {
    version: integer(p.version, 1, 1),
    savedResponses: list(p.savedResponses, 30).map(x => ({ id: str(x.id, 36), title: str(x.title, 120), body: str(x.body, 2000) })),
    shippingPresets: list(p.shippingPresets, 30).map(validateShippingPreset),
    responseReminderHours: integer(p.responseReminderHours ?? 24, 168, 1),
    manualHistory: list(p.manualHistory ?? [], 100).map(x => { const action = x.action; if (action !== 'review' && action !== 'reply_draft' && action !== 'offer_review') throw new Error('Invalid history action.'); const occurredAt = str(x.occurredAt, 40); if (!Number.isFinite(Date.parse(occurredAt))) throw new Error('Invalid history date.'); return { id: str(x.id, 36), itemId: str(x.itemId, 36, true), itemTitle: str(x.itemTitle, 200), occurredAt, action, notes: str(x.notes ?? '', 1000, true) }; }),
  };
}



/** Older saved cost-only presets acquire explicit unknown defaults on read. */
export function validateShippingPreset(value: Record<string, unknown>): ShippingPreset {
  const text = (v: unknown, max: number, allowEmpty = false) => { if (typeof v !== 'string' || v.length > max || (!allowEmpty && !v.trim())) throw new Error('Invalid shipping preset text.'); return v.trim(); };
  const integer = (v: unknown, min: number, max: number) => { if (v == null) return null; if (typeof v !== 'number' || !Number.isSafeInteger(v) || v < min || v > max) throw new Error('Invalid shipping preset amount or duration.'); return v; };
  const dimension = (v: unknown) => { if (v == null) return null; if (typeof v !== 'number' || !Number.isFinite(v) || v <= 0 || v > 1000 || Math.abs(v * 100 - Math.round(v * 100)) > 1e-7) throw new Error('Dimensions must be greater than 0 and at most 1,000 cm, with at most two decimal places.'); return v; };
  const services = value.shippingServices ?? [];
  if (!Array.isArray(services) || services.length > 10) throw new Error('Use at most 10 shipping services.');
  const returnsAccepted = value.returnsAccepted ?? false;
  if (typeof returnsAccepted !== 'boolean') throw new Error('Choose whether returns are accepted.');
  const returnWindowDays = integer(value.returnWindowDays, 1, 365);
  const payer = value.returnShippingPaidBy ?? null;
  if (returnsAccepted ? returnWindowDays === null || (payer !== 'seller' && payer !== 'buyer') : returnWindowDays !== null || payer !== null) throw new Error('Accepted returns require a return window and shipping payer; no-return presets must leave both empty.');
  return { id: text(value.id, 36), name: text(value.name, 120), packageType: text(value.packageType ?? '', 80, true),
    shippingExpenseCents: integer(value.shippingExpenseCents, 0, 1_000_000_000), packagingCents: integer(value.packagingCents, 0, 1_000_000_000),
    weightGrams: integer(value.weightGrams, 1, 1_000_000), lengthCm: dimension(value.lengthCm), widthCm: dimension(value.widthCm), heightCm: dimension(value.heightCm), handlingDays: integer(value.handlingDays, 0, 30),
    shippingServices: services.map(service => text(service, 80)), returnsAccepted, returnWindowDays, returnShippingPaidBy: payer as ShippingPreset['returnShippingPaidBy'] };
}
