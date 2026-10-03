import { type Href, usePathname, useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { useKeepFlipSubscription } from '@/components/subscription/keepflip-subscription-context';
import { FlipConversationalAssistantPanel } from '@/components/command-center/flip-conversational-assistant-panel';
import {
  FlipGuidanceOverlay,
  FlipGuidanceProvider,
} from '@/components/command-center/flip-guidance-overlay';
import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import { keepFlipTheme as theme } from '@/constants/keepflip-theme';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import type { AssistantRoute } from '@/services/keepflip-assistant-service';

function WebFlipAssistantScreen() {
  const pathname = usePathname();
  const router = useRouter();
  const { canUse } = useKeepFlipSubscription();
  const {
    webContentMaxWidth,
    webContentWidth,
    webPageGutter,
    webResponsiveFont,
  } = useResponsiveLayout();

  if (!canUse('flip_assistant')) {
    return (
      <View style={[styles.page, { width: webContentWidth, maxWidth: webContentMaxWidth, alignSelf: 'center', paddingHorizontal: webPageGutter }]}>
        <View style={styles.gateCard}>
          <Text style={[styles.eyebrow, { fontSize: webResponsiveFont(12) }]}>SERIOUS FEATURE</Text>
          <Text style={[styles.title, { fontSize: webResponsiveFont(24) }]}>Flip is part of Serious Reseller.</Text>
          <Text style={[styles.body, { fontSize: webResponsiveFont(14), lineHeight: webResponsiveFont(20) }]}>Keep using the full Free workflow. Serious is $13/month or $130/year and includes Flip.</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/subscription' as Href)}
            style={({ pressed }) => [styles.gateButton, pressed && styles.gateButtonPressed]}
          >
            <Text style={styles.gateButtonText}>View Serious</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const navigate = (route: AssistantRoute) => {
    router.push(route as Href);
  };

  return (
    <View style={[styles.page, { width: webContentWidth, maxWidth: webContentMaxWidth, alignSelf: 'center', paddingHorizontal: webPageGutter }]}>
      <View
        style={[
          styles.content,
          {
            flex: 1,
            minHeight: 0,
            maxWidth: webContentMaxWidth,
            paddingHorizontal: webPageGutter,
            width: webContentWidth,
          },
        ]}>
        <View style={styles.intro}>
          <Text style={[styles.eyebrow, { fontSize: webResponsiveFont(12) }]}>FLIP ASSISTANT</Text>
          <Text style={[styles.title, { fontSize: webResponsiveFont(24) }]}>A second set of eyes for every move.</Text>
          <Text style={[styles.body, { fontSize: webResponsiveFont(14), lineHeight: webResponsiveFont(20) }]}>Ask Flip about your inventory, priorities, cash flow, or the next action worth taking. The conversation stays tied to your KeepFlip workspace.</Text>
        </View>
        <FlipConversationalAssistantPanel
          currentRoute={pathname}
          fillAvailableHeight
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
    <FlipGuidanceProvider>
      <WebFlipAssistantScreen />
      <FlipGuidanceOverlay />
    </FlipGuidanceProvider>
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
    flex: 1,
    gap: 20,
    minHeight: 0,
  },
  intro: {
    gap: 7,
  },
  eyebrow: {
    color: theme.colors.scannerCyan,
    fontFamily: theme.fonts.display,
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
  gateCard: {
    alignSelf: 'center',
    backgroundColor: theme.colors.backgroundRaised,
    borderColor: theme.colors.accentGoldBorder,
    borderRadius: 18,
    borderWidth: 1,
    gap: 12,
    marginTop: 44,
    maxWidth: 620,
    padding: 24,
    width: '100%',
  },
  gateButton: {
    alignItems: 'center',
    alignSelf: 'flex-start',
    backgroundColor: theme.colors.gold,
    borderRadius: 12,
    justifyContent: 'center',
    marginTop: 4,
    minHeight: 46,
    paddingHorizontal: 20,
  },
  gateButtonPressed: { opacity: 0.8 },
  gateButtonText: {
    color: theme.colors.textOnAccent,
    fontFamily: theme.fonts.bold,
    fontWeight: '900',
  },
});
