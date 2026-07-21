import {
  forwardRef,
  type ComponentRef,
} from "react";
import {
  StyleSheet,
  Text as NativeText,
  type TextProps,
  type TextStyle,
} from "react-native";

import { keepFlipTheme as theme } from "@/constants/keepflip-theme";

function numericWeight(weight: TextStyle["fontWeight"]) {
  if (typeof weight === "number") return weight;

  if (weight === "bold") return 700;
  if (weight === "normal" || weight == null) return 400;

  const parsed = Number(weight);
  return Number.isFinite(parsed) ? parsed : 400;
}

function fontForWeight(weight: TextStyle["fontWeight"]) {
  const value = numericWeight(weight);

  if (value >= 700) return theme.fonts.bold;
  if (value >= 600) return theme.fonts.semibold;
  if (value >= 500) return theme.fonts.medium;
  return theme.fonts.body;
}

/**
 * Default KeepFlip application text.
 *
 * Analysis components intentionally continue rendering with
 * theme.fonts.analysis and are excluded from the migration.
 */
export const KeepFlipText = forwardRef<
  ComponentRef<typeof NativeText>,
  TextProps
>(function KeepFlipText({ style, ...props }, ref) {
  const flattened = StyleSheet.flatten(style);

  if (flattened?.fontFamily) {
    return <NativeText {...props} ref={ref} style={style} />;
  }

  const fontFamily = fontForWeight(flattened?.fontWeight);

  return (
    <NativeText
      {...props}
      ref={ref}
      style={[
        style,
        {
          fontFamily,
          fontWeight: "normal",
        },
      ]}
    />
  );
});
