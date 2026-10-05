import { keepFlipTheme } from '@/constants/keepflip-theme';

export const brand = {
  colors: {
    background: keepFlipTheme.colors.backgroundDeep,
    card: keepFlipTheme.colors.surfaceOverlay,
    inset: keepFlipTheme.colors.surfaceInset,
    text: keepFlipTheme.colors.text,
    textMuted: keepFlipTheme.colors.textMuted,
    gold: keepFlipTheme.colors.gold,
    goldBright: keepFlipTheme.colors.goldBright,
    goldSurface: keepFlipTheme.colors.iconSurfaceGold,
    cyan: keepFlipTheme.colors.scannerCyan,
    cyanSurface: keepFlipTheme.colors.iconSurfaceCyan,
    border: keepFlipTheme.colors.divider,
    borderStrong: keepFlipTheme.colors.dividerStrong,
    danger: keepFlipTheme.colors.danger,
    dangerSurface: keepFlipTheme.colors.dangerSurface,
    success: keepFlipTheme.colors.success,
    successSurface: keepFlipTheme.colors.successSurface,
  },
  radii: {
    small: 12,
    medium: 20,
    pill: 999,
  },
} as const;
