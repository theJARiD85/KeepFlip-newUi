import Ionicons from '@expo/vector-icons/Ionicons';
import { Link, type Href } from 'expo-router';
import { createElement, useEffect, useId, useState, type CSSProperties } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';

import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import { FIRST_BLOG_POST } from '@/constants/keepflip-blog';
import { keepFlipTheme as theme, type KeepFlipThemeColors } from '@/constants/keepflip-theme';

export function WebBlogMenu({ colors, isPhone, width }: { colors: KeepFlipThemeColors; isPhone: boolean; width: number }) {
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
    <View nativeID={menuId} style={styles.menu}>
      <Pressable
        accessibilityLabel="Blog articles"
        accessibilityRole="button"
        accessibilityState={{ expanded: isOpen }}
        aria-expanded={isOpen}
        onPress={() => setIsOpen((open) => !open)}
        style={({ pressed }) => [styles.trigger, pressed && styles.pressed]}
      >
        <Text style={[styles.triggerText, { color: colors.textMuted }]}>BLOG</Text>
        <Ionicons color={colors.textMuted} name={isOpen ? 'chevron-up' : 'chevron-down'} size={13} />
      </Pressable>

      {isOpen ? (
        <View
          style={[
            styles.panel,
            isPhone && styles.panelPhone,
            isPhone && width < 380 && styles.panelNarrowPhone,
            isPhone && width < 380 && { width: Math.max(240, width - 24) },
            { backgroundColor: colors.surfaceOverlay, borderColor: colors.divider },
          ]}
        >
          <Text style={[styles.eyebrow, { color: colors.goldBright }]}>RESELLER BLOG</Text>
          <DropdownLink
            colors={colors}
            href={FIRST_BLOG_POST.path}
            label={FIRST_BLOG_POST.navTitle}
            subtitle={`By ${FIRST_BLOG_POST.author}`}
            onNavigate={() => setIsOpen(false)}
          />
          <View style={[styles.divider, { backgroundColor: colors.divider }]} />
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
      <Pressable accessibilityRole="link" onPress={onNavigate} style={styles.nativeLink}>
        <Text style={[styles.linkTitle, { color: colors.text }]}>{label}</Text>
        {subtitle ? <Text style={[styles.linkSubtitle, { color: colors.textMuted }]}>{subtitle}</Text> : null}
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
