import { useCallback, useState } from 'react';
import { useFocusEffect, useRouter, type Href } from 'expo-router';

import { ConnectionsScreen } from '@/components/crosslisting-lab/connections-screen';
import type {
  MarketplaceConnectionStatus,
  MarketplaceId,
} from '@/components/crosslisting-lab/types';
import { listConnections } from '@/services/crosslisting-lab-api';

export default function CrosslistingConnectionsRoute() {
  const router = useRouter();
  const [statuses, setStatuses] = useState<
    Partial<Record<MarketplaceId, MarketplaceConnectionStatus>>
  >({});
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setLoadError(null);
    try {
      setStatuses(await listConnections());
    } catch (error) {
      setLoadError(
        error instanceof Error
          ? error.message
          : 'Could not load marketplace connections.',
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { void load(); }, [load]));

  return (
    <ConnectionsScreen
      connectionStatuses={statuses}
      isLoading={isLoading}
      loadError={loadError}
      onOpenConnection={(platform) => router.push(
        `/crosslisting/connect/${platform}` as Href,
      )}
      onRetry={() => { void load(); }}
    />
  );
}
