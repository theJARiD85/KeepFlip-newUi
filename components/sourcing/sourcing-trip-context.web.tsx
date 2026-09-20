import type { PropsWithChildren } from 'react';

/**
 * Sourcing-trip location tracking is deliberately Android/iOS-only for the
 * first web workspace. Keep the shared route graph safe to import in a
 * browser without constructing an expo-file-system File at module load time.
 */
export function SourcingTripProvider({ children }: PropsWithChildren) {
  return children;
}

export function useSourcingTrip() {
  return {
    activeTrip: null,
    configured: false,
    finishActiveTrip: async () => {
      throw new Error('Sourcing trips are available in the KeepFlip mobile app.');
    },
    isLoading: false,
    locationSnapshot: null,
    recordSavedItem: async () => null,
    refreshActiveTrip: async () => null,
    startTrip: async () => {
      throw new Error('Sourcing trips are available in the KeepFlip mobile app.');
    },
  };
}

