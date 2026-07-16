import { Text, View } from 'react-native';

import { KeepFlipBackground } from '@/components/ui/keepflip-background';
import { keepFlipTheme as theme } from '@/constants/keepflip-theme';

export default function InventoryScreen() {
  return (
    <KeepFlipBackground
      contentStyle={{ justifyContent: 'center', alignItems: 'center', gap: 8, padding: 24 }}>
      <View style={{ alignItems: 'center', gap: 8 }}>
        <Text style={{ color: theme.colors.gold, fontSize: 12, fontWeight: '900', letterSpacing: 2 }}>
          YOUR ITEMS
        </Text>
        <Text style={{ color: theme.colors.text, fontSize: 28, fontWeight: '800' }}>Inventory</Text>
        <Text style={{ color: theme.colors.textMuted, textAlign: 'center' }}>
          Scanned items and resale estimates will live here.
        </Text>
      </View>
    </KeepFlipBackground>
  );
}
