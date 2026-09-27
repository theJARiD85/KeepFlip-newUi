import { Redirect } from 'expo-router';

import { useKeepFlipAuth } from '@/components/auth/keepflip-auth-context';

/**
 * The browser should never strand a visitor on the native session-check
 * bootstrap route. Auth verification continues in the root provider while the
 * public welcome route remains available.
 */
export default function WebAuthCheckRedirect() {
  const { status } = useKeepFlipAuth();

  return <Redirect href={status === 'signed-in' ? '/' : '/welcome'} />;
}
