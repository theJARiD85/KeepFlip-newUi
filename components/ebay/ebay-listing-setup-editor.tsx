import { Pressable, View } from 'react-native';

import { useResponsiveLayout, useResponsiveStyles } from '@/hooks/use-responsive-layout';
import {
  type EbaySellerBusinessPolicyOption,
  type EbaySellerInventoryLocationOption,
  type EbaySellerListingDefaults,
  type EbaySellerListingSetup,
} from '@/services/ebayConnectionService';

import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import { keepFlipTheme as theme } from '@/constants/keepflip-theme';

type Props = {
  setup: EbaySellerListingSetup;
  draft: EbaySellerListingDefaults;
  saving: boolean;
  onChange: (defaults: EbaySellerListingDefaults) => void;
  onSave: () => void;
};

const POLICY_GROUPS: {
  key: EbaySellerBusinessPolicyOption['policyType'];
  label: string;
  field: keyof EbaySellerListingDefaults;
  empty: string;
}[] = [
  {
    key: 'payment',
    label: 'PAYMENT POLICY',
    field: 'defaultPaymentPolicyId',
    empty: 'No payment policies were returned by eBay.',
  },
  {
    key: 'fulfillment',
    label: 'SHIPPING POLICY',
    field: 'defaultFulfillmentPolicyId',
    empty: 'No shipping policies were returned by eBay.',
  },
  {
    key: 'return',
    label: 'RETURN POLICY',
    field: 'defaultReturnPolicyId',
    empty: 'No return policies were returned by eBay.',
  },
];

function readable(value?: string) {
  if (!value) return '';
  return value
    .replace(/_/g, ' ')
    .toLowerCase()
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function policySummary(option: EbaySellerBusinessPolicyOption) {
  const details = [
    option.handlingTimeDays == null
      ? undefined
      : `${option.handlingTimeDays} business day${option.handlingTimeDays === 1 ? '' : 's'}`,
    option.returnPeriodDays == null
      ? undefined
      : `${option.returnPeriodDays}-day returns`,
    option.shippingOptionCount == null
      ? undefined
      : `${option.shippingOptionCount} shipping option${option.shippingOptionCount === 1 ? '' : 's'}`,
  ].filter(Boolean);
  return details.join(' · ');
}

function policyButtonLabel(option: EbaySellerBusinessPolicyOption) {
  return option.policyName || `${readable(option.policyType)} policy`;
}

function locationButtonLabel(option: EbaySellerInventoryLocationOption) {
  return option.locationName || option.merchantLocationKey;
}

function PolicyOption({
  option,
  selected,
  onPress,
}: {
  option: EbaySellerBusinessPolicyOption;
  selected: boolean;
  onPress: () => void;
}) {
  const styles = useResponsiveStyles(createResponsiveStyles);
  const { responsiveFont } = useResponsiveLayout();
  const summary = policySummary(option);

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${policyButtonLabel(option)}${selected ? ', selected' : ''}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.option,
        selected && styles.optionSelected,
        pressed && styles.optionPressed,
      ]}>
      <View style={[styles.radio, selected && styles.radioSelected]}>
        {selected ? <View style={styles.radioDot} /> : null}
      </View>
      <View style={styles.optionCopy}>
        <Text numberOfLines={1} style={[styles.optionTitle, { fontSize: responsiveFont(11) }]}>
          {policyButtonLabel(option)}
        </Text>
        <Text selectable style={[styles.optionMeta, { fontSize: responsiveFont(8) }]}>
          {option.policyId}
          {summary ? ` · ${summary}` : ''}
        </Text>
      </View>
    </Pressable>
  );
}

function LocationOption({
  option,
  selected,
  onPress,
}: {
  option: EbaySellerInventoryLocationOption;
  selected: boolean;
  onPress: () => void;
}) {
  const styles = useResponsiveStyles(createResponsiveStyles);
  const { responsiveFont } = useResponsiveLayout();

  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      accessibilityLabel={`${locationButtonLabel(option)}${selected ? ', selected' : ''}`}
      onPress={onPress}
      style={({ pressed }) => [
        styles.option,
        selected && styles.optionSelected,
        pressed && styles.optionPressed,
      ]}>
      <View style={[styles.radio, selected && styles.radioSelected]}>
        {selected ? <View style={styles.radioDot} /> : null}
      </View>
      <View style={styles.optionCopy}>
        <Text numberOfLines={1} style={[styles.optionTitle, { fontSize: responsiveFont(11) }]}>
          {locationButtonLabel(option)}
        </Text>
        <Text selectable style={[styles.optionMeta, { fontSize: responsiveFont(8) }]}>
          {option.merchantLocationKey}
          {[readable(option.locationType), option.countryCode, readable(option.locationStatus)]
            .filter(Boolean)
            .map((value) => ` · ${value}`)
            .join('')}
        </Text>
      </View>
    </Pressable>
  );
}

export function EbayListingSetupEditor({
  setup,
  draft,
  saving,
  onChange,
  onSave,
}: Props) {
  const styles = useResponsiveStyles(createResponsiveStyles);
  const { responsiveFont } = useResponsiveLayout();
  const complete = Object.values(draft).every((value) => Boolean(value));

  const update = (field: keyof EbaySellerListingDefaults, value: string) => {
    onChange({ ...draft, [field]: value });
  };

  return (
    <View style={styles.editor}>
      <Text style={[styles.editorTitle, { fontSize: responsiveFont(13) }]}>KEEPFLIP LISTING DEFAULTS</Text>
      <Text style={[styles.editorDescription, { fontSize: responsiveFont(10) }]}>
        Choose the eBay records KeepFlip will send when you publish an Inventory API offer. The IDs are read from your connected account and verified again before they are saved.
      </Text>

      {POLICY_GROUPS.map((group) => {
        const options = setup.policyOptions.filter((option) => option.policyType === group.key);
        return (
          <View key={group.key} style={styles.group}>
            <Text style={[styles.groupLabel, { fontSize: responsiveFont(8) }]}>{group.label}</Text>
            {options.length ? (
              options.map((option) => (
                <PolicyOption
                  key={option.policyId}
                  option={option}
                  selected={draft[group.field] === option.policyId}
                  onPress={() => update(group.field, option.policyId)}
                />
              ))
            ) : (
              <Text style={[styles.empty, { fontSize: responsiveFont(9) }]}>{group.empty}</Text>
            )}
          </View>
        );
      })}

      <View style={styles.group}>
        <Text style={[styles.groupLabel, { fontSize: responsiveFont(8) }]}>INVENTORY LOCATION</Text>
        {setup.locationOptions.length ? (
          setup.locationOptions.map((option) => (
            <LocationOption
              key={option.merchantLocationKey}
              option={option}
              selected={draft.defaultMerchantLocationKey === option.merchantLocationKey}
              onPress={() => update('defaultMerchantLocationKey', option.merchantLocationKey)}
            />
          ))
        ) : (
          <Text style={[styles.empty, { fontSize: responsiveFont(9) }]}>No inventory locations were returned by eBay.</Text>
        )}
      </View>

      <Text style={[styles.editorNote, { fontSize: responsiveFont(9) }]}>
        If a group is empty, create that policy or location in eBay Seller Hub first, reconnect if eBay asks for permission, then refresh seller details here.
      </Text>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Save KeepFlip listing defaults"
        accessibilityState={{ busy: saving, disabled: saving || !complete }}
        disabled={saving || !complete}
        onPress={onSave}
        style={({ pressed }) => [
          styles.saveButton,
          (!complete || saving) && styles.saveButtonDisabled,
          pressed && complete && !saving && styles.saveButtonPressed,
        ]}>
        <Text style={[styles.saveButtonText, { fontSize: responsiveFont(10) }]}>
          {saving ? 'VERIFYING WITH EBAY…' : 'SAVE LISTING DEFAULTS'}
        </Text>
      </Pressable>
    </View>
  );
}

function createResponsiveStyles(responsiveLayout: ReturnType<typeof useResponsiveLayout>) {
  const { responsiveHeight, responsiveWidth } = responsiveLayout;
  return {
    editor: {
      gap: responsiveHeight(10),
      paddingTop: responsiveHeight(12),
      marginTop: responsiveHeight(12),
      borderTopWidth: 1,
      borderTopColor: 'rgba(88, 223, 232, 0.12)',
    },
    editorTitle: {
      color: theme.colors.goldBright,
      fontWeight: '900' as const,
      letterSpacing: 1.1,
    },
    editorDescription: {
      color: theme.colors.textMuted,
      lineHeight: 15,
    },
    group: {
      gap: responsiveHeight(6),
    },
    groupLabel: {
      color: theme.colors.textMuted,
      fontWeight: '900' as const,
      letterSpacing: 1,
    },
    option: {
      minHeight: responsiveHeight(46),
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: responsiveWidth(10),
      paddingHorizontal: responsiveWidth(10),
      paddingVertical: responsiveHeight(7),
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.10)',
      borderRadius: 10,
      backgroundColor: 'rgba(255,255,255,0.025)',
    },
    optionSelected: {
      borderColor: 'rgba(88, 223, 232, 0.70)',
      backgroundColor: 'rgba(88, 223, 232, 0.08)',
    },
    optionPressed: {
      opacity: 0.78,
    },
    optionCopy: {
      flex: 1,
      gap: responsiveHeight(2),
    },
    optionTitle: {
      color: theme.colors.text,
      fontWeight: '800' as const,
    },
    optionMeta: {
      color: theme.colors.textMuted,
    },
    radio: {
      width: responsiveWidth(18),
      height: responsiveWidth(18),
      borderRadius: responsiveWidth(9),
      borderWidth: 1,
      borderColor: 'rgba(255,255,255,0.35)',
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    radioSelected: {
      borderColor: theme.colors.scannerCyan,
    },
    radioDot: {
      width: responsiveWidth(8),
      height: responsiveWidth(8),
      borderRadius: responsiveWidth(4),
      backgroundColor: theme.colors.scannerCyan,
    },
    empty: {
      color: theme.colors.textMuted,
      paddingVertical: responsiveHeight(4),
    },
    editorNote: {
      color: theme.colors.textMuted,
      lineHeight: 14,
    },
    saveButton: {
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      minHeight: responsiveHeight(42),
      paddingHorizontal: responsiveWidth(14),
      borderRadius: 10,
      backgroundColor: theme.colors.scannerCyan,
    },
    saveButtonDisabled: {
      opacity: 0.35,
    },
    saveButtonPressed: {
      opacity: 0.78,
    },
    saveButtonText: {
      color: theme.colors.backgroundDeep,
      fontWeight: '900' as const,
      letterSpacing: 0.8,
    },
  };
}
