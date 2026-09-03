import crypto from 'node:crypto';
import {
  Client,
  Permission,
  Role,
  TablesDB,
} from 'node-appwrite';

const SERVICE = 'keepflip-subscription-police';
const VERSION = '2026-09-03.1';

const ENTITLEMENTS = {
  hobbyist: 'keepflip_hobbyist',
  serious: 'keepflip_serious',
  power: 'keepflip_power',
};

const PLAN_PRIORITY = ['power', 'serious', 'hobbyist'];

const PLAN_POLICY = {
  hobbyist: {
    activeListingsPerMonth: 50,
    aiValuationScansPerMonth: 100,
    features: new Set(['basic_books']),
  },
  serious: {
    activeListingsPerMonth: 250,
    aiValuationScansPerMonth: null,
    features: new Set([
      'basic_books',
      'automated_books',
      'schedule_c_export',
    ]),
  },
  power: {
    activeListingsPerMonth: null,
    aiValuationScansPerMonth: null,
    features: new Set([
      'basic_books',
      'automated_books',
      'schedule_c_export',
      'advanced_bookkeeping_analytics',
      'multi_user',
    ]),
  },
};

const FEATURE_NAMES = new Set([
  'basic_books',
  'automated_books',
  'schedule_c_export',
  'advanced_bookkeeping_analytics',
  'multi_user',
]);

const LIMIT_FEATURES = new Set(['ai_valuation', 'active_listing']);

class HttpError extends Error {
  constructor(status, message, code = 'REQUEST_FAILED') {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
  }
}

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`Missing function environment variable: ${name}`);
  return value;
}

function optionalEnv(name, fallback = '') {
  return process.env[name]?.trim() || fallback;
}

function boolEnv(name, fallback = false) {
  const value = process.env[name]?.trim().toLowerCase();
  if (!value) return fallback;
  return value === '1' || value === 'true' || value === 'yes';
}

function functionEndpoint() {
  return requiredEnv('APPWRITE_ENDPOINT').replace(/\/+$/, '');
}

function functionProjectId() {
  return requiredEnv('APPWRITE_FUNCTION_PROJECT_ID');
}

function databaseId() {
  return optionalEnv('APPWRITE_DATABASE_ID', 'keepflip');
}

function subscriptionTableId() {
  return optionalEnv(
    'APPWRITE_USER_SUBSCRIPTIONS_TABLE_ID',
    'user_subscription',
  );
}

function requestHeader(req, name) {
  const headers = req.headers ?? {};
  const lower = name.toLowerCase();
  const value = headers[lower] ?? headers[name] ?? headers[name.toUpperCase()];
  return typeof value === 'string' ? value.trim() : '';
}

function requestPath(req) {
  const direct =
    (typeof req.path === 'string' && req.path) ||
    requestHeader(req, 'x-appwrite-function-path') ||
    '/';

  try {
    return new URL(direct, 'https://keepflip.local').pathname.replace(/\/+$/, '') || '/';
  } catch {
    return direct.split('?')[0].replace(/\/+$/, '') || '/';
  }
}

function requestMethod(req) {
  return String(req.method || 'GET').toUpperCase();
}

function rawBody(req) {
  if (typeof req.bodyText === 'string') return req.bodyText;
  if (typeof req.body === 'string') return req.body;
  return '';
}

function parseBody(req) {
  if (req.bodyJson && typeof req.bodyJson === 'object') return req.bodyJson;

  const text = rawBody(req).trim();
  if (!text) return {};

  try {
    return JSON.parse(text);
  } catch {
    throw new HttpError(400, 'Request body must be valid JSON.', 'INVALID_JSON');
  }
}

function safeText(value, maximum = 255) {
  if (typeof value !== 'string') return '';
  return value.trim().slice(0, maximum);
}

function nullableText(value, maximum = 255) {
  return safeText(value, maximum) || null;
}

function toIsoFromMs(value) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) return null;
  const date = new Date(number);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function validIso(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : null;
}

function dateMs(value) {
  const iso = validIso(value);
  return iso ? new Date(iso).getTime() : 0;
}

function normalizeStore(value) {
  const store = safeText(value, 32).toUpperCase();
  if (!store) return null;
  return store.replace(/[- ]/g, '_');
}

function isAnonymousRevenueCatId(value) {
  return safeText(value, 200).startsWith('$RCAnonymousID:');
}

function validKeepFlipUserId(value) {
  const id = safeText(value, 64);
  if (!id || isAnonymousRevenueCatId(id)) return null;
  return /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/.test(id) ? id : null;
}

function revenueCatUserCandidates(event) {
  const candidates = [
    event?.app_user_id,
    ...(Array.isArray(event?.aliases) ? event.aliases : []),
    event?.original_app_user_id,
  ];

  const unique = [];
  for (const candidate of candidates) {
    const id = validKeepFlipUserId(candidate);
    if (id && !unique.includes(id)) unique.push(id);
  }
  return unique;
}

function constantTimeEqual(left, right) {
  const a = Buffer.from(String(left ?? ''), 'utf8');
  const b = Buffer.from(String(right ?? ''), 'utf8');
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

function verifyRevenueCatAuthorization(req) {
  const expected = requiredEnv('REVENUECAT_WEBHOOK_AUTHORIZATION');
  const actual = requestHeader(req, 'authorization');
  if (!actual || !constantTimeEqual(actual, expected)) {
    throw new HttpError(401, 'RevenueCat webhook authorization failed.', 'UNAUTHORIZED');
  }
}

function parseRevenueCatSignature(value) {
  const parts = String(value || '')
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);

  let timestamp = '';
  let signature = '';
  for (const part of parts) {
    const [key, ...rest] = part.split('=');
    const joined = rest.join('=').trim();
    if (key === 't') timestamp = joined;
    if (key === 'v1') signature = joined;
  }
  return { timestamp, signature };
}

function verifyRevenueCatHmac(req) {
  const secret = optionalEnv('REVENUECAT_WEBHOOK_HMAC_SECRET');
  if (!secret) return;

  const body = rawBody(req);
  if (!body) {
    throw new HttpError(
      401,
      'RevenueCat webhook signature could not be verified without the raw body.',
      'MISSING_RAW_BODY',
    );
  }

  const header = requestHeader(req, 'x-revenuecat-webhook-signature');
  const { timestamp, signature } = parseRevenueCatSignature(header);
  const timestampNumber = Number(timestamp);
  if (!Number.isFinite(timestampNumber) || !signature) {
    throw new HttpError(401, 'RevenueCat webhook signature is invalid.', 'INVALID_SIGNATURE');
  }

  const toleranceSeconds = Math.max(
    30,
    Number(optionalEnv('REVENUECAT_HMAC_TOLERANCE_SECONDS', '300')) || 300,
  );
  const ageSeconds = Math.abs(Math.floor(Date.now() / 1000) - timestampNumber);
  if (ageSeconds > toleranceSeconds) {
    throw new HttpError(401, 'RevenueCat webhook signature is too old.', 'STALE_SIGNATURE');
  }

  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${body}`)
    .digest('hex');

  if (!constantTimeEqual(signature.toLowerCase(), expected.toLowerCase())) {
    throw new HttpError(401, 'RevenueCat webhook signature is invalid.', 'INVALID_SIGNATURE');
  }
}

function createFunctionTables(req) {
  const dynamicKey = requestHeader(req, 'x-appwrite-key');
  if (!dynamicKey) {
    throw new HttpError(
      503,
      'Appwrite did not provide the function API key.',
      'APPWRITE_FUNCTION_KEY_MISSING',
    );
  }

  const client = new Client()
    .setEndpoint(functionEndpoint())
    .setProject(functionProjectId())
    .setKey(dynamicKey);

  return new TablesDB(client);
}

function isNotFound(error) {
  return Number(error?.code) === 404 || Number(error?.status) === 404;
}

async function getSubscriptionRow(tables, userId) {
  try {
    return await tables.getRow({
      databaseId: databaseId(),
      tableId: subscriptionTableId(),
      rowId: userId,
    });
  } catch (error) {
    if (isNotFound(error)) return null;
    throw error;
  }
}

function normalizePlan(value) {
  return value === 'hobbyist' || value === 'serious' || value === 'power'
    ? value
    : null;
}

function normalizeStatus(value) {
  return [
    'trialing',
    'active',
    'grace_period',
    'billing_issue',
    'cancelled',
    'expired',
    'revoked',
    'unknown',
  ].includes(value)
    ? value
    : 'unknown';
}

function normalizeRow(row) {
  if (!row || typeof row !== 'object') return null;

  const ownerId = safeText(row.ownerId, 64);
  if (!ownerId) return null;

  return {
    id: safeText(row.$id, 64) || ownerId,
    ownerId,
    provider: safeText(row.provider, 32) || 'revenuecat',
    revenueCatCustomerId:
      safeText(row.revenueCatCustomerId, 255) || ownerId,
    plan: normalizePlan(row.plan),
    entitlement: nullableText(row.entitlement, 64),
    status: normalizeStatus(row.status),
    isTrial: row.isTrial === true,
    startedAt: validIso(row.startedAt),
    trialEndsAt: validIso(row.trialEndsAt),
    currentPeriodEndsAt: validIso(row.currentPeriodEndsAt),
    willRenew: row.willRenew === true,
    productId: nullableText(row.productId, 128),
    store: nullableText(row.store, 32),
    lastEventId: nullableText(row.lastEventId, 255),
    updatedAt: validIso(row.updatedAt),
    isSandbox: row.isSandbox === true,
  };
}

function rowData(record) {
  return {
    ownerId: record.ownerId,
    provider: 'revenuecat',
    revenueCatCustomerId: record.revenueCatCustomerId,
    plan: record.plan,
    entitlement: record.entitlement,
    status: record.status,
    isTrial: Boolean(record.isTrial),
    startedAt: record.startedAt,
    trialEndsAt: record.trialEndsAt,
    currentPeriodEndsAt: record.currentPeriodEndsAt,
    willRenew: Boolean(record.willRenew),
    productId: record.productId,
    store: record.store,
    lastEventId: record.lastEventId,
    updatedAt: record.updatedAt,
    isSandbox: Boolean(record.isSandbox),
  };
}

async function upsertSubscriptionRow(tables, record) {
  if (!record?.ownerId || !record.plan || !record.entitlement) {
    throw new Error('Subscription row requires ownerId, plan, and entitlement.');
  }

  return tables.upsertRow({
    databaseId: databaseId(),
    tableId: subscriptionTableId(),
    rowId: record.ownerId,
    data: rowData(record),
    permissions: [Permission.read(Role.user(record.ownerId))],
  });
}

function planFromEntitlements(entitlementIds) {
  const values = Array.isArray(entitlementIds)
    ? entitlementIds.map((value) => safeText(value, 128))
    : [];

  for (const plan of PLAN_PRIORITY) {
    if (values.includes(ENTITLEMENTS[plan])) return plan;
  }
  return null;
}

function planFromProduct(value) {
  const product = safeText(value, 256).toLowerCase();
  if (!product) return null;
  if (product.includes('power')) return 'power';
  if (product.includes('serious')) return 'serious';
  if (product.includes('hobbyist')) return 'hobbyist';
  return null;
}

function planAndEntitlementFromEvent(event, existing) {
  const eventPlan =
    planFromEntitlements(event?.entitlement_ids) ||
    planFromProduct(event?.new_product_id) ||
    planFromProduct(event?.product_id);

  const plan = eventPlan || normalizePlan(existing?.plan);
  const entitlement =
    (plan && ENTITLEMENTS[plan]) ||
    nullableText(existing?.entitlement, 64);

  return { plan, entitlement };
}

function eventStatus(event, existing) {
  const type = safeText(event?.type, 64).toUpperCase();
  const periodType = safeText(event?.period_type, 32).toUpperCase();
  const isTrial = periodType === 'TRIAL';
  const now = Date.now();
  const expirationMs = Number(event?.expiration_at_ms);
  const graceMs = Number(event?.grace_period_expiration_at_ms);
  const notExpired =
    !Number.isFinite(expirationMs) || expirationMs <= 0 || expirationMs > now;
  const inGrace = Number.isFinite(graceMs) && graceMs > now;

  if (type === 'EXPIRATION') return 'expired';
  if (type === 'REFUND') return 'revoked';
  if (type === 'CANCELLATION' || type === 'SUBSCRIPTION_PAUSED') {
    return notExpired ? 'cancelled' : 'expired';
  }
  if (type === 'BILLING_ISSUE') {
    return inGrace ? 'grace_period' : 'billing_issue';
  }
  if (
    type === 'INITIAL_PURCHASE' ||
    type === 'RENEWAL' ||
    type === 'UNCANCELLATION' ||
    type === 'REFUND_REVERSED' ||
    type === 'SUBSCRIPTION_EXTENDED' ||
    type === 'PRODUCT_CHANGE' ||
    type === 'NON_RENEWING_PURCHASE'
  ) {
    return isTrial ? 'trialing' : 'active';
  }

  return normalizeStatus(existing?.status || (isTrial ? 'trialing' : 'active'));
}

function eventWillRenew(event, status) {
  const type = safeText(event?.type, 64).toUpperCase();
  const periodType = safeText(event?.period_type, 32).toUpperCase();

  if (
    type === 'CANCELLATION' ||
    type === 'EXPIRATION' ||
    type === 'REFUND' ||
    type === 'SUBSCRIPTION_PAUSED'
  ) {
    return false;
  }
  if (periodType === 'PREPAID') return false;
  if (status === 'expired' || status === 'revoked') return false;
  return true;
}

function recordFromRevenueCatEvent(event, userId, existing) {
  const { plan, entitlement } = planAndEntitlementFromEvent(event, existing);
  if (!plan || !entitlement) return null;

  const status = eventStatus(event, existing);
  const isTrial = safeText(event?.period_type, 32).toUpperCase() === 'TRIAL';
  const eventTimestamp =
    Number(event?.event_timestamp_ms) > 0
      ? Number(event.event_timestamp_ms)
      : Date.now();

  const purchasedAt =
    toIsoFromMs(event?.purchased_at_ms) ||
    existing?.startedAt ||
    new Date(eventTimestamp).toISOString();

  const expirationAt = toIsoFromMs(event?.expiration_at_ms);
  const graceAt = toIsoFromMs(event?.grace_period_expiration_at_ms);
  const periodEnd =
    status === 'grace_period'
      ? graceAt || expirationAt
      : expirationAt || existing?.currentPeriodEndsAt || null;

  return {
    ownerId: userId,
    revenueCatCustomerId:
      safeText(event?.app_user_id, 255) || userId,
    plan,
    entitlement,
    status,
    isTrial,
    startedAt: existing?.startedAt || purchasedAt,
    trialEndsAt: isTrial
      ? expirationAt || existing?.trialEndsAt || null
      : null,
    currentPeriodEndsAt: periodEnd,
    willRenew: eventWillRenew(event, status),
    productId:
      nullableText(event?.new_product_id, 128) ||
      nullableText(event?.product_id, 128) ||
      existing?.productId ||
      null,
    store: normalizeStore(event?.store) || existing?.store || null,
    lastEventId:
      nullableText(event?.id, 255) || existing?.lastEventId || null,
    updatedAt: new Date(eventTimestamp).toISOString(),
    isSandbox:
      safeText(event?.environment, 32).toUpperCase() === 'SANDBOX',
  };
}

function rowAllowsAccess(row, now = Date.now()) {
  const record = normalizeRow(row) || row;
  if (!record?.plan) return false;

  if (record.status === 'revoked' || record.status === 'expired') return false;

  const periodEnd = dateMs(record.currentPeriodEndsAt);
  if (
    record.status === 'cancelled' ||
    record.status === 'billing_issue' ||
    record.status === 'grace_period'
  ) {
    return periodEnd > now;
  }

  if (record.status === 'trialing' || record.status === 'active') {
    return !periodEnd || periodEnd > now;
  }

  return false;
}

function accessSummary(row) {
  const record = normalizeRow(row);
  if (!record) {
    return {
      active: false,
      plan: null,
      status: 'expired',
      isTrial: false,
      limits: {
        activeListingsPerMonth: 0,
        aiValuationScansPerMonth: 0,
      },
      features: [],
    };
  }

  const active = rowAllowsAccess(record);
  const policy = record.plan ? PLAN_POLICY[record.plan] : null;

  return {
    active,
    plan: active ? record.plan : record.plan,
    status: record.status,
    isTrial: active && record.isTrial,
    currentPeriodEndsAt: record.currentPeriodEndsAt,
    willRenew: record.willRenew,
    limits: active && policy
      ? {
          activeListingsPerMonth: policy.activeListingsPerMonth,
          aiValuationScansPerMonth: policy.aiValuationScansPerMonth,
        }
      : {
          activeListingsPerMonth: 0,
          aiValuationScansPerMonth: 0,
        },
    features:
      active && policy ? [...policy.features] : [],
  };
}

function publicRecord(row) {
  const record = normalizeRow(row);
  if (!record) return null;
  return record;
}

function eventIsStale(event, existing) {
  if (!existing?.updatedAt) return false;
  const incoming = Number(event?.event_timestamp_ms);
  if (!Number.isFinite(incoming) || incoming <= 0) return false;
  return incoming < dateMs(existing.updatedAt);
}

function revenueCatApiKey() {
  return optionalEnv('REVENUECAT_API_KEY');
}

async function fetchRevenueCatSubscriber(userId) {
  const apiKey = revenueCatApiKey();
  if (!apiKey) {
    throw new HttpError(
      503,
      'RevenueCat reconciliation is not configured.',
      'REVENUECAT_API_NOT_CONFIGURED',
    );
  }

  const response = await fetch(
    `https://api.revenuecat.com/v1/subscribers/${encodeURIComponent(userId)}`,
    {
      method: 'GET',
      headers: {
        Accept: 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
    },
  );

  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = null;
    }
  }

  if (!response.ok) {
    throw new HttpError(
      response.status >= 500 ? 503 : 502,
      `RevenueCat status lookup failed with HTTP ${response.status}.`,
      'REVENUECAT_LOOKUP_FAILED',
    );
  }

  const subscriber = body?.subscriber;
  if (!subscriber || typeof subscriber !== 'object') {
    throw new HttpError(
      502,
      'RevenueCat returned an invalid customer response.',
      'REVENUECAT_INVALID_RESPONSE',
    );
  }

  return subscriber;
}

function revenueCatEntitlementCandidate(subscriber, plan) {
  const entitlementId = ENTITLEMENTS[plan];
  const entitlement = subscriber?.entitlements?.[entitlementId];
  if (!entitlement || typeof entitlement !== 'object') return null;

  const productId = nullableText(entitlement.product_identifier, 128);
  const subscription =
    (productId && subscriber?.subscriptions?.[productId]) || {};

  const expiration =
    validIso(subscription.expires_date) ||
    validIso(entitlement.expires_date);
  const grace =
    validIso(subscription.grace_period_expires_date) ||
    validIso(entitlement.grace_period_expires_date);
  const now = Date.now();
  const expirationMs = dateMs(expiration);
  const graceMs = dateMs(grace);
  const active = !expiration || expirationMs > now || graceMs > now;

  return {
    plan,
    entitlementId,
    entitlement,
    subscription,
    productId,
    expiration,
    grace,
    active,
    rankDate: Math.max(
      expirationMs,
      graceMs,
      dateMs(subscription.purchase_date),
      dateMs(entitlement.purchase_date),
      dateMs(subscription.original_purchase_date),
    ),
  };
}

function recordFromRevenueCatSubscriber(userId, subscriber, existing, eventId) {
  const candidates = PLAN_PRIORITY
    .map((plan) => revenueCatEntitlementCandidate(subscriber, plan))
    .filter(Boolean);

  const selected =
    candidates.find((candidate) => candidate.active) ||
    [...candidates].sort((a, b) => b.rankDate - a.rankDate)[0] ||
    null;

  if (!selected) {
    if (!existing?.plan || !existing?.entitlement) return null;
    return {
      ...existing,
      ownerId: userId,
      revenueCatCustomerId:
        safeText(subscriber?.original_app_user_id, 255) || userId,
      status: 'expired',
      isTrial: false,
      willRenew: false,
      currentPeriodEndsAt:
        existing.currentPeriodEndsAt || new Date().toISOString(),
      lastEventId: eventId || existing.lastEventId || null,
      updatedAt: new Date().toISOString(),
    };
  }

  const { subscription } = selected;
  const periodType = safeText(subscription?.period_type, 32).toUpperCase();
  const isTrial = periodType === 'TRIAL';
  const billingIssue = validIso(subscription?.billing_issues_detected_at);
  const unsubscribe = validIso(subscription?.unsubscribe_detected_at);
  const refunded = validIso(subscription?.refunded_at);
  const inGrace = dateMs(selected.grace) > Date.now();

  let status = 'expired';
  if (selected.active) {
    if (refunded) status = 'revoked';
    else if (isTrial) status = 'trialing';
    else if (inGrace) status = 'grace_period';
    else if (billingIssue) status = 'billing_issue';
    else if (unsubscribe) status = 'cancelled';
    else status = 'active';
  } else if (refunded) {
    status = 'revoked';
  }

  const periodEnd = inGrace
    ? selected.grace
    : selected.expiration;

  return {
    ownerId: userId,
    revenueCatCustomerId:
      safeText(subscriber?.original_app_user_id, 255) || userId,
    plan: selected.plan,
    entitlement: selected.entitlementId,
    status,
    isTrial: selected.active && isTrial,
    startedAt:
      validIso(subscription?.original_purchase_date) ||
      validIso(subscription?.purchase_date) ||
      validIso(selected.entitlement?.purchase_date) ||
      existing?.startedAt ||
      null,
    trialEndsAt:
      selected.active && isTrial ? selected.expiration : null,
    currentPeriodEndsAt: periodEnd || existing?.currentPeriodEndsAt || null,
    willRenew:
      selected.active &&
      !unsubscribe &&
      !refunded &&
      periodType !== 'PREPAID',
    productId: selected.productId || existing?.productId || null,
    store:
      normalizeStore(subscription?.store) ||
      existing?.store ||
      null,
    lastEventId: eventId || existing?.lastEventId || null,
    updatedAt: new Date().toISOString(),
    isSandbox:
      typeof subscription?.is_sandbox === 'boolean'
        ? subscription.is_sandbox
        : Boolean(existing?.isSandbox),
  };
}

async function reconcileUser(tables, userId, eventId = null) {
  const existing = normalizeRow(await getSubscriptionRow(tables, userId));
  const subscriber = await fetchRevenueCatSubscriber(userId);
  const record = recordFromRevenueCatSubscriber(
    userId,
    subscriber,
    existing,
    eventId,
  );

  if (!record) return null;
  await upsertSubscriptionRow(tables, record);
  return record;
}

function verifyRevenueCatApp(event) {
  const expectedAppId = optionalEnv('REVENUECAT_ALLOWED_APP_ID');
  if (!expectedAppId) return;

  const actual = safeText(event?.app_id, 255);
  if (!actual || actual !== expectedAppId) {
    throw new HttpError(
      403,
      'RevenueCat webhook was sent for a different app.',
      'WRONG_REVENUECAT_APP',
    );
  }
}

function verifyRevenueCatEnvironment(event) {
  const environment = safeText(event?.environment, 32).toUpperCase();
  if (environment !== 'SANDBOX') return;
  if (boolEnv('REVENUECAT_ALLOW_SANDBOX', true)) return;

  throw new HttpError(
    403,
    'RevenueCat sandbox events are disabled for this function.',
    'SANDBOX_DISABLED',
  );
}

async function processRevenueCatUser({
  tables,
  event,
  userId,
  log,
}) {
  const existingRow = await getSubscriptionRow(tables, userId);
  const existing = normalizeRow(existingRow);

  if (existing?.lastEventId && existing.lastEventId === event.id) {
    if (revenueCatApiKey()) {
      const reconciled = await reconcileUser(tables, userId, event.id);
      return {
        userId,
        duplicate: true,
        reconciled: true,
        subscription: publicRecord(reconciled),
      };
    }

    return {
      userId,
      duplicate: true,
      reconciled: false,
      subscription: publicRecord(existing),
    };
  }

  if (eventIsStale(event, existing)) {
    return {
      userId,
      stale: true,
      subscription: publicRecord(existing),
    };
  }

  const eventRecord = recordFromRevenueCatEvent(event, userId, existing);
  if (eventRecord) {
    await upsertSubscriptionRow(tables, eventRecord);
  }

  if (revenueCatApiKey()) {
    const reconciled = await reconcileUser(tables, userId, event.id);
    return {
      userId,
      reconciled: true,
      subscription: publicRecord(reconciled),
    };
  }

  if (!eventRecord) {
    log?.(
      `${SERVICE} ignored event ${safeText(event?.id, 80) || 'unknown'} for user ${userId}: no KeepFlip entitlement could be resolved.`,
    );
  }

  return {
    userId,
    reconciled: false,
    subscription: publicRecord(eventRecord || existing),
  };
}

async function handleTransfer({ tables, event, log }) {
  const timestamp =
    Number(event?.event_timestamp_ms) > 0
      ? Number(event.event_timestamp_ms)
      : Date.now();
  const updatedAt = new Date(timestamp).toISOString();
  const eventId = nullableText(event?.id, 255);

  const fromIds = (Array.isArray(event?.transferred_from)
    ? event.transferred_from
    : []
  )
    .map(validKeepFlipUserId)
    .filter(Boolean);
  const toIds = (Array.isArray(event?.transferred_to)
    ? event.transferred_to
    : []
  )
    .map(validKeepFlipUserId)
    .filter(Boolean);

  const sourceRows = [];
  for (const fromId of fromIds) {
    const row = normalizeRow(await getSubscriptionRow(tables, fromId));
    if (row) sourceRows.push(row);
  }

  const sourceForCopy = sourceRows.find((row) => rowAllowsAccess(row)) || sourceRows[0] || null;

  for (const toId of toIds) {
    if (revenueCatApiKey()) {
      await reconcileUser(tables, toId, eventId);
      continue;
    }

    if (!sourceForCopy?.plan || !sourceForCopy?.entitlement) continue;

    await upsertSubscriptionRow(tables, {
      ...sourceForCopy,
      ownerId: toId,
      revenueCatCustomerId: toId,
      lastEventId: eventId,
      updatedAt,
    });
  }

  for (const source of sourceRows) {
    await upsertSubscriptionRow(tables, {
      ...source,
      status: 'revoked',
      isTrial: false,
      willRenew: false,
      currentPeriodEndsAt: updatedAt,
      lastEventId: eventId,
      updatedAt,
    });
  }

  log?.(
    `${SERVICE} processed RevenueCat transfer: from=${fromIds.length} to=${toIds.length}.`,
  );

  return {
    transferredFrom: fromIds.length,
    transferredTo: toIds.length,
  };
}

async function handleRevenueCatWebhook(req, tables, log) {
  verifyRevenueCatAuthorization(req);
  verifyRevenueCatHmac(req);

  const body = parseBody(req);
  const event = body?.event;
  if (!event || typeof event !== 'object') {
    throw new HttpError(400, 'RevenueCat webhook event is missing.', 'EVENT_MISSING');
  }

  const eventType = safeText(event.type, 64).toUpperCase();
  const eventId = safeText(event.id, 255);

  if (!eventId) {
    throw new HttpError(400, 'RevenueCat webhook event ID is missing.', 'EVENT_ID_MISSING');
  }

  if (eventType === 'TEST') {
    return {
      ok: true,
      received: true,
      test: true,
      eventId,
      version: VERSION,
    };
  }

  verifyRevenueCatApp(event);
  verifyRevenueCatEnvironment(event);

  if (eventType === 'TRANSFER') {
    return {
      ok: true,
      received: true,
      eventId,
      eventType,
      transfer: await handleTransfer({ tables, event, log }),
      version: VERSION,
    };
  }

  const userId = revenueCatUserCandidates(event)[0] || null;
  if (!userId) {
    log?.(
      `${SERVICE} received event ${eventId} without a non-anonymous KeepFlip user ID; ignored.`,
    );
    return {
      ok: true,
      received: true,
      ignored: true,
      reason: 'no_keepflip_user_id',
      eventId,
      eventType,
      version: VERSION,
    };
  }

  const result = await processRevenueCatUser({
    tables,
    event,
    userId,
    log,
  });

  return {
    ok: true,
    received: true,
    eventId,
    eventType,
    result,
    version: VERSION,
  };
}

function authenticatedUserId(req) {
  const userId = validKeepFlipUserId(requestHeader(req, 'x-appwrite-user-id'));
  if (!userId) {
    throw new HttpError(
      401,
      'You must be signed in to check KeepFlip subscription access.',
      'AUTH_REQUIRED',
    );
  }
  return userId;
}

async function statusForUser(tables, userId, reconcile = false) {
  let row = await getSubscriptionRow(tables, userId);

  if ((reconcile || !row) && revenueCatApiKey()) {
    row = await reconcileUser(tables, userId, row?.lastEventId || null);
  }

  const record = publicRecord(row);
  return {
    subscription: record,
    access: accessSummary(record),
  };
}

async function handleStatus(req, tables) {
  const userId = authenticatedUserId(req);
  const body = parseBody(req);
  const reconcile = body?.refresh === true;

  const result = await statusForUser(tables, userId, reconcile);
  return {
    ok: true,
    ...result,
    version: VERSION,
  };
}

function policyCheck(access, body) {
  const capability = safeText(body?.capability, 64);
  if (!capability) {
    throw new HttpError(400, 'capability is required.', 'CAPABILITY_REQUIRED');
  }

  if (!access.active || !access.plan) {
    return {
      allowed: false,
      reason: 'subscription_required',
      capability,
      plan: access.plan,
      limit: 0,
      usage: null,
    };
  }

  const policy = PLAN_POLICY[access.plan];
  if (!policy) {
    return {
      allowed: false,
      reason: 'unknown_plan',
      capability,
      plan: access.plan,
      limit: 0,
      usage: null,
    };
  }

  if (FEATURE_NAMES.has(capability)) {
    const allowed = policy.features.has(capability);
    return {
      allowed,
      reason: allowed ? 'included' : 'upgrade_required',
      capability,
      plan: access.plan,
      limit: null,
      usage: null,
    };
  }

  if (LIMIT_FEATURES.has(capability)) {
    const key =
      capability === 'ai_valuation'
        ? 'aiValuationScansPerMonth'
        : 'activeListingsPerMonth';
    const limit = policy[key];
    const usageNumber = Number(body?.usage);
    const usage =
      Number.isFinite(usageNumber) && usageNumber >= 0
        ? Math.floor(usageNumber)
        : null;
    const allowed = limit == null || usage == null || usage < limit;

    return {
      allowed,
      reason:
        limit == null
          ? 'unlimited'
          : usage == null
            ? 'within_plan'
            : allowed
              ? 'within_limit'
              : 'limit_reached',
      capability,
      plan: access.plan,
      limit,
      usage,
    };
  }

  throw new HttpError(
    400,
    'Unknown subscription capability.',
    'UNKNOWN_CAPABILITY',
  );
}

async function handleAccessCheck(req, tables) {
  const userId = authenticatedUserId(req);
  const body = parseBody(req);
  const result = await statusForUser(
    tables,
    userId,
    body?.refresh === true,
  );

  return {
    ok: true,
    ...policyCheck(result.access, body),
    access: result.access,
    version: VERSION,
  };
}

async function handleReconcile(req, tables) {
  const userId = authenticatedUserId(req);
  const row = await reconcileUser(tables, userId, null);

  return {
    ok: true,
    subscription: publicRecord(row),
    access: accessSummary(row),
    version: VERSION,
  };
}

function errorPayload(caughtError) {
  if (caughtError instanceof HttpError) {
    return {
      status: caughtError.status,
      body: {
        ok: false,
        error: caughtError.message,
        code: caughtError.code,
        version: VERSION,
      },
    };
  }

  return {
    status: 500,
    body: {
      ok: false,
      error: 'KeepFlip could not verify subscription access.',
      code: 'SUBSCRIPTION_POLICE_FAILED',
      version: VERSION,
    },
  };
}

export default async ({ req, res, log, error }) => {
  const startedAt = Date.now();

  try {
    const method = requestMethod(req);
    const path = requestPath(req);

    if (method === 'GET' && (path === '/' || path === '/health')) {
      return res.json({
        ok: true,
        service: SERVICE,
        version: VERSION,
        subscriptionTable: subscriptionTableId(),
        revenueCatReconciliation: Boolean(revenueCatApiKey()),
        hmacVerification: Boolean(optionalEnv('REVENUECAT_WEBHOOK_HMAC_SECRET')),
      });
    }

    if (method !== 'POST') {
      return res.json(
        {
          ok: false,
          error: 'Use POST for this subscription endpoint.',
          code: 'METHOD_NOT_ALLOWED',
          version: VERSION,
        },
        405,
      );
    }

    const tables = createFunctionTables(req);

    let payload;
    if (path === '/webhook/revenuecat' || path === '/revenuecat') {
      payload = await handleRevenueCatWebhook(req, tables, log);
    } else if (path === '/status') {
      payload = await handleStatus(req, tables);
    } else if (path === '/access/check') {
      payload = await handleAccessCheck(req, tables);
    } else if (path === '/reconcile') {
      payload = await handleReconcile(req, tables);
    } else {
      throw new HttpError(404, 'Subscription endpoint not found.', 'NOT_FOUND');
    }

    log?.(
      `${SERVICE} ${method} ${path} completed in ${Date.now() - startedAt}ms.`,
    );
    return res.json(payload);
  } catch (caughtError) {
    const response = errorPayload(caughtError);
    error?.(
      `${SERVICE} request failed in ${Date.now() - startedAt}ms: ${caughtError?.name || 'Error'} ${caughtError?.message || String(caughtError)}`,
    );
    return res.json(response.body, response.status);
  }
};

export {
  accessSummary,
  eventStatus,
  planFromEntitlements,
  planFromProduct,
  policyCheck,
  recordFromRevenueCatEvent,
  recordFromRevenueCatSubscriber,
  rowAllowsAccess,
};
