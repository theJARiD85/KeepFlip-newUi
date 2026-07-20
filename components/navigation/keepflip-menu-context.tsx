import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useMemo,
  useState,
} from 'react';

export const MENU_CLOSE_DURATION_MS = 240;

type KeepFlipMenuContextValue = {
  isMenuOpen: boolean;
  isMenuPresented: boolean;
  openMenu: () => void;
  closeMenu: () => void;
  toggleMenu: () => void;
};

const KeepFlipMenuContext =
  createContext<KeepFlipMenuContextValue | null>(null);

export function KeepFlipMenuProvider({
  children,
}: PropsWithChildren) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const openMenu = useCallback(() => {
    setIsMenuOpen(true);
  }, []);

  const closeMenu = useCallback(() => {
    setIsMenuOpen(false);
  }, []);

  const toggleMenu = useCallback(() => {
    setIsMenuOpen((current) => !current);
  }, []);

  const value = useMemo<KeepFlipMenuContextValue>(
    () => ({
      isMenuOpen,
      isMenuPresented: isMenuOpen,
      openMenu,
      closeMenu,
      toggleMenu,
    }),
    [closeMenu, isMenuOpen, openMenu, toggleMenu],
  );

  return (
    <KeepFlipMenuContext.Provider value={value}>
      {children}
    </KeepFlipMenuContext.Provider>
  );
}

export function useKeepFlipMenu() {
  const context = useContext(KeepFlipMenuContext);

  if (context == null) {
    throw new Error(
      'useKeepFlipMenu must be used inside KeepFlipMenuProvider.',
    );
  }

  return context;
}
