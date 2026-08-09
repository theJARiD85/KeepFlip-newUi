import {
  forwardRef,
  type ComponentRef,
} from "react";
import {
  Text as NativeText,
  TextInput as NativeTextInput,
  StyleSheet,
  type TextInputProps,
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

function familyForWeight(weight: TextStyle["fontWeight"]) {
  const value = numericWeight(weight);

  if (value >= 700) return theme.fonts.bold;
  if (value >= 600) return theme.fonts.semibold;
  if (value >= 500) return theme.fonts.medium;
  return theme.fonts.body;
}

function resolvedTypography(style: TextProps["style"]) {
  const flattened = StyleSheet.flatten(style);

  if (flattened?.fontFamily) {
    return null;
  }

  return {
    fontFamily: familyForWeight(flattened?.fontWeight),
    fontWeight: "normal" as const,
  };
}

/**
 * Default KeepFlip application text.
 * Item-analysis components are intentionally excluded from the migration
 * and continue using theme.fonts.radar.
 */
export const KeepFlipText = forwardRef<
  ComponentRef<typeof NativeText>,
  TextProps
>(function KeepFlipText({ style, ...props }, ref) {
  const typography = resolvedTypography(style);

  return (
    <NativeText
      {...props}
      ref={ref}
      style={typography ? [style, typography] : style}
    />
  );
});

export const KeepFlipTextInput = forwardRef<
  ComponentRef<typeof NativeTextInput>,
  TextInputProps
>(function KeepFlipTextInput({ style, ...props }, ref) {
  const typography = resolvedTypography(style);

  return (
    <NativeTextInput
      {...props}
      ref={ref}
      style={typography ? [style, typography] : style}
    />
  );
});
