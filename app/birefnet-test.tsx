import { StyleSheet, View } from "react-native";

import { KeepFlipText as Text } from "@/components/ui/keepflip-text";
import { keepFlipTheme as theme } from "@/constants/keepflip-theme";

export default function BiRefNetTestUnavailable() {
  return (
    <View style={styles.screen}>
      <Text style={styles.title}>BiRefNet Lite test</Text>
      <Text style={styles.body}>This on-device model test is available in the Android build.</Text>
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
