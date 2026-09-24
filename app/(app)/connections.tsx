import { Stack } from 'expo-router';

import { ConnectionsScreen } from '@/components/connections/connections-screen';

export default function ConnectionsRoute() {
  return (
    <>
      <Stack.Screen options={{ title: 'Connections' }} />
      <ConnectionsScreen />
    </>
  );
}
