import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { EbayShoppingBagIcon } from '@/components/ebay/ebay-shopping-bag-icon';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { KeepFlipBackground } from '@/components/ui/keepflip-background';
import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import { keepFlipTheme as theme } from '@/constants/keepflip-theme';
import {
  connectEbayAccount,
  getEbayOAuthEnvironment,
  type EbayConnectionResult,
} from '@/lib/connect-ebay-account';

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
    case 'invalid':
      return {
        tone: 'error' as const,
        title: 'Connection expired',
        body: 'Please start the eBay connection again.',
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
  const router = useRouter();
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
      setConnectionResult(result);

      if (result.status === 'connected') {
        void Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(
          () => undefined,
        );
      }
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

  const message = connectionResult ? resultMessage(connectionResult) : null;

  return (
    <KeepFlipBackground>
      <ScrollView
        contentContainerStyle={[
          styles.content,
          {
            paddingTop: insets.top + 24,
            paddingBottom: insets.bottom + 32,
          },
        ]}
        contentInsetAdjustmentBehavior="never"
        showsVerticalScrollIndicator={false}>
        <View style={styles.topBar}>
          <Pressable
            accessibilityLabel="Go back"
            accessibilityRole="button"
            hitSlop={10}
            onPress={() => router.back()}
            style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}>
            <IconSymbol
              color={theme.colors.goldBright}
              name="chevron.right"
              size={22}
              style={styles.backIcon}
            />
          </Pressable>
          <Text style={styles.topLabel}>EBAY CONNECTION</Text>
          <View style={styles.topSpacer} />
        </View>

        <View style={styles.hero}>
          <View style={styles.logoShell}>
            <EbayShoppingBagIcon size={76} />
          </View>
          <Text style={styles.eyebrow}>KEEPFLIP + EBAY</Text>
          <Text style={styles.title}>Link your eBay account</Text>
          <Text style={styles.subtitle}>
            Connecting eBay gives KeepFlip permission to use the eBay features you
            approve while keeping your eBay sign-in credentials with eBay.
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionEyebrow}>WHAT THIS UNLOCKS</Text>
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
                  <Text style={styles.benefitTitle}>{benefit.title}</Text>
                  <Text style={styles.benefitDescription}>{benefit.description}</Text>
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
          <Text style={styles.permissionText}>
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
            <Text style={styles.resultTitle}>{message.title}</Text>
            <Text style={styles.resultBody}>{message.body}</Text>
          </View>
        ) : null}

        {connectionError ? (
          <View style={[styles.resultCard, styles.resultError]}>
            <Text style={styles.resultTitle}>Could not start eBay sign-in</Text>
            <Text selectable style={styles.resultBody}>
              {connectionError}
            </Text>
          </View>
        ) : null}

        <View style={styles.actions}>
          {environment === 'sandbox' ? (
            <Text style={styles.environmentLabel}>TEST MODE · EBAY SANDBOX</Text>
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
              <ActivityIndicator color={theme.colors.backgroundDeep} size="small" />
            ) : (
              <EbayShoppingBagIcon size={28} />
            )}
            <Text style={styles.connectButtonText}>
              {connectionResult?.status === 'connected'
                ? 'RECONNECT EBAY'
                : 'CONTINUE TO EBAY'}
            </Text>
            {!isConnecting ? (
              <IconSymbol
                color={theme.colors.backgroundDeep}
                name="arrow.right"
                size={20}
              />
            ) : null}
          </Pressable>

          <Pressable
            accessibilityRole="button"
            onPress={() => router.back()}
            style={({ pressed }) => [styles.notNowButton, pressed && styles.pressed]}>
            <Text style={styles.notNowText}>NOT NOW</Text>
          </Pressable>
        </View>
      </ScrollView>
    </KeepFlipBackground>
  );
}

const styles = StyleSheet.create({
  content: {
    width: '100%',
    maxWidth: 720,
    alignSelf: 'center',
    gap: 24,
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
    borderColor: 'rgba(242, 211, 138, 0.28)',
    backgroundColor: 'rgba(7, 7, 11, 0.78)',
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
    gap: 10,
    paddingHorizontal: 8,
    paddingVertical: 10,
  },
  logoShell: {
    width: 108,
    height: 108,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 6,
    borderRadius: 30,
    borderWidth: 1,
    borderColor: 'rgba(242, 211, 138, 0.28)',
    backgroundColor: 'rgba(9, 8, 12, 0.88)',
    boxShadow: '0 18px 46px rgba(0, 0, 0, 0.36), 0 0 24px rgba(215, 168, 74, 0.07)',
  },
  eyebrow: {
    color: theme.colors.gold,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2,
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
    borderColor: 'rgba(138, 100, 43, 0.20)',
    backgroundColor: 'rgba(8, 8, 11, 0.72)',
  },
  benefitIcon: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radii.medium,
    borderWidth: 1,
    borderColor: 'rgba(88, 223, 232, 0.20)',
    backgroundColor: 'rgba(88, 223, 232, 0.06)',
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
    borderColor: 'rgba(242, 211, 138, 0.22)',
    backgroundColor: 'rgba(215, 168, 74, 0.07)',
  },
  permissionText: {
    minWidth: 0,
    flex: 1,
    color: theme.colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  resultCard: {
    gap: 4,
    padding: 14,
    borderRadius: theme.radii.medium,
    borderWidth: 1,
    borderColor: 'rgba(138, 100, 43, 0.28)',
    backgroundColor: 'rgba(8, 8, 11, 0.82)',
  },
  resultSuccess: {
    borderColor: 'rgba(88, 223, 232, 0.28)',
    backgroundColor: 'rgba(88, 223, 232, 0.07)',
  },
  resultError: {
    borderColor: 'rgba(255, 96, 96, 0.30)',
    backgroundColor: 'rgba(255, 96, 96, 0.07)',
  },
  resultTitle: {
    color: theme.colors.cream,
    fontSize: 14,
    fontWeight: '900',
  },
  resultBody: {
    color: theme.colors.textMuted,
    fontSize: 12,
    lineHeight: 18,
  },
  actions: {
    gap: 10,
    paddingTop: 2,
  },
  environmentLabel: {
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
    color: theme.colors.backgroundDeep,
    fontSize: 13,
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
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
});
