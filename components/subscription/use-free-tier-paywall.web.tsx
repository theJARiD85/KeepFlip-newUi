import { useCallback } from 'react';
import { type Href } from 'expo-router';

export function useFreeTierPaywall() {
  return useCallback(async (_destination: Href) => undefined, []);
}
