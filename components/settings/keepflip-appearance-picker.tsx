import { Ionicons } from '@react-native-vector-icons/ionicons';
import * as Haptics from 'expo-haptics';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { useKeepFlipAppearance } from '@/components/settings/keepflip-appearance-context';
import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import { keepFlipTheme as theme } from '@/constants/keepflip-theme';
import { useResponsiveLayout, useResponsiveStyles } from '@/hooks/use-responsive-layout';
import type { KeepFlipAppearancePreference } from '@/services/keepflip-appearance-service';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const APPEARANCE_OPTIONS: {
  description: string;
  icon: 'contrast' | 'sunny' | 'moon';
  label: string;
  preference: KeepFlipAppearancePreference;
}[] = [
    {
      description: 'Follow the appearance setting on this device.',
      icon: 'contrast',
      label: 'System',
      preference: 'system',
    },
    {
      description: 'Use the warm light palette throughout KeepFlip.',
      icon: 'sunny',
      label: 'Light',
      preference: 'light',
    },
    {
      description: 'Keep the current dark glass-circuit palette.',
      icon: 'moon',
      label: 'Dark',
      preference: 'dark',
    },
  ];

function hapticSelection() {
  if (process.env.EXPO_OS === 'ios') {
    void Haptics.selectionAsync().catch(() => undefined);
  }
}

type KeepFlipAppearancePickerProps = {
  onClose: () => void;
  visible: boolean;
};

export function KeepFlipAppearancePicker({
  onClose,
  visible,
}: KeepFlipAppearancePickerProps) {
  const responsiveLayout2 = useResponsiveLayout();
  const styles = useResponsiveStyles(createResponsiveStyles);
  const { responsiveFont } = useResponsiveLayout();
  const insets = useSafeAreaInsets();
  const {
    effectiveColorScheme,
    errorMessage,
    isLoading,
    isSaving,
    preference,
    setPreference,
  } = useKeepFlipAppearance();


  const handleSelect = async (nextPreference: KeepFlipAppearancePreference) => {
    if (isLoading || isSaving || nextPreference === preference) {
      if (nextPreference === preference && !isLoading && !isSaving) onClose();
      return;
    }

    hapticSelection();
    try {
      await setPreference(nextPreference);
      onClose();
    } catch {
      // The provider exposes the safe, user-visible persistence error.
    }
  };

  return (
    <Modal
      animationType="fade"
      onRequestClose={onClose}
      transparent
      visible={visible}>
      <View
        accessibilityViewIsModal
        style={[styles.backdrop, { paddingBottom: Math.max(insets.bottom, 12) }]}
      >
        <Pressable
          accessibilityLabel="Close appearance settings"
          accessibilityRole="button"
          onPress={onClose}
          style={StyleSheet.absoluteFill}
        />
        <View style={styles.card}>
          <View style={styles.header}>
            <View style={styles.headerCopy}>
              <Text style={[styles.eyebrow, { fontSize: responsiveFont(8) }]}>KEEPFLIP / APPEARANCE</Text>
              <Text style={[styles.title, { fontSize: responsiveFont(20) }]}>Choose your look</Text>
              <Text style={[styles.subtitle, { fontSize: responsiveFont(10), lineHeight: responsiveLayout2.isWeb ? responsiveLayout2.webResponsiveFont(15) : 15 }]}>KeepFlip follows your device by default, or you can choose a mode that stays fixed.</Text>
            </View>
            <Pressable
              accessibilityLabel="Close appearance settings"
              accessibilityRole="button"
              hitSlop={8}
              onPress={onClose}
              style={({ pressed }) => [styles.closeButton, pressed && styles.pressed]}>
              <Ionicons color={theme.colors.textMuted} name="close" size={17} />
            </Pressable>
          </View>

          <View style={styles.optionList}>
            {APPEARANCE_OPTIONS.map((option) => {
              const selected = preference === option.preference;
              const effective = selected && option.preference !== 'system'
                ? option.preference
                : selected
                  ? effectiveColorScheme
                  : null;
              return (
                <Pressable
                  accessibilityHint={option.description}
                  accessibilityRole="radio"
                  accessibilityState={{ busy: isLoading || isSaving, checked: selected }}
                  disabled={isLoading || isSaving}
                  key={option.preference}
                  onPress={() => void handleSelect(option.preference)}
                  style={({ pressed }) => [
                    styles.option,
                    selected && styles.optionSelected,
                    pressed && styles.pressed,
                  ]}>
                  <View style={[styles.optionIcon, selected && styles.optionIconSelected]}>
                    <Ionicons
                      color={selected ? theme.colors.goldBright : theme.colors.textMuted}
                      name={option.icon}
                      size={18}
                    />
                  </View>
                  <View style={styles.optionCopy}>
                    <View style={styles.optionTitleLine}>
                      <Text style={[styles.optionTitle, { fontSize: responsiveFont(12) }]}>{option.label}</Text>
                      {selected ? <Text style={[styles.selectedLabel, { fontSize: responsiveFont(7) }]}>SELECTED</Text> : null}
                    </View>
                    <Text style={[styles.optionDescription, { fontSize: responsiveFont(9), lineHeight: responsiveLayout2.isWeb ? responsiveLayout2.webResponsiveFont(14) : 14 }]}>{option.description}</Text>
                    {effective ? <Text style={[styles.effectiveLabel, { fontSize: responsiveFont(7) }]}>ACTIVE NOW: {effective.toUpperCase()}</Text> : null}
                  </View>
                  <Ionicons
                    color={selected ? theme.colors.goldBright : theme.colors.textMuted}
                    name={selected ? 'checkmark-circle' : 'radio-button-off'}
                    size={18}
                  />
                </Pressable>
              );
            })}
          </View>

          {errorMessage ? (
            <Text accessibilityLiveRegion="polite" selectable style={[styles.error, { fontSize: responsiveFont(9) }]}>
              {errorMessage}
            </Text>
          ) : null}
        </View>
      </View>
    </Modal>
  );
}

function createResponsiveStyles(responsiveLayout: ReturnType<typeof useResponsiveLayout>) {
  const { responsiveFont, responsiveHeight, responsiveWidth } = responsiveLayout;
  const staticStyles = StyleSheet.create({
    backdrop: {
      flex: 1,
      justifyContent: 'flex-end',
      padding: 12,
      backgroundColor: theme.colors.scrim,
    },
    card: {
      width: '100%',
      gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(16) : 16,
      padding: 16,
      borderWidth: 1,
      borderColor: theme.colors.accentGoldBorder,
      borderRadius: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(18) : 18,
      backgroundColor: theme.colors.surface,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(12) : 12,
    },
    headerCopy: { flex: 1, gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(3) : 3 },
    eyebrow: {
      color: theme.colors.gold,
      fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(8) : 8,
      fontWeight: '900',
      letterSpacing: 1.4,
    },
    title: {
      color: theme.colors.text,
      fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(20) : 20,
      fontWeight: '900',
      letterSpacing: -0.25,
    },
    subtitle: {
      color: theme.colors.textMuted,
      fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(10) : 10,
      lineHeight: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(15) : 15,
    },
    closeButton: {
      alignItems: 'center',
      justifyContent: 'center',
      width: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(32) : 32,
      height: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(32) : 32,
      borderWidth: 1,
      borderColor: theme.colors.dividerStrong,
      borderRadius: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(10) : 10,
      backgroundColor: theme.colors.iconSurfaceGold,
    },
    optionList: { gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(8) : 8 },
    option: {
      minHeight: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(70) : 70,
      flexDirection: 'row',
      alignItems: 'center',
      gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(10) : 10,
      padding: 10,
      borderWidth: 1,
      borderColor: theme.colors.divider,
      borderRadius: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(13) : 13,
      backgroundColor: theme.colors.backgroundRaised,
    },
    optionSelected: {
      borderColor: theme.colors.accentGoldBorder,
      backgroundColor: theme.colors.iconSurfaceGold,
    },
    optionIcon: {
      alignItems: 'center',
      justifyContent: 'center',
      width: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(34) : 34,
      height: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(34) : 34,
      borderRadius: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(10) : 10,
      backgroundColor: theme.colors.iconSurface,
    },
    optionIconSelected: { backgroundColor: theme.colors.iconSurfaceGold },
    optionCopy: { flex: 1, gap: 2 },
    optionTitleLine: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(7) : 7,
    },
    optionTitle: {
      color: theme.colors.text,
      fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(12) : 12,
      fontWeight: '800',
    },
    selectedLabel: {
      color: theme.colors.gold,
      fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(7) : 7,
      fontWeight: '900',
      letterSpacing: 0.65,
    },
    optionDescription: {
      color: theme.colors.textMuted,
      fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(9) : 9,
      lineHeight: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(14) : 14,
    },
    effectiveLabel: {
      color: theme.colors.scannerCyan,
      fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(7) : 7,
      fontWeight: '900',
      letterSpacing: 0.65,
    },
    error: {
      color: theme.colors.danger,
      fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(9) : 9,
      lineHeight: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(14) : 14,
    },
    pressed: { opacity: 0.72 },
  });

  return {
    ...staticStyles,
    card: [
      staticStyles.card,
      {
        padding: responsiveWidth(16),
        borderRadius: responsiveWidth(18),
      },
    ],
    closeButton: [
      staticStyles.closeButton,
      {
        width: responsiveWidth(32),
        height: responsiveHeight(32),
      },
    ],
    option: [
      staticStyles.option,
      {
        minHeight: responsiveHeight(70),
      },
    ],
    optionIcon: [
      staticStyles.optionIcon,
      {
        width: responsiveWidth(34),
        height: responsiveHeight(34),
      },
    ],
    eyebrow: [staticStyles.eyebrow, { fontSize: responsiveFont(8) }],
    title: [staticStyles.title, { fontSize: responsiveFont(20) }],
    subtitle: [staticStyles.subtitle, { fontSize: responsiveFont(10) }],
    optionTitle: [staticStyles.optionTitle, { fontSize: responsiveFont(12) }],
    optionDescription: [staticStyles.optionDescription, { fontSize: responsiveFont(9) }],
    selectedLabel: [staticStyles.selectedLabel, { fontSize: responsiveFont(7) }],
    effectiveLabel: [staticStyles.effectiveLabel, { fontSize: responsiveFont(7) }],
    error: [staticStyles.error, { fontSize: responsiveFont(9) }],
  };
}
