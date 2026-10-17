import { StyleSheet, View } from "react-native";

import { KeepFlipText as Text } from "@/components/ui/keepflip-text";
import { keepFlipTheme as theme } from "@/constants/keepflip-theme";
import { useResponsiveLayout, useResponsiveStyles } from '@/hooks/use-responsive-layout';

export default function BiRefNetTestUnavailable() {
  const responsiveStyles = useResponsiveStyles(createStylesWebResponsive);
  return (
    <View style={responsiveStyles.screen}>
      <Text style={responsiveStyles.title}>BiRefNet Lite test</Text>
      <Text style={responsiveStyles.body}>This on-device model test is available in the Android build.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    alignItems: "center",
    backgroundColor: theme.colors.backgroundDeep,
    flex: 1,
    gap: 12,
    justifyContent: "center",
    padding: 24,
  },
  title: { color: theme.colors.text, fontSize: 22, fontWeight: "800" },
  body: { color: theme.colors.textMuted, fontSize: 13, textAlign: "center" },
});

function createStylesWebResponsive(layout: ReturnType<typeof useResponsiveLayout>) {
  return StyleSheet.create({
    ...styles,
    screen: {
      ...styles["screen"],
      gap: layout.isWeb ? layout.webResponsiveWidth(12) : layout.responsiveWidth(12),
    },
    title: {
      ...styles["title"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(22) : layout.responsiveFont(22),
    },
    body: {
      ...styles["body"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(13) : layout.responsiveFont(13),
    },
  });
}
