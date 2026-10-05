import { useLocalSearchParams } from 'expo-router';

import { ListItemScreen } from '@/components/crosslisting-lab/list-item-screen';

export default function CrosslistingProductRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <ListItemScreen productId={id ?? ''} />;
}
