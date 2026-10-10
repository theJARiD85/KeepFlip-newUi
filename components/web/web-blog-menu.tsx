import { Ionicons } from '@react-native-vector-icons/ionicons';
import { Link, type Href } from 'expo-router';
import { createElement, useEffect, useId, useState, type CSSProperties } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import { FIRST_BLOG_POST } from '@/constants/keepflip-blog';
import { keepFlipTheme as theme, type KeepFlipThemeColors } from '@/constants/keepflip-theme';
import { useResponsiveLayout, useResponsiveStyles } from '@/hooks/use-responsive-layout';

export function WebBlogMenu({ colors, isPhone, width }: { colors: KeepFlipThemeColors; isPhone: boolean; width: number }) {
  const responsiveStyles = useResponsiveStyles(createStylesWebResponsive);
  const [isOpen, setIsOpen] = useState(false);
  const menuId = useId();

  useEffect(() => {
    if (!isOpen || Platform.OS !== 'web') return;

    const closeOnOutsidePress = (event: PointerEvent) => {
      if (!document.getElementById(menuId)?.contains(event.target as Node)) setIsOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setIsOpen(false);
    };

    document.addEventListener('pointerdown', closeOnOutsidePress);
    document.addEventListener('keydown', closeOnEscape);
    return () => {
      document.removeEventListener('pointerdown', closeOnOutsidePress);
      document.removeEventListener('keydown', closeOnEscape);
    };
  }, [isOpen, menuId]);

  return (
    <View nativeID={menuId} style={responsiveStyles.menu}>
      <Pressable
        accessibilityLabel="Blog articles"
        accessibilityRole="button"
        accessibilityState={{ expanded: isOpen }}
        aria-expanded={isOpen}
        onPress={() => setIsOpen((open) => !open)}
        style={({ pressed }) => [responsiveStyles.trigger, pressed && responsiveStyles.pressed]}
      >
        <Text style={[responsiveStyles.triggerText, { color: colors.textMuted }]}>BLOG</Text>
        <Ionicons color={colors.textMuted} name={isOpen ? 'chevron-up' : 'chevron-down'} size={13} />
      </Pressable>

      {isOpen ? (
        <View
          style={[
            responsiveStyles.panel,
            isPhone && responsiveStyles.panelPhone,
            isPhone && width < 380 && responsiveStyles.panelNarrowPhone,
            isPhone && width < 380 && { width: Math.max(240, width - 24) },
            { backgroundColor: colors.surfaceOverlay, borderColor: colors.divider },
          ]}
        >
          <Text style={[responsiveStyles.eyebrow, { color: colors.goldBright }]}>RESELLER BLOG</Text>
          <DropdownLink
            colors={colors}
            href={FIRST_BLOG_POST.path}
            label={FIRST_BLOG_POST.navTitle}
            subtitle={`By ${FIRST_BLOG_POST.author}`}
            onNavigate={() => setIsOpen(false)}
          />
          <View style={[responsiveStyles.divider, { backgroundColor: colors.divider }]} />
          <DropdownLink
            colors={colors}
            href="/blog"
            label="All articles"
            onNavigate={() => setIsOpen(false)}
          />
        </View>
      ) : null}
    </View>
  );
}

function DropdownLink({
  colors,
  href,
  label,
  onNavigate,
  subtitle,
}: {
  colors: KeepFlipThemeColors;
  href: string;
  label: string;
  onNavigate: () => void;
  subtitle?: string;
}) {
  const responsiveStyles2 = useResponsiveStyles(createStylesWebResponsive);
  if (Platform.OS === 'web') {
    const linkStyle: CSSProperties = {
      borderRadius: 10,
      color: colors.text,
      display: 'flex',
      flexDirection: 'column',
      fontFamily: theme.fonts.semibold,
      fontSize: 14,
      gap: 5,
      padding: '10px 8px',
      textDecoration: 'none',
    };
    return createElement(
      'a',
      { href, onClick: onNavigate, style: linkStyle },
      createElement('span', null, label),
      subtitle
        ? createElement('span', { style: { color: colors.textMuted, fontFamily: theme.fonts.body, fontSize: 12 } }, subtitle)
        : null,
    );
  }

  return (
    <Link href={href as Href} asChild>
      <Pressable accessibilityRole="link" onPress={onNavigate} style={responsiveStyles2.nativeLink}>
        <Text style={[responsiveStyles2.linkTitle, { color: colors.text }]}>{label}</Text>
        {subtitle ? <Text style={[responsiveStyles2.linkSubtitle, { color: colors.textMuted }]}>{subtitle}</Text> : null}
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  menu: { position: 'relative', zIndex: 30 },
  trigger: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 4,
    minHeight: 38,
    paddingHorizontal: 6,
  },
  triggerText: { fontFamily: theme.fonts.bold, fontSize: 12, letterSpacing: 0.9 },
  panel: {
    borderRadius: 16,
    borderWidth: 1,
    elevation: 8,
    padding: 12,
    position: 'absolute',
    right: 0,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 10 },
    shadowOpacity: 0.32,
    shadowRadius: 20,
    top: 44,
    width: 310,
    zIndex: 40,
  },
  panelPhone: { top: 82 },
  panelNarrowPhone: { left: 0, right: undefined, top: 44 },
  eyebrow: { fontFamily: theme.fonts.bold, fontSize: 10, letterSpacing: 1.1, padding: 8 },
  divider: { height: 1, marginVertical: 4 },
  nativeLink: { borderRadius: 10, gap: 5, padding: 10 },
  linkTitle: { fontFamily: theme.fonts.semibold, fontSize: 14 },
  linkSubtitle: { fontFamily: theme.fonts.body, fontSize: 12 },
  pressed: { opacity: 0.72 },
});

function createStylesWebResponsive(layout: ReturnType<typeof useResponsiveLayout>) {
  return StyleSheet.create({
    ...styles,
    trigger: {
      ...styles["trigger"],
      gap: layout.isWeb ? layout.webResponsiveWidth(4) : 4,
      minHeight: layout.isWeb ? layout.webResponsiveHeight(38) : 38,
      paddingHorizontal: layout.isWeb ? layout.webResponsiveWidth(6) : 6,
    },
    triggerText: {
      ...styles["triggerText"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(12) : 12,
    },
    panel: {
      ...styles["panel"],
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(16) : 16,
      width: layout.isWeb ? layout.webResponsiveWidth(310) : 310,
    },
    eyebrow: {
      ...styles["eyebrow"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(10) : 10,
    },
    divider: {
      ...styles["divider"],
      marginVertical: layout.isWeb ? layout.webResponsiveHeight(4) : 4,
    },
    nativeLink: {
      ...styles["nativeLink"],
      borderRadius: layout.isWeb ? layout.webResponsiveWidth(10) : 10,
      gap: layout.isWeb ? layout.webResponsiveWidth(5) : 5,
    },
    linkTitle: {
      ...styles["linkTitle"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(14) : 14,
    },
    linkSubtitle: {
      ...styles["linkSubtitle"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(12) : 12,
    },
  });
}
