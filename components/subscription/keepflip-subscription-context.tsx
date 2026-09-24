import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { AppState } from 'react-native';
import type { RealtimeSubscription } from 'react-native-appwrite';

import { useKeepFlipAuth } from '@/components/auth/keepflip-auth-context';
import {
  keepFlipPlanAllows,
  keepFlipPlanLimit,
  loadKeepFlipSubscription,
  openKeepFlipSubscriptionManagement,
  purchaseKeepFlipPlan,
  restoreKeepFlipPurchases,
  renewKeepFlipPlan,
  subscribeToKeepFlipEntitlementUpdates,
  subscribeToKeepFlipSubscriptionUpdates,
  type KeepFlipBillingCadence,
  type KeepFlipPlanId,
  type KeepFlipSubscriptionFeature,
  type KeepFlipSubscriptionSnapshot,
} from '@/services/keepflip-subscription-service';

type SubscriptionLoadState =
  | 'loading'
  | 'ready'
  | 'unconfigured'
  | 'error';

type KeepFlipSubscriptionContextValue = {
  snapshot: KeepFlipSubscriptionSnapshot | null;
  state: SubscriptionLoadState;
  errorMessage: string | null;
  purchasing: boolean;
  restoring: boolean;
  refresh: (
    reconcileServerStatus?: boolean,
  ) => Promise<KeepFlipSubscriptionSnapshot | null>;
  purchase: (
    plan: KeepFlipPlanId,
    cadence: KeepFlipBillingCadence,
  ) => Promise<boolean>;
  renew: () => Promise<boolean>;
  restore: () => Promise<boolean>;
  manage: () => Promise<void>;
  canUse: (feature: KeepFlipSubscriptionFeature) => boolean;
  limitFor: (
    limit:
      | 'concurrentActiveListings'
      | 'monthlyPublishQuota'
      | 'activeListingsPerMonth'
      | 'aiValuationScansPerMonth',
  ) => number | null;
};

function preserveKnownTrialHistory(
  access: KeepFlipSubscriptionSnapshot['access'],
  current: KeepFlipSubscriptionSnapshot | null,
) {
  const profileTrialEndsAt = current?.profileTrial?.trialEndDate;
  const profileTrialStillActive =
    current?.access.active === true &&
    current.access.trialSource === 'profile' &&
    typeof profileTrialEndsAt === 'string' &&
    Number.isFinite(Date.parse(profileTrialEndsAt)) &&
    Date.parse(profileTrialEndsAt) > Date.now();

  // RevenueCat knows store entitlements, not KeepFlip's first-party trial.
  // Do not let an inactive store update erase valid server-verified access.
  if (!access.active && profileTrialStillActive && current) {
    return {
      ...current.access,
      trialUsed: true,
    };
  }

  return {
    ...access,
    trialUsed:
      access.trialUsed ||
      current?.access.trialUsed === true ||
      current?.profileTrial?.trialUsed === true ||
      current?.serverRecord?.isTrial === true ||
      Boolean(current?.serverRecord?.trialEndsAt),
  };
}

const KeepFlipSubscriptionContext =
  createContext<KeepFlipSubscriptionContextValue | null>(null);

function errorMessage(error: unknown, fallback: string) {
  if (!error || typeof error !== 'object') return fallback;

  const candidate = error as {
    message?: unknown;
    underlyingErrorMessage?: unknown;
    readableErrorCode?: unknown;
    code?: unknown;
    userInfo?: {
      underlyingErrorMessage?: unknown;
      readableErrorCode?: unknown;
      readable_error_code?: unknown;
      message?: unknown;
    };
  };

  const underlying =
    typeof candidate.underlyingErrorMessage === 'string'
      ? candidate.underlyingErrorMessage.trim()
      : typeof candidate.userInfo?.underlyingErrorMessage === 'string'
        ? candidate.userInfo.underlyingErrorMessage.trim()
        : '';

  const message =
    typeof candidate.message === 'string' ? candidate.message.trim() : '';

  const readableCode =
    typeof candidate.readableErrorCode === 'string'
      ? candidate.readableErrorCode.trim()
      : typeof candidate.userInfo?.readableErrorCode === 'string'
        ? candidate.userInfo.readableErrorCode.trim()
        : typeof candidate.userInfo?.readable_error_code === 'string'
          ? candidate.userInfo.readable_error_code.trim()
          : '';

  const code =
    typeof candidate.code === 'string' || typeof candidate.code === 'number'
      ? String(candidate.code)
      : '';

  if (underlying) {
    const prefix = readableCode || code;
    return prefix ? `${underlying} (${prefix})` : underlying;
  }

  if (message) {
    const prefix = readableCode || code;
    return prefix ? `${message} (${prefix})` : message;
  }

  return fallback;
}

function isUserCancelledPurchase(error: unknown) {
  return Boolean(
    error &&
      typeof error === 'object' &&
      'userCancelled' in error &&
      (error as { userCancelled?: unknown }).userCancelled === true,
  );
}

const SERVER_ACCESS_CONFIRMATION_DELAYS_MS = [
  0,
  750,
  1_500,
  2_500,
  4_000,
  6_000,
] as const;

function isServerVerifiedActiveSubscription(
  snapshot: KeepFlipSubscriptionSnapshot | null,
  userId: string,
) {
  return (
    snapshot?.serverRecordAvailable === true &&
    snapshot.serverRecord?.ownerId === userId &&
    snapshot.access.active === true
  );
}

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

export function KeepFlipSubscriptionProvider({
  children,
}: PropsWithChildren) {
  const { user } = useKeepFlipAuth();
  const userId = user?.$id ?? '';
  const [snapshot, setSnapshot] =
    useState<KeepFlipSubscriptionSnapshot | null>(null);
  const [state, setState] = useState<SubscriptionLoadState>('loading');
  const [error, setError] = useState<string | null>(null);
  const [purchasing, setPurchasing] = useState(false);
  const [restoring, setRestoring] = useState(false);

  const refresh = useCallback(async (reconcileServerStatus = true) => {
    if (!userId) {
      setSnapshot(null);
      setState('loading');
      setError(null);
      return null;
    }

    setError(null);
    try {
      const next = await loadKeepFlipSubscription(
        userId,
        { reconcileServerStatus },
      );
      setSnapshot(next);
      // A KeepFlip profile trial is valid access even when this development
      // build has not been configured with a RevenueCat public SDK key yet.
      setState(
        next.configured || next.access.active || next.serverRecordAvailable
          ? 'ready'
          : 'unconfigured',
      );
      return next;
    } catch (caughtError) {
      setState('error');
      setError(
        errorMessage(
          caughtError,
          'KeepFlip could not load your subscription right now.',
        ),
      );
      return null;
    }
  }, [userId]);

  const waitForServerVerifiedAccess = useCallback(
    async (localAccessActive: boolean) => {
      if (!localAccessActive) {
        const next = await refresh(true);
        return isServerVerifiedActiveSubscription(next, userId);
      }

      for (const delay of SERVER_ACCESS_CONFIRMATION_DELAYS_MS) {
        if (delay) await wait(delay);
        const next = await refresh(true);
        if (isServerVerifiedActiveSubscription(next, userId)) return true;
      }

      setError(
        'Google Play completed the payment, but KeepFlip is still waiting for server confirmation. Tap Refresh Plan Status in a moment; your purchase was not lost.',
      );
      return false;
    },
    [refresh, userId],
  );

  useEffect(() => {
    const timer = setTimeout(() => {
      setSnapshot(null);
      setState('loading');
      setError(null);
      void refresh(true);
    }, 0);

    return () => clearTimeout(timer);
  }, [refresh]);

  useEffect(() => {
    if (!userId) return;

    let cancelled = false;
    let removeListener: (() => void) | null = null;

    void subscribeToKeepFlipSubscriptionUpdates(userId, () => {
      if (cancelled) return;
      void refresh(true);
    })
      .then((remove) => {
        if (cancelled) {
          remove();
          return;
        }
        removeListener = remove;
      })
      .catch((caughtError) => {
        if (__DEV__) {
          console.warn(
            '[KeepFlip][Subscription] Could not attach RevenueCat updates:',
            caughtError,
          );
        }
      });

    return () => {
      cancelled = true;
      removeListener?.();
    };
  }, [refresh, userId]);

  useEffect(() => {
    if (!userId) return;

    let cancelled = false;
    let realtimeSubscription: RealtimeSubscription | null = null;

    void subscribeToKeepFlipEntitlementUpdates(userId, () => {
      if (cancelled) return;

      // Realtime is the wake-up signal, not the authorization source. Reload
      // the server-verified snapshot so profile trials, grace periods, and
      // terminal subscription states all use the same policy path.
      void refresh(false);
    })
      .then((nextSubscription) => {
        if (cancelled) {
          void nextSubscription?.unsubscribe();
          return;
        }
        realtimeSubscription = nextSubscription;
      })
      .catch((caughtError) => {
        if (__DEV__) {
          console.warn(
            '[KeepFlip][Subscription] Could not attach Appwrite entitlement updates:',
            caughtError,
          );
        }
      });

    return () => {
      cancelled = true;
      void realtimeSubscription?.unsubscribe();
    };
  }, [refresh, userId]);

  useEffect(() => {
    if (!userId) return;

    let previousState = AppState.currentState;
    const appStateSubscription = AppState.addEventListener(
      'change',
      (nextState) => {
        const resumed =
          nextState === 'active' && previousState !== 'active';
        previousState = nextState;
        if (resumed) void refresh(true);
      },
    );

    return () => appStateSubscription.remove();
  }, [refresh, userId]);

  const purchase = useCallback(
    async (
      plan: KeepFlipPlanId,
      cadence: KeepFlipBillingCadence,
    ) => {
      if (!userId || purchasing) return false;

      setPurchasing(true);
      setError(null);
      try {
        const access = await purchaseKeepFlipPlan(
          userId,
          plan,
          cadence,
        );
        setSnapshot((current) =>
          current
            ? {
                ...current,
                access: preserveKnownTrialHistory(access, current),
                configured: true,
              }
            : current,
        );
        return await waitForServerVerifiedAccess(access.active);
      } catch (caughtError) {
        if (isUserCancelledPurchase(caughtError)) return false;
        setError(
          errorMessage(
            caughtError,
            'KeepFlip could not complete that subscription purchase.',
          ),
        );
        return false;
      } finally {
        setPurchasing(false);
      }
    },
    [purchasing, userId, waitForServerVerifiedAccess],
  );

  const restore = useCallback(async () => {
    if (!userId || restoring) return false;

    setRestoring(true);
    setError(null);
    try {
      const access = await restoreKeepFlipPurchases(userId);
      setSnapshot((current) =>
        current
          ? {
              ...current,
              access: preserveKnownTrialHistory(access, current),
              configured: true,
            }
          : current,
      );
      return await waitForServerVerifiedAccess(access.active);
    } catch (caughtError) {
      setError(
        errorMessage(
          caughtError,
          'KeepFlip could not restore purchases for this account.',
        ),
      );
      return false;
    } finally {
      setRestoring(false);
    }
  }, [restoring, userId, waitForServerVerifiedAccess]);

  const renew = useCallback(async () => {
    if (!userId || purchasing || !snapshot?.access) return false;

    setPurchasing(true);
    setError(null);
    try {
      const access = await renewKeepFlipPlan(userId, snapshot.access);
      setSnapshot((current) =>
        current
          ? {
              ...current,
              access: preserveKnownTrialHistory(access, current),
              configured: true,
            }
          : current,
      );
      return await waitForServerVerifiedAccess(access.active);
    } catch (caughtError) {
      if (isUserCancelledPurchase(caughtError)) return false;
      setError(
        errorMessage(
          caughtError,
          'KeepFlip could not open the renewal purchase dialog.',
        ),
      );
      return false;
    } finally {
      setPurchasing(false);
    }
  }, [purchasing, snapshot, userId, waitForServerVerifiedAccess]);

  const manage = useCallback(async () => {
    if (!userId) return;

    setError(null);
    try {
      await openKeepFlipSubscriptionManagement(
        userId,
        snapshot?.access.managementUrl,
      );
    } catch (caughtError) {
      setError(
        errorMessage(
          caughtError,
          'KeepFlip could not open your subscription settings.',
        ),
      );
      throw caughtError;
    }
  }, [snapshot, userId]);

  const value = useMemo<KeepFlipSubscriptionContextValue>(
    () => {
      const profileTrialActive =
        snapshot?.access.active === true &&
        snapshot.access.trialSource === 'profile';
      let activePlan: KeepFlipPlanId | null = null;
      if (snapshot?.access.active === true && !profileTrialActive) {
        activePlan = snapshot.access.plan;
      }
      const serverAccessVerified = snapshot?.serverRecordAvailable === true;

      return {
        // UI availability is always derived from an authenticated Function
        // check of the durable subscription state. RevenueCat may update
        // purchase UI optimistically, but it cannot unlock app features.
        canUse: (feature) =>
          serverAccessVerified &&
          (profileTrialActive || keepFlipPlanAllows(activePlan, feature)),
        errorMessage: error,
        limitFor: (limit) =>
          !serverAccessVerified
            ? 0
            : profileTrialActive
              ? (limit === 'aiValuationScansPerMonth' ? 25 : null)
              : keepFlipPlanLimit(activePlan, limit),
        manage,
        purchase,
        purchasing,
        refresh,
        renew,
        restore,
        restoring,
        snapshot,
        state,
      };
    },
    [
      error,
      manage,
      purchase,
      purchasing,
      refresh,
      renew,
      restore,
      restoring,
      snapshot,
      state,
    ],
  );

  return (
    <KeepFlipSubscriptionContext.Provider value={value}>
      {children}
    </KeepFlipSubscriptionContext.Provider>
  );
}

export function useKeepFlipSubscription() {
  const value = useContext(KeepFlipSubscriptionContext);
  if (!value) {
    throw new Error(
      'useKeepFlipSubscription must be used inside KeepFlipSubscriptionProvider.',
    );
  }
  return value;
}
