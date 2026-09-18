import type { ReactNode } from 'react';

/**
 * The browser HeyCatch entry performs pageview and interaction autocapture
 * from analytics.init(). The native provider is supplied only by the
 * platform-specific implementation next to this file.
 */
export function KeepFlipHeyCatchProvider({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
