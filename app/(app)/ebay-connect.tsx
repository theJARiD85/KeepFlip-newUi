import * as Haptics from 'expo-haptics';
import { Redirect, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useEbayConnection } from '@/components/ebay/ebay-connection-context';
import { EbayShoppingBagIcon } from '@/components/ebay/ebay-shopping-bag-icon';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { KeepFlipBackground } from '@/components/ui/keepflip-background';
import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import { keepFlipTheme as theme } from '@/constants/keepflip-theme';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import {
  KEEPFLIP_ANALYTICS_EVENTS,
  trackKeepFlipEvent,
} from '@/services/keepflip-analytics';
import { responsiveWidth } from '@/lib/responsiveFont';
import {
  connectEbayAccount,
  getEbayOAuthEnvironment,
  type EbayConnectionResult,
} from '@/services/ebayConnectionService';

import { useResponsiveStyles } from '@/hooks/use-responsive-layout';
const BENEFITS = [
  {
    icon: 'magnifyingglass' as const,
    title: 'Source with your eBay account',
    description:
      'Let KeepFlip use your authorized eBay identity when sourcing and item-research tools need account-level access.',
  },
  {
    icon: 'envelope.fill' as const,
    title: 'Enable eBay messaging',
    description:
      'Connect the account needed for planned buyer and seller messaging around items and sourcing opportunities.',
  },
  {
    icon: 'lock.fill' as const,
    title: 'Keep your eBay password private',
    description:
      'You sign in and approve permissions on eBay. KeepFlip receives authorization tokens, not your eBay password.',
  },
];

function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function resultMessage(result: EbayConnectionResult) {
  switch (result.status) {
    case 'connected':
      return {
        tone: 'success' as const,
        title: 'eBay account connected',
        body: `KeepFlip is now authorized for your ${result.environment === 'sandbox' ? 'eBay Sandbox' : 'eBay'} account.`,
      };
    case 'declined':
      return {
        tone: 'neutral' as const,
        title: 'Connection cancelled',
        body: 'Nothing was linked. You can connect whenever you are ready.',
      };
    case 'dismissed':
      return {
        tone: 'neutral' as const,
        title: 'eBay sign-in closed',
        body: 'No changes were made to your account.',
      };
    default:
      return {
        tone: 'error' as const,
        title: 'Could not connect eBay',
        body: 'Please try again in a moment.',
      };
  }
}

export default function EbayConnectScreen() {
  const styles = useResponsiveStyles(createResponsiveStyles);
  const {
    contentMaxWidth,
    contentWidth,
    pageGutter,
    responsiveFont
  } = useResponsiveLayout();

  const router = useRouter();
  const params = useLocalSearchParams<{ reconnect?: string | string[] }>();
  const {
    connected,
    isChecking: isCheckingConnection,
    refreshConnection,
    setConnected,
  } = useEbayConnection();
  const reconnectRequested = firstParam(params.reconnect) === '1';
  const insets = useSafeAreaInsets();
  const environment = getEbayOAuthEnvironment();
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionResult, setConnectionResult] = useState<EbayConnectionResult | null>(null);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const handleConnect = async () => {
    if (isConnecting) return;

    setIsConnecting(true);
    setConnectionError(null);
    setConnectionResult(null);

    try {
      const result = await connectEbayAccount(environment);

      if (result.status === 'connected') {
        const confirmedConnection =
          result.connection ?? (await refreshConnection());

        if (!confirmedConnection?.connected) {
          throw new Error('KeepFlip could not confirm the connected eBay account.');
        }

        setConnected(confirmedConnection);
        trackKeepFlipEvent(KEEPFLIP_ANALYTICS_EVENTS.ebayAccountConnected, {
          environment: confirmedConnection.environment,
        });
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
          () => undefined,
        );
        router.replace('/ebay-account');
        return;
      }

      setConnectionResult(result);
    } catch (error) {
      setConnectionError(
        error instanceof Error
          ? error.message
          : 'KeepFlip could not start the eBay connection.',
      );
      void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(
        () => undefined,
      );
    } finally {
      setIsConnecting(false);
    }
  };

  if (!reconnectRequested && isCheckingConnection) return null;

  if (!reconnectRequested && connected) {
    return <Redirect href="/ebay-account" />;
  }

  const message = connectionResult ? resultMessage(connectionResult) : null;

  return (
    <KeepFlipBackground>
      <ScrollView
        contentContainerStyle={[styles.content,
        {
          paddingTop: insets.top + 15,
          paddingBottom: insets.bottom + 30,
        }, { width: contentWidth, maxWidth: contentMaxWidth, alignSelf: 'center', paddingHorizontal: pageGutter }]}
        style={{ marginBottom: insets.bottom, marginTop: insets.top }}
        contentInsetAdjustmentBehavior="never"
        showsVerticalScrollIndicator={false}>
        <View style={styles.hero}>
          <View style={styles.logoShell}>
            <EbayShoppingBagIcon size={76} />
          </View>
          <Text style={[styles.eyebrow, { fontSize: responsiveFont(10) }]}>KEEPFLIP + EBAY</Text>
          <Text style={[styles.title, { fontSize: responsiveFont(31) }]}>Link your eBay account</Text>
          <Text style={[styles.subtitle, { fontSize: responsiveFont(14) }]}>
            Connecting eBay gives KeepFlip permission to use the eBay features you
            approve while keeping your eBay sign-in credentials with eBay.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={[styles.sectionEyebrow, { fontSize: responsiveFont(9) }]}>WHAT THIS UNLOCKS</Text>
          <View style={styles.benefitList}>
            {BENEFITS.map((benefit) => (
              <View key={benefit.title} style={styles.benefitRow}>
                <View style={styles.benefitIcon}>
                  <IconSymbol
                    color={theme.colors.scannerCyan}
                    name={benefit.icon}
                    size={22}
                  />
                </View>
                <View style={styles.benefitCopy}>
                  <Text style={[styles.benefitTitle, { fontSize: responsiveFont(15) }]}>{benefit.title}</Text>
                  <Text style={[styles.benefitDescription, { fontSize: responsiveFont(12) }]}>{benefit.description}</Text>
                </View>
              </View>
            ))}
          </View>
        </View>

        <View style={styles.permissionNote}>
          <IconSymbol
            color={theme.colors.goldBright}
            name="checkmark.shield.fill"
            size={21}
          />
          <Text style={[styles.permissionText, { fontSize: responsiveFont(12) }]}>
            Nothing is listed, purchased, or messaged automatically. eBay shows the
            permissions being requested before you approve the connection.
          </Text>
        </View>

        {message ? (
          <View
            style={[
              styles.resultCard,
              message.tone === 'success' && styles.resultSuccess,
              message.tone === 'error' && styles.resultError,
            ]}>
            <Text style={[styles.resultTitle, { fontSize: responsiveFont(14) }]}>{message.title}</Text>
            <Text style={[styles.resultBody, { fontSize: responsiveFont(12) }]}>{message.body}</Text>
          </View>
        ) : null}

        {connectionError ? (
          <View style={[styles.resultCard, styles.resultError]}>
            <Text style={[styles.resultTitle, { fontSize: responsiveFont(14) }]}>Could not start eBay sign-in</Text>
            <Text selectable style={[styles.resultBody, { fontSize: responsiveFont(12) }]}>
              {connectionError}
            </Text>
          </View>
        ) : null}

        <View style={styles.actions}>
          {environment === 'sandbox' ? (
            <Text style={[styles.environmentLabel, { fontSize: responsiveFont(8) }]}>TEST MODE · EBAY SANDBOX</Text>
          ) : null}

          <Pressable
            accessibilityLabel="Continue to eBay"
            accessibilityRole="button"
            accessibilityState={{ busy: isConnecting, disabled: isConnecting }}
            disabled={isConnecting}
            onPress={() => void handleConnect()}
            style={({ pressed }) => [
              styles.connectButton,
              isConnecting && styles.connectButtonDisabled,
              pressed && !isConnecting && styles.connectButtonPressed,
            ]}>
            {isConnecting ? (
              <ActivityIndicator color={theme.colors.textOnAccent} size="small" />
            ) : (
              <EbayShoppingBagIcon size={28} />
            )}
            <Text style={[styles.connectButtonText, { fontSize: responsiveFont(12) }]}>
              {connectionResult?.status === 'connected'
                ? 'RECONNECT EBAY'
                : 'CONTINUE TO EBAY'}
            </Text>
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={() => router.back()}
            style={({ pressed }) => [styles.notNowButton, pressed && styles.pressed]}>
            <Text style={[styles.notNowText, { fontSize: responsiveFont(10) }]}>NOT NOW</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeepFlipBackground>
  );
}

function createResponsiveStyles(responsiveLayout: ReturnType<typeof useResponsiveLayout>) {
  const { responsiveWidth, responsiveHeight, responsiveFont } = responsiveLayout;
  const staticStyles = StyleSheet.create({
    content: {
      width: '100%',
      maxWidth: 720,
      alignSelf: 'center',
      gap: 15,
      paddingHorizontal: 20,
    },
    topBar: {
      minHeight: 44,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    backButton: {
      width: 44,
      height: 44,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      borderColor: theme.colors.accentGoldBorder,
      backgroundColor: theme.colors.surfaceOverlay,
    },
    backIcon: {
      transform: [{ rotate: '180deg' }],
    },
    topLabel: {
      color: theme.colors.textMuted,
      fontSize: 9,
      fontWeight: '900',
      letterSpacing: 1.8,
    },
    topSpacer: {
      width: 44,
      height: 44,
    },
    pressed: {
      opacity: 0.72,
    },
    hero: {
      alignItems: 'center',
      gap: 7,
    },
    logoShell: {
      width: 108,
      height: 108,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 6,
      borderRadius: 30,
      borderWidth: 1,
      borderColor: theme.colors.accentGoldBorder,
      backgroundColor: theme.colors.card,
      boxShadow: '0 18px 46px rgba(0, 0, 0, 0.36), 0 0 24px rgba(215, 168, 74, 0.07)',
    },
    eyebrow: {
      color: theme.colors.gold,
      fontSize: 10,
      fontWeight: '900',
      letterSpacing: 2.4,
    },
    title: {
      color: theme.colors.cream,
      fontSize: 31,
      fontWeight: '900',
      textAlign: 'center',
    },
    subtitle: {
      maxWidth: 560,
      color: theme.colors.textMuted,
      fontSize: 14,
      lineHeight: 21,
      textAlign: 'center',
    },
    section: {
      gap: 11,
    },
    sectionEyebrow: {
      color: theme.colors.goldMuted,
      fontSize: 9,
      fontWeight: '900',
      letterSpacing: 1.8,
    },
    benefitList: {
      gap: 10,
    },
    benefitRow: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 13,
      padding: 15,
      borderRadius: theme.radii.medium,
      borderWidth: 1,
      borderColor: theme.colors.divider,
      backgroundColor: theme.colors.surfaceInset,
    },
    benefitIcon: {
      width: 42,
      height: 42,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: theme.radii.medium,
      borderWidth: 1,
      borderColor: theme.colors.accentCyanBorder,
      backgroundColor: theme.colors.iconSurfaceCyan,
    },
    benefitCopy: {
      minWidth: 0,
      flex: 1,
      gap: 4,
    },
    benefitTitle: {
      color: theme.colors.cream,
      fontSize: 15,
      fontWeight: '800',
    },
    benefitDescription: {
      color: theme.colors.textMuted,
      fontSize: 12,
      lineHeight: 18,
    },
    permissionNote: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 11,
      padding: 14,
      borderRadius: theme.radii.medium,
      borderWidth: 1,
      borderColor: theme.colors.dividerStrong,
      backgroundColor: theme.colors.iconSurfaceGold,
    },
    permissionText: {
      minWidth: 0,
      flex: 1,
      color: theme.colors.textMuted,
      fontSize: 12,
      lineHeight: 18,
      fontFamily: theme.fonts.body,
    },
    resultCard: {
      gap: 4,
      padding: 14,
      borderRadius: theme.radii.medium,
      borderWidth: 1,
      borderColor: theme.colors.dividerStrong,
      backgroundColor: theme.colors.surfaceOverlay,
    },
    resultSuccess: {
      borderColor: theme.colors.accentCyanBorder,
      backgroundColor: theme.colors.iconSurfaceCyan,
    },
    resultError: {
      borderColor: theme.colors.danger,
      backgroundColor: theme.colors.dangerSurface,
    },
    resultTitle: {
      color: theme.colors.cream,
      fontSize: 14,
      fontWeight: '900',
    },
    resultBody: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.body,
      fontSize: 12,
      lineHeight: 18,
    },
    actions: {
      gap: 10,
      paddingTop: 2,
    },
    environmentLabel: {
      fontFamily: theme.fonts.radar,
      color: theme.colors.scannerCyan,
      fontSize: 8,
      fontWeight: '900',
      letterSpacing: 1.5,
      textAlign: 'center',
    },
    connectButton: {
      minHeight: 58,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 12,
      paddingHorizontal: 18,
      borderRadius: theme.radii.medium,
      backgroundColor: theme.colors.goldBright,
      boxShadow: '0 12px 28px rgba(215, 168, 74, 0.16)',
    },
    connectButtonDisabled: {
      opacity: 0.64,
    },
    connectButtonPressed: {
      opacity: 0.86,
      transform: [{ scale: 0.992 }],
    },
    connectButtonText: {
      color: theme.colors.textOnAccent,
      fontSize: 12,
      fontWeight: '900',
      letterSpacing: 1.15,
    },
    notNowButton: {
      minHeight: 44,
      alignItems: 'center',
      justifyContent: 'center',
    },
    notNowText: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.display,
      fontSize: 10,
      fontWeight: '900',
      letterSpacing: 1.5,
    },
  });
  return {
    ...staticStyles,
    backButton: [
      staticStyles.backButton,
      {
        width: responsiveWidth(44),
        height: responsiveHeight(44),
      },
    ],
    topLabel: [
      staticStyles.topLabel,
      {
        fontSize: responsiveFont(9),
      },
    ],
    topSpacer: [
      staticStyles.topSpacer,
      {
        width: responsiveWidth(44),
        height: responsiveHeight(44),
      },
    ],
    logoShell: [
      staticStyles.logoShell,
      {
        width: responsiveWidth(108),
        height: responsiveHeight(108),
      },
    ],
    eyebrow: [
      staticStyles.eyebrow,
      {
        fontSize: responsiveFont(10),
      },
    ],
    title: [
      staticStyles.title,
      {
        fontSize: responsiveFont(31),
      },
    ],
    subtitle: [
      staticStyles.subtitle,
      {
        fontSize: responsiveFont(14),
      },
    ],
    sectionEyebrow: [
      staticStyles.sectionEyebrow,
      {
        fontSize: responsiveFont(9),
      },
    ],
    benefitIcon: [
      staticStyles.benefitIcon,
      {
        width: responsiveWidth(42),
        height: responsiveHeight(42),
      },
    ],
    benefitTitle: [
      staticStyles.benefitTitle,
      {
        fontSize: responsiveFont(15),
      },
    ],
    benefitDescription: [
      staticStyles.benefitDescription,
      {
        fontSize: responsiveFont(12),
      },
    ],
    permissionText: [
      staticStyles.permissionText,
      {
        fontSize: responsiveFont(12),
      },
    ],
    resultTitle: [
      staticStyles.resultTitle,
      {
        fontSize: responsiveFont(14),
      },
    ],
    resultBody: [
      staticStyles.resultBody,
      {
        fontSize: responsiveFont(12),
      },
    ],
    environmentLabel: [
      staticStyles.environmentLabel,
      {
        fontSize: responsiveFont(8),
      },
    ],
    connectButtonText: [
      staticStyles.connectButtonText,
      {
        fontSize: responsiveFont(12),
      },
    ],
    notNowText: [
      staticStyles.notNowText,
      {
        fontSize: responsiveFont(10),
      },
    ],
  };
}
