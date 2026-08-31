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

import { useKeepFlipAuth } from '@/components/auth/keepflip-auth-context';
import {
  getEbayConnectionStatus,
  type EbayConnectionRevocationResult,
  type EbayConnectionStatusResult,
} from '@/services/ebayConnectionService';

type EbayConnectionContextValue = {
  connected: boolean;
  connection: EbayConnectionStatusResult | null;
  errorMessage: string | null;
  isChecking: boolean;
  refreshConnection: () => Promise<EbayConnectionStatusResult | null>;
  setConnected: (connection: EbayConnectionStatusResult) => void;
  setDisconnected: (connection: EbayConnectionRevocationResult) => void;
};

const EbayConnectionContext = createContext<EbayConnectionContextValue | null>(null);

/**
 * Keeps navigation in sync with the server-verified eBay connection state.
 * Tokens never enter this context; the app only receives a safe status summary.
 */
export function EbayConnectionProvider({ children }: PropsWithChildren) {
  const { user } = useKeepFlipAuth();
  const [connection, setConnection] =
    useState<EbayConnectionStatusResult | null>(null);
  const [connected, setConnected] = useState(false);
  const [isChecking, setIsChecking] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const mountedRef = useRef(true);
  const requestSequenceRef = useRef(0);
  const userId = user?.$id;

  const applyConnection = useCallback(
    (nextConnection: EbayConnectionStatusResult | null) => {
      if (!mountedRef.current) return;

      setConnection(nextConnection);
      setConnected(nextConnection?.connected === true);
      setErrorMessage(null);
      setIsChecking(false);
    },
    [],
  );

  const refreshConnection = useCallback(async () => {
    const requestedUserId = userId;
    const requestSequence = ++requestSequenceRef.current;

    if (!requestedUserId) {
      applyConnection(null);
      return null;
    }

    if (mountedRef.current) {
      setIsChecking(true);
      setErrorMessage(null);
    }

    try {
      const nextConnection = await getEbayConnectionStatus();
      const stillCurrent =
        mountedRef.current &&
        requestSequence === requestSequenceRef.current &&
        requestedUserId === userId;

      if (stillCurrent) applyConnection(nextConnection);
      return nextConnection;
    } catch (error) {
      const stillCurrent =
        mountedRef.current &&
        requestSequence === requestSequenceRef.current &&
        requestedUserId === userId;

      if (stillCurrent) {
        setConnection(null);
        setConnected(false);
        setErrorMessage(
          error instanceof Error
            ? error.message
            : 'KeepFlip could not check your eBay connection.',
        );
        setIsChecking(false);
      }

      return null;
    } finally {
      const stillCurrent =
        mountedRef.current &&
        requestSequence === requestSequenceRef.current &&
        requestedUserId === userId;

      if (stillCurrent) setIsChecking(false);
    }
  }, [applyConnection, userId]);

  const markConnected = useCallback(
    (nextConnection: EbayConnectionStatusResult) => {
      requestSequenceRef.current += 1;
      applyConnection(nextConnection);
    },
    [applyConnection],
  );

  const markDisconnected = useCallback(
    (nextConnection: EbayConnectionRevocationResult) => {
      requestSequenceRef.current += 1;
      applyConnection({
        ...nextConnection,
        connected: false,
      });
    },
    [applyConnection],
  );

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    requestSequenceRef.current += 1;

    if (!userId) {
      applyConnection(null);
      return;
    }

    void refreshConnection();
  }, [applyConnection, refreshConnection, userId]);

  const value = useMemo<EbayConnectionContextValue>(
    () => ({
      connected,
      connection,
      errorMessage,
      isChecking,
      refreshConnection,
      setConnected: markConnected,
      setDisconnected: markDisconnected,
    }),
    [
      connected,
      connection,
      errorMessage,
      isChecking,
      markConnected,
      markDisconnected,
      refreshConnection,
    ],
  );

  return <EbayConnectionContext value={value}>{children}</EbayConnectionContext>;
}

export function useEbayConnection() {
  const context = use(EbayConnectionContext);
  if (!context) {
    throw new Error(
      'useEbayConnection must be used inside EbayConnectionProvider',
    );
  }

  return context;
}
