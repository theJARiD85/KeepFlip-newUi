import {
  createContext,
  use,
  useCallback,
  useMemo,
  useState,
  type PropsWithChildren,
} from 'react';

import type { ResellerBuyRules } from '@/services/reseller-buy-rules-service';

export type KeepFlipOnboardingDraft = {
  name: string;
  rules: ResellerBuyRules;
};

type KeepFlipOnboardingDraftContextValue = {
  clearDraft: () => void;
  draft: KeepFlipOnboardingDraft | null;
  setSellerProfile: (name: string, rules: ResellerBuyRules) => void;
};

const KeepFlipOnboardingDraftContext =
  createContext<KeepFlipOnboardingDraftContextValue | null>(null);

export function KeepFlipOnboardingDraftProvider({
  children,
}: PropsWithChildren) {
  const [draft, setDraft] = useState<KeepFlipOnboardingDraft | null>(null);

  const setSellerProfile = useCallback(
    (name: string, rules: ResellerBuyRules) => {
      setDraft({ name, rules });
    },
    [],
  );

  const clearDraft = useCallback(() => {
    setDraft(null);
  }, []);

  const value = useMemo<KeepFlipOnboardingDraftContextValue>(
    () => ({
      clearDraft,
      draft,
      setSellerProfile,
    }),
    [clearDraft, draft, setSellerProfile],
  );

  return (
    <KeepFlipOnboardingDraftContext value={value}>
      {children}
    </KeepFlipOnboardingDraftContext>
  );
}

export function useKeepFlipOnboardingDraft() {
  const context = use(KeepFlipOnboardingDraftContext);
  if (!context) {
    throw new Error(
      'useKeepFlipOnboardingDraft must be used inside KeepFlipOnboardingDraftProvider',
    );
  }

  return context;
}
