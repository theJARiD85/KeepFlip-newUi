import { Stack } from 'expo-router/stack';
import { StyleSheet, View } from 'react-native';

import { KeepFlipMenuProvider } from '@/components/navigation/keepflip-menu-context';
import { KeepFlipSlideDownMenu } from '@/components/navigation/keepflip-slide-down-menu';
import { keepFlipTheme } from '@/constants/keepflip-theme';

export const unstable_settings = {
  anchor: 'index',
};

export default function AppShellLayout() {
  return (
    <KeepFlipMenuProvider>
      <View style={styles.root}>
        <Stack
          screenOptions={{
            animation: 'fade',
            contentStyle: { backgroundColor: keepFlipTheme.colors.backgroundDeep },
            headerShown: false,
          }}>
          <Stack.Screen name="index" />
          <Stack.Screen name="inventory" />
          <Stack.Screen name="account" />
          <Stack.Screen name="explore" />
        </Stack>
        <KeepFlipSlideDownMenu />
      </View>
    </KeepFlipMenuProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: keepFlipTheme.colors.backgroundDeep,
  },
});
