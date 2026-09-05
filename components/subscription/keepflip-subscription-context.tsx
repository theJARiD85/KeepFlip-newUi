import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';

import { useKeepFlipAuth } from '@/components/auth/keepflip-auth-context';
import {
  areKeepFlipSubscriptionsEnforced,
  keepFlipPlanAllows,
  keepFlipPlanLimit,
  loadKeepFlipSubscription,
  openKeepFlipSubscriptionManagement,
  purchaseKeepFlipPlan,
  restoreKeepFlipPurchases,
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
  refresh: () => Promise<void>;
  purchase: (
    plan: KeepFlipPlanId,
    cadence: KeepFlipBillingCadence,
  ) => Promise<boolean>;
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
  return {
    ...access,
    trialUsed:
      access.trialUsed ||
      current?.access.trialUsed === true ||
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

  const refresh = useCallback(async () => {
    if (!userId) {
      setSnapshot(null);
      setState('loading');
      setError(null);
      return;
    }

    setError(null);
    try {
      const next = await loadKeepFlipSubscription(userId);
      setSnapshot(next);
      setState(next.configured ? 'ready' : 'unconfigured');
    } catch (caughtError) {
      setState('error');
      setError(
        errorMessage(
          caughtError,
          'KeepFlip could not load your subscription right now.',
        ),
      );
    }
  }, [userId]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setSnapshot(null);
      setState('loading');
      setError(null);
      void refresh();
    }, 0);

    return () => clearTimeout(timer);
  }, [refresh]);

  useEffect(() => {
    if (!userId) return;

    let cancelled = false;
    let removeListener: (() => void) | null = null;

    void subscribeToKeepFlipSubscriptionUpdates(userId, (access) => {
      if (cancelled) return;
      setSnapshot((current) =>
        current
          ? {
              ...current,
              access: preserveKnownTrialHistory(access, current),
              configured: true,
            }
          : current,
      );
      setState('ready');
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
  }, [userId]);

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
        await refresh();
        return access.active;
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
    [purchasing, refresh, userId],
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
      await refresh();
      return access.active;
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
  }, [refresh, restoring, userId]);

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
      const activePlan = snapshot?.access.active
        ? snapshot.access.plan
        : null;
      const subscriptionsEnforced = areKeepFlipSubscriptionsEnforced();

      return {
        // Keep the pre-subscription app usable while enforcement is off. Once
        // enforcement is enabled, every paid feature must resolve from the
        // active RevenueCat plan (and later the migration/grace policy).
        canUse: (feature) =>
          !subscriptionsEnforced || keepFlipPlanAllows(activePlan, feature),
        errorMessage: error,
        limitFor: (limit) => keepFlipPlanLimit(activePlan, limit),
        manage,
        purchase,
        purchasing,
        refresh,
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
