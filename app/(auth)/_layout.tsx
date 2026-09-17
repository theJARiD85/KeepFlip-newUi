import { Stack } from "expo-router";

import { useKeepFlipAppearance } from "@/components/settings/keepflip-appearance-context";
import { getKeepFlipThemeColors } from "@/constants/keepflip-theme";

export const unstable_settings = {
  anchor: "sign-in",
};

export default function AuthLayout() {
  const { effectiveColorScheme } = useKeepFlipAppearance();
  const appearanceColors = getKeepFlipThemeColors(effectiveColorScheme);

  return (
    <Stack
      screenOptions={{
        animation: "fade",
        contentStyle: { backgroundColor: appearanceColors.backgroundDeep },
        headerShown: false,
      }}
    >
      <Stack.Screen name="sign-in" />
    </Stack>
  );
}
