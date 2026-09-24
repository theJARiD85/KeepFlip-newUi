import { type Href, Link } from 'expo-router';
import { StyleSheet } from 'react-native';

import { PublicInfoPage } from '@/components/web/public-info-page';
import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import { keepFlipTheme as theme } from '@/constants/keepflip-theme';

export function ContactPageContent() {
  return (
    <PublicInfoPage
      eyebrow="CONTACT"
      paragraphs={[
        'KeepFlip support is the email contact for account and product questions. Include the email address on your account and a short description of the issue.',
      ]}
      title="Contact KeepFlip"
    >
      <Link href={'mailto:support@keep-flip.com' as Href} style={styles.emailLink}>
        <Text style={styles.emailText}>support@keep-flip.com</Text>
      </Link>
    </PublicInfoPage>
  );
}

const styles = StyleSheet.create({
  emailLink: {
    alignSelf: 'flex-start',
    minHeight: 44,
    justifyContent: 'center',
  },
  emailText: {
    color: '#f2d38a',
    fontFamily: theme.fonts.semibold,
    fontSize: 17,
    textDecorationLine: 'underline',
  },
});
