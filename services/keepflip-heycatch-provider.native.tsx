import { HeyCatchProvider } from '@heycatch/sdk';
import type { ReactNode } from 'react';

export function KeepFlipHeyCatchProvider({ children }: { children: ReactNode }) {
  return <HeyCatchProvider>{children}</HeyCatchProvider>;
}
