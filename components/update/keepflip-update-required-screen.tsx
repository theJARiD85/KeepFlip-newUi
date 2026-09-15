import { Image } from 'expo-image';
import { useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { KeepFlipBackground } from '@/components/ui/keepflip-background';
import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import { keepFlipTheme as theme } from '@/constants/keepflip-theme';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';

type KeepFlipUpdateRequiredScreenProps = {
  currentVersion: string;
  minimumVersion: string;
  onRetry: () => void;
  onUpdate: () => Promise<void>;
};

export function KeepFlipUpdateRequiredScreen({
  currentVersion,
  minimumVersion,
  onRetry,
  onUpdate,
}: KeepFlipUpdateRequiredScreenProps) {
  const insets = useSafeAreaInsets();
  const {
    contentMaxWidth,
    contentWidth,
    pageGutter,
    responsiveFont,
    responsiveHeight,
    responsiveWidth,
  } = useResponsiveLayout();
  const [isOpeningStore, setIsOpeningStore] = useState(false);
  const [updateError, setUpdateError] = useState<string | null>(null);

  const handleUpdate = async () => {
    if (isOpeningStore) return;

    setIsOpeningStore(true);
    setUpdateError(null);
    try {
      await onUpdate();
    } catch {
      setUpdateError(
        'KeepFlip could not open the update page. Check your connection and try again.',
      );
    } finally {
      setIsOpeningStore(false);
    }
  };

  const handleRetry = () => {
    setUpdateError(null);
    onRetry();
  };

  return (
    <KeepFlipBackground contentStyle={styles.backgroundContent}>
      <ScrollView
        contentContainerStyle={[
          styles.scrollContent,
          {
            paddingBottom: insets.bottom + 24,
            paddingHorizontal: pageGutter,
            paddingTop: insets.top + 24,
          },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <View
          style={[
            styles.card,
            {
              maxWidth: contentMaxWidth,
              width: contentWidth,
            },
          ]}
        >
          <View
            accessibilityLabel="KeepFlip"
            style={[
              styles.logoHalo,
              {
                height: responsiveWidth(118),
                width: responsiveWidth(118),
              },
            ]}
          >
            <Image
              accessibilityLabel="KeepFlip logo"
              contentFit="contain"
              source={require('@/assets/images/icon3.png')}
              style={[
                styles.logo,
                {
                  height: responsiveHeight(106),
                  width: responsiveWidth(106),
                },
              ]}
            />
          </View>

          <View style={styles.copyBlock}>
            <Text style={[styles.eyebrow, { fontSize: responsiveFont(8) }]}>
              KEEPFLIP / UPDATE REQUIRED
            </Text>
            <Text
              style={[
                styles.title,
                {
                  fontSize: responsiveFont(30),
                  lineHeight: responsiveFont(37),
                },
              ]}
            >
              Your next flip starts with an update.
            </Text>
            <Text style={[styles.body, { fontSize: responsiveFont(13) }]}>
              KeepFlip now requires version {minimumVersion} or newer. Update
              to move onto the subscription experience and continue using your
              account, inventory, and seller tools.
            </Text>
          </View>

          <View style={styles.versionCard}>
            <View style={styles.versionColumn}>
              <Text style={[styles.versionLabel, { fontSize: responsiveFont(7) }]}>
                INSTALLED
              </Text>
              <Text style={[styles.versionValue, { fontSize: responsiveFont(15) }]}>
                {currentVersion}
              </Text>
            </View>
            <View style={styles.versionDivider} />
            <View style={styles.versionColumn}>
              <Text style={[styles.versionLabel, { fontSize: responsiveFont(7) }]}>
                REQUIRED
              </Text>
              <Text
                style={[
                  styles.versionValue,
                  styles.requiredVersion,
                  { fontSize: responsiveFont(15) },
                ]}
              >
                {minimumVersion}+
              </Text>
            </View>
          </View>

          <Pressable
            accessibilityLabel="Update KeepFlip"
            accessibilityRole="button"
            disabled={isOpeningStore}
            onPress={() => void handleUpdate()}
            style={({ pressed }) => [
              styles.updateButton,
              isOpeningStore && styles.buttonDisabled,
              pressed && !isOpeningStore && styles.buttonPressed,
            ]}
          >
            {isOpeningStore ? (
              <ActivityIndicator color={theme.colors.backgroundDeep} size="small" />
            ) : (
              <Text style={[styles.updateButtonText, { fontSize: responsiveFont(11) }]}>
                UPDATE KEEPFLIP
              </Text>
            )}
          </Pressable>

          <Pressable
            accessibilityLabel="I already updated, check again"
            accessibilityRole="button"
            disabled={isOpeningStore}
            onPress={handleRetry}
            style={({ pressed }) => [
              styles.retryButton,
              pressed && !isOpeningStore && styles.retryButtonPressed,
            ]}
          >
            <Text style={[styles.retryButtonText, { fontSize: responsiveFont(10) }]}>
              I ALREADY UPDATED — CHECK AGAIN
            </Text>
          </Pressable>

          {updateError ? (
            <Text
              accessibilityLiveRegion="polite"
              style={[styles.errorText, { fontSize: responsiveFont(11) }]}
            >
              {updateError}
            </Text>
          ) : null}

          <Text style={[styles.footer, { fontSize: responsiveFont(9) }]}>
            KeepFlip protects your account by requiring the current supported
            release.
          </Text>
        </View>
      </ScrollView>
    </KeepFlipBackground>
  );
}

const styles = StyleSheet.create({
  backgroundContent: {
    alignItems: 'center',
  },
  scrollContent: {
    alignItems: 'center',
    flexGrow: 1,
    justifyContent: 'center',
  },
  card: {
    alignItems: 'center',
    backgroundColor: 'rgba(8, 8, 11, 0.76)',
    borderColor: 'rgba(242, 211, 138, 0.22)',
    borderCurve: 'continuous',
    borderRadius: theme.radii.large,
    borderWidth: 1,
    boxShadow: '0 18px 52px rgba(0, 0, 0, 0.56), 0 0 24px rgba(0, 255, 255, 0.08)',
    gap: 24,
    padding: 24,
  },
  logoHalo: {
    alignItems: 'center',
    backgroundColor: 'rgba(6, 5, 7, 0.7)',
    borderColor: 'rgba(242, 211, 138, 0.3)',
    borderCurve: 'continuous',
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    justifyContent: 'center',
  },
  logo: {
    borderRadius: theme.radii.pill,
  },
  copyBlock: {
    alignItems: 'center',
    gap: 10,
  },
  eyebrow: {
    color: theme.colors.gold,
    fontWeight: '900',
    letterSpacing: 1.6,
    textAlign: 'center',
  },
  title: {
    color: theme.colors.text,
    fontWeight: '900',
    textAlign: 'center',
  },
  body: {
    color: theme.colors.textMuted,
    lineHeight: 21,
    textAlign: 'center',
  },
  versionCard: {
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: 'rgba(1, 1, 2, 0.66)',
    borderColor: 'rgba(88, 223, 232, 0.18)',
    borderCurve: 'continuous',
    borderRadius: theme.radii.medium,
    borderWidth: 1,
    flexDirection: 'row',
    gap: 18,
    justifyContent: 'center',
    paddingHorizontal: 18,
    paddingVertical: 15,
  },
  versionColumn: {
    alignItems: 'center',
    flex: 1,
    gap: 4,
  },
  versionDivider: {
    backgroundColor: 'rgba(247, 242, 232, 0.16)',
    height: 34,
    width: 1,
  },
  versionLabel: {
    color: theme.colors.textMuted,
    fontWeight: '800',
    letterSpacing: 1.2,
  },
  versionValue: {
    color: theme.colors.text,
    fontWeight: '900',
  },
  requiredVersion: {
    color: theme.colors.scannerCyan,
  },
  updateButton: {
    alignItems: 'center',
    alignSelf: 'stretch',
    backgroundColor: theme.colors.goldBright,
    borderCurve: 'continuous',
    borderRadius: theme.radii.medium,
    justifyContent: 'center',
    minHeight: 56,
    paddingHorizontal: 20,
  },
  updateButtonText: {
    color: theme.colors.backgroundDeep,
    fontWeight: '900',
    letterSpacing: 1.1,
  },
  buttonDisabled: {
    opacity: 0.58,
  },
  buttonPressed: {
    opacity: 0.78,
  },
  retryButton: {
    alignItems: 'center',
    minHeight: 34,
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  retryButtonText: {
    color: theme.colors.scannerCyan,
    fontWeight: '800',
    letterSpacing: 0.8,
    textAlign: 'center',
  },
  retryButtonPressed: {
    opacity: 0.7,
  },
  errorText: {
    color: theme.colors.danger,
    textAlign: 'center',
  },
  footer: {
    color: theme.colors.textMuted,
    lineHeight: 16,
    textAlign: 'center',
  },
});
