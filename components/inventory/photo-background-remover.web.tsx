import { StyleSheet, View } from "react-native";

import { KeepFlipText as Text } from "@/components/ui/keepflip-text";
import { keepFlipTheme as theme } from "@/constants/keepflip-theme";
import { useResponsiveLayout, useResponsiveStyles } from '@/hooks/use-responsive-layout';

type Props = {
  itemId: string;
  ownerId: string;
  photoCount: number;
  onSaved: () => Promise<void>;
};

export function PhotoBackgroundRemover(_props: Props) {
  const responsiveStyles = useResponsiveStyles(createStylesWebResponsive);
  return (
    <View style={responsiveStyles.panel}>
      <Text style={responsiveStyles.eyebrow}>PHOTO BACKGROUND</Text>
      <Text style={responsiveStyles.description}>
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

function createStylesWebResponsive(layout: ReturnType<typeof useResponsiveLayout>) {
  return StyleSheet.create({
    ...styles,
    panel: {
      ...styles["panel"],
      gap: layout.isWeb ? layout.webResponsiveWidth(8) : 8,
      marginTop: layout.isWeb ? layout.webResponsiveHeight(16) : 16,
      paddingTop: layout.isWeb ? layout.webResponsiveHeight(16) : 16,
    },
    eyebrow: {
      ...styles["eyebrow"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(10) : 10,
    },
    description: {
      ...styles["description"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(12) : 12,
      lineHeight: layout.isWeb ? layout.webResponsiveFont(18) : 18,
    },
  });
}
