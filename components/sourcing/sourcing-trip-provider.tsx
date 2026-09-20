import { type PropsWithChildren } from 'react';
import { Platform } from 'react-native';

/**
 * Keeps the location-tracking implementation out of the browser bundle.
 * expo-file-system's native File/Directory classes are not browser-safe at
 * module evaluation time, even though the web workspace never starts a trip.
 */
export function SourcingTripProvider({ children }: PropsWithChildren) {
  if (Platform.OS === 'web') return children;

  const { SourcingTripProvider: NativeSourcingTripProvider } = require(
    '@/components/sourcing/sourcing-trip-context',
  ) as typeof import('@/components/sourcing/sourcing-trip-context');

  return <NativeSourcingTripProvider>{children}</NativeSourcingTripProvider>;
}

