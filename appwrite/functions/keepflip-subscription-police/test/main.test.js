import assert from 'node:assert/strict';
import test from 'node:test';

import {
  accessSummary,
  eventStatus,
  planFromEntitlements,
  planFromProduct,
  policyCheck,
  recordFromRevenueCatEvent,
  recordFromRevenueCatSubscriber,
  rowAllowsAccess,
} from '../src/main.js';

test('resolves the strongest KeepFlip entitlement', () => {
  assert.equal(
    planFromEntitlements([
      'keepflip_hobbyist',
      'keepflip_power',
      'something_else',
    ]),
    'power',
  );
  assert.equal(planFromProduct('keepflip_serious:monthly'), 'serious');
});

test('trial purchase becomes active trialing access', () => {
  const now = Date.now();
  const event = {
    id: 'evt-trial',
    type: 'INITIAL_PURCHASE',
    app_user_id: 'user123',
    entitlement_ids: ['keepflip_hobbyist'],
    product_id: 'keepflip_hobbyist',
    period_type: 'TRIAL',
    purchased_at_ms: now,
    expiration_at_ms: now + 7 * 24 * 60 * 60 * 1000,
    event_timestamp_ms: now,
    environment: 'PRODUCTION',
    store: 'PLAY_STORE',
  };

  const row = recordFromRevenueCatEvent(event, 'user123', null);
  assert.equal(row.plan, 'hobbyist');
  assert.equal(row.entitlement, 'keepflip_hobbyist');
  assert.equal(row.status, 'trialing');
  assert.equal(row.isTrial, true);
  assert.equal(row.willRenew, true);
  assert.equal(rowAllowsAccess(row, now + 1000), true);
});

test('cancellation preserves access until the paid period ends', () => {
  const now = Date.now();
  const event = {
    id: 'evt-cancel',
    type: 'CANCELLATION',
    app_user_id: 'user123',
    entitlement_ids: ['keepflip_serious'],
    product_id: 'keepflip_serious',
    period_type: 'NORMAL',
    expiration_at_ms: now + 5 * 24 * 60 * 60 * 1000,
    event_timestamp_ms: now,
    environment: 'PRODUCTION',
    store: 'PLAY_STORE',
  };

  const row = recordFromRevenueCatEvent(event, 'user123', null);
  assert.equal(eventStatus(event), 'cancelled');
  assert.equal(row.willRenew, false);
  assert.equal(rowAllowsAccess(row, now + 1000), true);
  assert.equal(
    rowAllowsAccess(row, now + 6 * 24 * 60 * 60 * 1000),
    false,
  );
});

test('expiration and refund remove access', () => {
  const now = Date.now();
  const expired = recordFromRevenueCatEvent(
    {
      id: 'evt-expire',
      type: 'EXPIRATION',
      app_user_id: 'user123',
      entitlement_ids: ['keepflip_power'],
      product_id: 'keepflip_power',
      period_type: 'NORMAL',
      expiration_at_ms: now - 1000,
      event_timestamp_ms: now,
      environment: 'PRODUCTION',
      store: 'PLAY_STORE',
    },
    'user123',
    null,
  );

  assert.equal(expired.status, 'expired');
  assert.equal(rowAllowsAccess(expired), false);

  const refunded = recordFromRevenueCatEvent(
    {
      id: 'evt-refund',
      type: 'REFUND',
      app_user_id: 'user123',
      entitlement_ids: ['keepflip_power'],
      product_id: 'keepflip_power',
      period_type: 'NORMAL',
      expiration_at_ms: now + 100000,
      event_timestamp_ms: now,
      environment: 'PRODUCTION',
      store: 'PLAY_STORE',
    },
    'user123',
    null,
  );

  assert.equal(refunded.status, 'revoked');
  assert.equal(rowAllowsAccess(refunded), false);
});

test('billing grace period stays accessible only through grace end', () => {
  const now = Date.now();
  const graceEnd = now + 2 * 24 * 60 * 60 * 1000;
  const row = recordFromRevenueCatEvent(
    {
      id: 'evt-billing',
      type: 'BILLING_ISSUE',
      app_user_id: 'user123',
      entitlement_ids: ['keepflip_serious'],
      product_id: 'keepflip_serious',
      period_type: 'NORMAL',
      expiration_at_ms: now - 1000,
      grace_period_expiration_at_ms: graceEnd,
      event_timestamp_ms: now,
      environment: 'PRODUCTION',
      store: 'PLAY_STORE',
    },
    'user123',
    null,
  );

  assert.equal(row.status, 'grace_period');
  assert.equal(rowAllowsAccess(row, now + 1000), true);
  assert.equal(rowAllowsAccess(row, graceEnd + 1000), false);
});

test('RevenueCat subscriber reconciliation recognizes active serious plan', () => {
  const future = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  const past = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const subscriber = {
    original_app_user_id: 'user123',
    entitlements: {
      keepflip_hobbyist: {
        product_identifier: 'keepflip_hobbyist',
        expires_date: past,
        purchase_date: past,
      },
      keepflip_serious: {
        product_identifier: 'keepflip_serious',
        expires_date: future,
        purchase_date: new Date().toISOString(),
      },
    },
    subscriptions: {
      keepflip_hobbyist: {
        expires_date: past,
        period_type: 'normal',
        store: 'play_store',
        is_sandbox: false,
      },
      keepflip_serious: {
        expires_date: future,
        period_type: 'normal',
        store: 'play_store',
        is_sandbox: false,
        purchase_date: new Date().toISOString(),
        original_purchase_date: new Date().toISOString(),
        unsubscribe_detected_at: null,
        billing_issues_detected_at: null,
        refunded_at: null,
      },
    },
  };

  const row = recordFromRevenueCatSubscriber(
    'user123',
    subscriber,
    null,
    'evt-reconcile',
  );

  assert.equal(row.plan, 'serious');
  assert.equal(row.status, 'active');
  assert.equal(row.willRenew, true);
  assert.equal(row.store, 'PLAY_STORE');
  assert.equal(rowAllowsAccess(row), true);
});

test('policy checks tier capabilities and usage limits', () => {
  const access = accessSummary({
    $id: 'user123',
    ownerId: 'user123',
    provider: 'revenuecat',
    revenueCatCustomerId: 'user123',
    plan: 'hobbyist',
    entitlement: 'keepflip_hobbyist',
    status: 'active',
    isTrial: false,
    startedAt: new Date().toISOString(),
    trialEndsAt: null,
    currentPeriodEndsAt: new Date(
      Date.now() + 30 * 24 * 60 * 60 * 1000,
    ).toISOString(),
    willRenew: true,
    productId: 'keepflip_hobbyist',
    store: 'PLAY_STORE',
    lastEventId: 'evt',
    updatedAt: new Date().toISOString(),
    isSandbox: false,
  });

  assert.equal(
    policyCheck(access, { capability: 'basic_books' }).allowed,
    true,
  );
  assert.equal(
    policyCheck(access, { capability: 'automated_books' }).allowed,
    false,
  );
  assert.equal(
    policyCheck(access, { capability: 'ai_valuation', usage: 99 }).allowed,
    true,
  );
  assert.equal(
    policyCheck(access, { capability: 'ai_valuation', usage: 100 }).allowed,
    false,
  );
});
