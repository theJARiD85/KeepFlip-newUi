import { type Href, Link } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import { keepFlipTheme as theme } from '@/constants/keepflip-theme';

const LINKS: { href: Href; label: string }[] = [
  { href: '/', label: 'Home' },
  { href: '/about' as Href, label: 'About' },
  { href: '/contact' as Href, label: 'Contact' },
  { href: '/privacy', label: 'Privacy' },
  { href: '/terms', label: 'Terms' },
];

export function PublicSiteFooter() {
  return (
    <View style={styles.root}>
      {LINKS.map(({ href, label }) => (
        <Link key={label} href={href} style={styles.link}>
          <Text style={styles.linkText}>{label}</Text>
        </Link>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 20,
    justifyContent: 'center',
    marginTop: 32,
  },
  link: {
    minHeight: 32,
    justifyContent: 'center',
  },
  linkText: {
    color: '#9d9b9f',
    fontFamily: theme.fonts.medium,
    fontSize: 13,
  },
});
