import {
  createContext,
  type PropsWithChildren,
  use,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

export const MENU_CLOSE_DURATION_MS = 260;

type KeepFlipMenuContextValue = {
  closeMenu: () => void;
  isMenuOpen: boolean;
  isMenuPresented: boolean;
  openMenu: () => void;
  toggleMenu: () => void;
};

const noOp = () => undefined;
const fallbackMenuContext: KeepFlipMenuContextValue = {
  closeMenu: noOp,
  isMenuOpen: false,
  isMenuPresented: false,
  openMenu: noOp,
  toggleMenu: noOp,
};

const KeepFlipMenuContext = createContext<KeepFlipMenuContextValue>(fallbackMenuContext);

export function KeepFlipMenuProvider({ children }: PropsWithChildren) {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [isMenuPresented, setIsMenuPresented] = useState(false);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearCloseTimer = useCallback(() => {
    if (closeTimer.current) {
      clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
  }, []);

  const openMenu = useCallback(() => {
    clearCloseTimer();
    setIsMenuPresented(true);
    setIsMenuOpen(true);
  }, [clearCloseTimer]);

  const closeMenu = useCallback(() => {
    clearCloseTimer();
    setIsMenuOpen(false);
    closeTimer.current = setTimeout(() => {
      setIsMenuPresented(false);
      closeTimer.current = null;
    }, MENU_CLOSE_DURATION_MS);
  }, [clearCloseTimer]);

  const toggleMenu = useCallback(() => {
    if (isMenuOpen) closeMenu();
    else openMenu();
  }, [closeMenu, isMenuOpen, openMenu]);

  useEffect(() => clearCloseTimer, [clearCloseTimer]);

  const value = useMemo(
    () => ({ closeMenu, isMenuOpen, isMenuPresented, openMenu, toggleMenu }),
    [closeMenu, isMenuOpen, isMenuPresented, openMenu, toggleMenu],
  );

  return <KeepFlipMenuContext value={value}>{children}</KeepFlipMenuContext>;
}

export function useKeepFlipMenu() {
  return use(KeepFlipMenuContext);
}
