import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PropsWithChildren,
} from 'react';

import { useKeepFlipAuth } from '@/components/auth/keepflip-auth-context';
import {
  deleteLedgerReceipt,
  uploadLedgerReceipt,
} from '@/services/reseller-ledger-service';
import {
  closeSourcingTrip,
  createSourcingTrip,
  getActiveSourcingTripSummary,
  getSourcingTripSummary,
  isSourcingTripsConfigured,
  linkSourcingTripFind,
  type CloseSourcingTripInput,
  type CreateSourcingTripInput,
  type SourcingTrip,
  type SourcingTripSummary,
} from '@/services/sourcing-trip-service';

type StartSourcingTripInput = Omit<CreateSourcingTripInput, 'ownerId'>;

type FinishSourcingTripInput = Omit<
  CloseSourcingTripInput,
  'ownerId' | 'sourceTripId' | 'receiptFileId'
> & {
  receiptReference?: string | null;
};

type RecordSourcingTripFindInput = {
  itemId: string;
  itemTitle?: string | null;
  allocatedCostCents: number;
  estimatedResaleCents?: number | null;
  quantity?: number;
  occurredAt: string;
};

type SourcingTripContextValue = {
  activeTrip: SourcingTripSummary | null;
  configured: boolean;
  finishActiveTrip: (input: FinishSourcingTripInput) => Promise<SourcingTrip>;
  isLoading: boolean;
  recordSavedItem: (
    input: RecordSourcingTripFindInput,
  ) => Promise<SourcingTripSummary | null>;
  refreshActiveTrip: () => Promise<SourcingTripSummary | null>;
  startTrip: (input: StartSourcingTripInput) => Promise<SourcingTripSummary>;
};

const SourcingTripContext = createContext<SourcingTripContextValue | null>(null);

function emptySummary(trip: SourcingTrip): SourcingTripSummary {
  return {
    trip,
    finds: [],
    findCount: 0,
    unitCount: 0,
    allocatedCostCents: 0,
    estimatedResaleCents: 0,
    estimatedFindCount: 0,
    estimatedGrossSpreadCents: null,
    receiptVarianceCents: null,
  };
}

export function SourcingTripProvider({ children }: PropsWithChildren) {
  const { user } = useKeepFlipAuth();
  const configured = isSourcingTripsConfigured();
  const userId = user?.$id ?? '';
  const requestVersionRef = useRef(0);
  const [activeTrip, setActiveTrip] = useState<SourcingTripSummary | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const refreshActiveTrip = useCallback(async () => {
    const requestVersion = ++requestVersionRef.current;
    if (!configured || !userId) {
      setActiveTrip(null);
      setIsLoading(false);
      return null;
    }

    setIsLoading(true);
    try {
      const summary = await getActiveSourcingTripSummary(userId);
      if (requestVersion === requestVersionRef.current) {
        setActiveTrip(summary);
      }
      return summary;
    } finally {
      if (requestVersion === requestVersionRef.current) {
        setIsLoading(false);
      }
    }
  }, [configured, userId]);

  useEffect(() => {
    void refreshActiveTrip().catch(() => undefined);
  }, [refreshActiveTrip]);

  const startTrip = useCallback(
    async (input: StartSourcingTripInput) => {
      if (!configured) {
        throw new Error(
          'Sourcing Trips is not configured in this build yet. Add its two Appwrite tables first.',
        );
      }
      if (!userId) throw new Error('Sign in before starting a sourcing trip.');

      const existing = activeTrip ?? (await getActiveSourcingTripSummary(userId));
      if (existing) {
        setActiveTrip(existing);
        throw new Error('Finish the active sourcing trip before starting another one.');
      }

      const trip = await createSourcingTrip({ ...input, ownerId: userId });
      const summary = emptySummary(trip);
      setActiveTrip(summary);
      return summary;
    },
    [activeTrip, configured, userId],
  );

  const recordSavedItem = useCallback(
    async (input: RecordSourcingTripFindInput) => {
      if (!configured || !userId || !activeTrip) return null;

      await linkSourcingTripFind({
        ...input,
        ownerId: userId,
        sourceTripId: activeTrip.trip.id,
      });
      const summary = await getSourcingTripSummary(userId, activeTrip.trip.id);
      setActiveTrip((current) =>
        current?.trip.id === summary.trip.id ? summary : current,
      );
      return summary;
    },
    [activeTrip, configured, userId],
  );

  const finishActiveTrip = useCallback(
    async ({ receiptReference, receiptTotalCents }: FinishSourcingTripInput) => {
      if (!configured) {
        throw new Error(
          'Sourcing Trips is not configured in this build yet. Add its two Appwrite tables first.',
        );
      }
      if (!userId) throw new Error('Sign in before closing a sourcing trip.');
      if (!activeTrip) throw new Error('There is no active sourcing trip to close.');

      let uploadedReceiptFileId: string | null = null;
      try {
        if (receiptReference?.trim()) {
          uploadedReceiptFileId = await uploadLedgerReceipt({
            imageUri: receiptReference,
            ownerId: userId,
          });
        }

        const trip = await closeSourcingTrip({
          ownerId: userId,
          sourceTripId: activeTrip.trip.id,
          receiptFileId: uploadedReceiptFileId ?? activeTrip.trip.receiptFileId,
          receiptTotalCents,
        });
        setActiveTrip(null);
        return trip;
      } catch (error) {
        if (uploadedReceiptFileId) {
          await deleteLedgerReceipt(uploadedReceiptFileId);
        }
        throw error;
      }
    },
    [activeTrip, configured, userId],
  );

  const value = useMemo<SourcingTripContextValue>(
    () => ({
      activeTrip,
      configured,
      finishActiveTrip,
      isLoading,
      recordSavedItem,
      refreshActiveTrip,
      startTrip,
    }),
    [
      activeTrip,
      configured,
      finishActiveTrip,
      isLoading,
      recordSavedItem,
      refreshActiveTrip,
      startTrip,
    ],
  );

  return (
    <SourcingTripContext.Provider value={value}>
      {children}
    </SourcingTripContext.Provider>
  );
}

export function useSourcingTrip() {
  const value = useContext(SourcingTripContext);
  if (!value) {
    throw new Error('useSourcingTrip must be used inside SourcingTripProvider.');
  }
  return value;
}
