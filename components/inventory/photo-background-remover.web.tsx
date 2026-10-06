import { StyleSheet, View } from "react-native";

import { KeepFlipText as Text } from "@/components/ui/keepflip-text";
import { keepFlipTheme as theme } from "@/constants/keepflip-theme";

type Props = {
  itemId: string;
  ownerId: string;
  photoCount: number;
  onSaved: () => Promise<void>;
};

export function PhotoBackgroundRemover(_props: Props) {
  return (
    <View style={styles.panel}>
      <Text style={styles.eyebrow}>PHOTO BACKGROUND</Text>
      <Text style={styles.description}>
        Open this item in the KeepFlip mobile app to remove a photo background.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    borderColor: theme.colors.divider,
    borderTopWidth: 1,
    gap: 8,
    marginTop: 16,
    paddingTop: 16,
  },
  eyebrow: { color: theme.colors.scannerCyan, fontSize: 10, fontWeight: "800", letterSpacing: 1 },
  description: { color: theme.colors.textMuted, fontSize: 12, lineHeight: 18 },
});
