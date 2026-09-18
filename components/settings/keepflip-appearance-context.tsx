import {
  createContext,
  type PropsWithChildren,
  use,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useState,
} from 'react';
import { useColorScheme } from 'react-native';

import {
  setKeepFlipThemeColorScheme,
  type KeepFlipColorScheme,
} from '@/constants/keepflip-theme';
import {
  getKeepFlipAppearancePreference,
  saveKeepFlipAppearancePreference,
  type KeepFlipAppearancePreference,
} from '@/services/keepflip-appearance-service';

type KeepFlipAppearanceContextValue = {
  appliedColorScheme: KeepFlipColorScheme;
  effectiveColorScheme: KeepFlipColorScheme;
  errorMessage: string | null;
  isLoading: boolean;
  isSaving: boolean;
  preference: KeepFlipAppearancePreference;
  setPreference: (preference: KeepFlipAppearancePreference) => Promise<void>;
};

const KeepFlipAppearanceContext = createContext<KeepFlipAppearanceContextValue | null>(null);

export function KeepFlipAppearanceProvider({ children }: PropsWithChildren) {
  const systemColorScheme = useColorScheme() === 'light' ? 'light' : 'dark';
  const [preference, setPreferenceState] =
    useState<KeepFlipAppearancePreference>('system');
  const [appliedColorScheme, setAppliedColorScheme] =
    useState<KeepFlipColorScheme>(systemColorScheme);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void getKeepFlipAppearancePreference().then((savedPreference) => {
      if (cancelled) return;
      setPreferenceState(savedPreference);
      setIsLoading(false);
    });

    return () => {
      cancelled = true;
    };
  }, []);

  const effectiveColorScheme =
    preference === 'system' ? systemColorScheme : preference;

  useLayoutEffect(() => {
    setKeepFlipThemeColorScheme(effectiveColorScheme);
    // Invalidate style factories after the mutable theme singleton is updated.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setAppliedColorScheme(effectiveColorScheme);
  }, [effectiveColorScheme]);

  const setPreference = useCallback(
    async (nextPreference: KeepFlipAppearancePreference) => {
      const previousPreference = preference;
      setPreferenceState(nextPreference);
      setErrorMessage(null);
      setIsSaving(true);

      try {
        await saveKeepFlipAppearancePreference(nextPreference);
      } catch (error) {
        setPreferenceState(previousPreference);
        const message =
          error instanceof Error && error.message.trim()
            ? error.message.trim()
            : 'KeepFlip could not save the appearance setting.';
        setErrorMessage(message);
        throw error;
      } finally {
        setIsSaving(false);
      }
    },
    [preference],
  );

  const value = useMemo(
    () => ({
      appliedColorScheme,
      effectiveColorScheme,
      errorMessage,
      isLoading,
      isSaving,
      preference,
      setPreference,
    }),
    [
      appliedColorScheme,
      effectiveColorScheme,
      errorMessage,
      isLoading,
      isSaving,
      preference,
      setPreference,
    ],
  );

  return (
    <KeepFlipAppearanceContext.Provider value={value}>
      {children}
    </KeepFlipAppearanceContext.Provider>
  );
}

export function useKeepFlipAppearance() {
  const context = use(KeepFlipAppearanceContext);
  if (!context) {
    throw new Error(
      'useKeepFlipAppearance must be used inside KeepFlipAppearanceProvider',
    );
  }
  return context;
}
