import { type PropsWithChildren, useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { KeepFlipUpdateRequiredScreen } from '@/components/update/keepflip-update-required-screen';
import {
  getKeepFlipVersionGateState,
  openKeepFlipUpdatePage,
  type KeepFlipVersionGateState,
} from '@/services/keepflip-version-gate-service';

export function KeepFlipMinimumVersionGate({
  children,
}: PropsWithChildren) {
  const [gateState, setGateState] = useState<KeepFlipVersionGateState>(() =>
    getKeepFlipVersionGateState(),
  );

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (nextState) => {
      if (nextState !== 'active') return;
      setGateState(getKeepFlipVersionGateState());
    });

    return () => subscription.remove();
  }, []);

  if (!gateState.updateRequired) return children;

  return (
    <KeepFlipUpdateRequiredScreen
      currentVersion={gateState.currentVersion}
      minimumVersion={gateState.minimumVersion}
      onRetry={() => setGateState(getKeepFlipVersionGateState())}
      onUpdate={openKeepFlipUpdatePage}
    />
  );
}
