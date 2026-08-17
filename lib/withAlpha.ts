import { keepFlipTheme as theme } from "@/constants/keepflip-theme";

export function withAlpha(color: string | undefined, alpha: number) {
  const safeColor = color || theme.colors.gold;
  const hex = safeColor.replace("#", "").trim();

  if (/^[0-9a-f]{6,8}$/i.test(hex)) {
    const red = parseInt(hex.slice(0, 2), 16);
    const green = parseInt(hex.slice(2, 4), 16);
    const blue = parseInt(hex.slice(4, 6), 16);

    return `rgba(${red}, ${green}, ${blue}, ${alpha})`;
  }

  const rgbMatch = safeColor.match(
    /rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/
  );

  if (rgbMatch) {
    return `rgba(${rgbMatch[1]}, ${rgbMatch[2]}, ${rgbMatch[3]}, ${alpha})`;
  }

  return safeColor;
}
