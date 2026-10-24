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
import { useResponsiveLayout , useResponsiveStyles} from '@/hooks/use-responsive-layout';
import type { AssistantRoute } from '@/services/keepflip-assistant-service';

function WebFlipAssistantScreen() {
  const responsiveStyles = useResponsiveStyles(createStylesWebResponsive);
  const pathname = usePathname();
  const router = useRouter();
  const { canUse } = useKeepFlipSubscription();
  const {
    webContentMaxWidth,
    webContentWidth,
    webPageGutter,
    webResponsiveFont,
    contentMaxWidth,
    contentWidth,
    pageGutter
  } = useResponsiveLayout();

  if (!canUse('flip_assistant')) {
    return (
      <View style={[responsiveStyles.page, { width: webContentWidth, maxWidth: webContentMaxWidth, alignSelf: 'center', paddingHorizontal: webPageGutter }, { width: contentWidth, maxWidth: contentMaxWidth, alignSelf: 'center', paddingHorizontal: pageGutter }]}>
        <View style={responsiveStyles.gateCard}>
          <Text style={[responsiveStyles.eyebrow, { fontSize: webResponsiveFont(12) }]}>SERIOUS FEATURE</Text>
          <Text style={[responsiveStyles.title, { fontSize: webResponsiveFont(24) }]}>Flip is part of Serious Reseller.</Text>
          <Text style={[responsiveStyles.body, { fontSize: webResponsiveFont(14), lineHeight: webResponsiveFont(20) }]}>Keep using the full Free workflow. Serious is $13/month or $130/year and includes Flip.</Text>
          <Pressable
            accessibilityRole="button"
            onPress={() => router.push('/subscription' as Href)}
            style={({ pressed }) => [responsiveStyles.gateButton, pressed && responsiveStyles.gateButtonPressed]}
          >
            <Text style={responsiveStyles.gateButtonText}>View Serious</Text>
          </Pressable>
        </View>
      </View>
    );
  }

  const navigate = (route: AssistantRoute) => {
    router.push(route as Href);
  };

  return (
    <View style={[responsiveStyles.page, { width: webContentWidth, maxWidth: webContentMaxWidth, alignSelf: 'center', paddingHorizontal: webPageGutter }, { width: contentWidth, maxWidth: contentMaxWidth, alignSelf: 'center', paddingHorizontal: pageGutter }]}>
      <View
        style={[responsiveStyles.content,
          {
            flex: 1,
            minHeight: 0,
            maxWidth: webContentMaxWidth,
            paddingHorizontal: webPageGutter,
            width: webContentWidth,
          }, { width: contentWidth, maxWidth: contentMaxWidth, alignSelf: 'center', paddingHorizontal: pageGutter }]}>
        <View style={responsiveStyles.intro}>
          <Text style={[responsiveStyles.eyebrow, { fontSize: webResponsiveFont(12) }]}>FLIP ASSISTANT</Text>
          <Text style={[responsiveStyles.title, { fontSize: webResponsiveFont(24) }]}>A second set of eyes for every move.</Text>
          <Text style={[responsiveStyles.body, { fontSize: webResponsiveFont(14), lineHeight: webResponsiveFont(20) }]}>Ask Flip about your inventory, priorities, cash flow, or the next action worth taking. The conversation stays tied to your KeepFlip workspace.</Text>
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

function createStylesWebResponsive(layout: ReturnType<typeof useResponsiveLayout>) {
  return StyleSheet.create({
    ...styles,
    page: {
      ...styles["page"],
      paddingBottom: layout.isWideWeb ? layout.webResponsiveHeight(28) : layout.responsiveHeight(28),
      paddingTop: layout.isWideWeb ? layout.webResponsiveHeight(28) : layout.responsiveHeight(28),
    },
    content: {
      ...styles["content"],
      gap: layout.isWideWeb ? layout.webResponsiveWidth(20) : layout.responsiveWidth(20),
    },
    intro: {
      ...styles["intro"],
      gap: layout.isWideWeb ? layout.webResponsiveWidth(7) : layout.responsiveWidth(7),
    },
    body: {
      ...styles["body"],
      maxWidth: layout.isWideWeb ? layout.webResponsiveWidth(720) : layout.responsiveWidth(720),
    },
    gateCard: {
      ...styles["gateCard"],
      borderRadius: layout.isWideWeb ? layout.webResponsiveWidth(18) : layout.responsiveWidth(18),
      gap: layout.isWideWeb ? layout.webResponsiveWidth(12) : layout.responsiveWidth(12),
      marginTop: layout.isWideWeb ? layout.webResponsiveHeight(44) : layout.responsiveHeight(44),
      maxWidth: layout.isWideWeb ? layout.webResponsiveWidth(620) : layout.responsiveWidth(620),
    },
    gateButton: {
      ...styles["gateButton"],
      borderRadius: layout.isWideWeb ? layout.webResponsiveWidth(12) : layout.responsiveWidth(12),
      marginTop: layout.isWideWeb ? layout.webResponsiveHeight(4) : layout.responsiveHeight(4),
      minHeight: layout.isWideWeb ? layout.webResponsiveHeight(46) : layout.responsiveHeight(46),
      paddingHorizontal: layout.isWideWeb ? layout.webResponsiveWidth(20) : layout.responsiveWidth(20),
    },
  });
}
