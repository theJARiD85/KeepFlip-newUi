import { useLocalSearchParams } from 'expo-router';

import { ConnectionDetailScreen } from '@/components/crosslisting-lab/connection-detail-screen';

export default function CrosslistingMarketplaceRoute() {
  const { platform } = useLocalSearchParams<{ platform: string }>();
  return <ConnectionDetailScreen platform={platform ?? ''} />;
}
