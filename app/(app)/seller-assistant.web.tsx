import { type Href, usePathname, useRouter } from 'expo-router';
import { StyleSheet, View } from 'react-native';

import { FlipConversationalAssistantPanel } from '@/components/command-center/flip-conversational-assistant-panel';
import {
  FlipGuidanceOverlay,
  FlipGuidanceProvider,
} from '@/components/command-center/flip-guidance-overlay';
import { FlipCompanionProvider } from '@/components/flip';
import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import { keepFlipTheme as theme } from '@/constants/keepflip-theme';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import type { AssistantRoute } from '@/services/keepflip-assistant-service';

function WebFlipAssistantScreen() {
  const pathname = usePathname();
  const router = useRouter();
  const {
    contentMaxWidth,
    contentWidth,
    pageGutter,
    responsiveFont,
  } = useResponsiveLayout();

  const navigate = (route: AssistantRoute) => {
    router.push(route as Href);
  };

  return (
    <View style={styles.page}>
      <View
        style={[
          styles.content,
          {
            maxWidth: contentMaxWidth,
            paddingHorizontal: pageGutter,
            width: contentWidth,
          },
        ]}>
        <View style={styles.intro}>
          <Text style={[styles.eyebrow, { fontSize: responsiveFont(8) }]}>FLIP ASSISTANT</Text>
          <Text style={[styles.title, { fontSize: responsiveFont(24) }]}>A second set of eyes for every move.</Text>
          <Text style={[styles.body, { fontSize: responsiveFont(11), lineHeight: responsiveFont(16) }]}>Ask Flip about your inventory, priorities, cash flow, or the next action worth taking. The conversation stays tied to your KeepFlip workspace.</Text>
        </View>
        <FlipConversationalAssistantPanel
          currentRoute={pathname}
          onNavigate={navigate}
          onOpenSellerOperations={() =>
            router.push('/command-center?openSellerOperations=1' as Href)
          }
          startsExpanded
        />
      </View>
    </View>
  );
}

export default function WebSellerAssistantRoute() {
  return (
    <FlipCompanionProvider>
      <FlipGuidanceProvider>
        <WebFlipAssistantScreen />
        <FlipGuidanceOverlay />
      </FlipGuidanceProvider>
    </FlipCompanionProvider>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
    minHeight: 0,
    paddingBottom: 28,
    paddingTop: 28,
  },
  content: {
    alignSelf: 'center',
    gap: 20,
  },
  intro: {
    gap: 7,
  },
  eyebrow: {
    color: theme.colors.scannerCyan,
    fontFamily: theme.fonts.radar,
    fontWeight: '900',
    letterSpacing: 1.2,
  },
  title: {
    color: theme.colors.text,
    fontFamily: theme.fonts.bold,
    fontWeight: '900',
    letterSpacing: -0.45,
  },
  body: {
    color: theme.colors.textMuted,
    fontFamily: theme.fonts.body,
    maxWidth: 720,
  },
});
