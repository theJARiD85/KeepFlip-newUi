import { Pressable, StyleSheet, View } from 'react-native';

import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import { keepFlipTheme as theme } from '@/constants/keepflip-theme';
import { useResponsiveLayout , useResponsiveStyles} from '@/hooks/use-responsive-layout';
import { ledgerEntryDetails, type ResellerLedgerEntry } from '@/services/reseller-ledger-service';

function shortDate(value: string) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return 'Unknown date';
  return date.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatMoney(cents: number, currency: string) {
  try {
    return new Intl.NumberFormat('en-US', { currency, style: 'currency' }).format(cents / 100);
  } catch {
    return `$${(cents / 100).toFixed(2)}`;
  }
}

export function BooksRecordRow({ entry, itemName, onPress }: {
  entry: ResellerLedgerEntry;
  itemName: string | null;
  onPress: () => void;
}) {
  const responsiveStyles = useResponsiveStyles(createStylesWebResponsive);
  const { responsiveFont, responsiveWidth } = useResponsiveLayout();
  const details = ledgerEntryDetails(entry.entryType);
  const isIncome = entry.direction === 'income';
  const secondary = [shortDate(entry.occurredAt), entry.channel, itemName].filter(Boolean).join(' · ');

  return (
    <Pressable
      accessibilityHint="Opens the complete transaction record."
      accessibilityLabel={`${details.label}, ${formatMoney(entry.amountCents, entry.currency)}`}
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [responsiveStyles.row, pressed && responsiveStyles.pressed]}>
      <View style={[responsiveStyles.marker, { backgroundColor: isIncome ? theme.colors.scannerCyan : theme.colors.gold }]} />
      <View style={[responsiveStyles.dateColumn, { width: responsiveWidth(74) }]}>
        <Text style={[responsiveStyles.date, { fontSize: responsiveFont(10) }]}>{shortDate(entry.occurredAt)}</Text>
        <Text style={[responsiveStyles.source, { fontSize: responsiveFont(8) }]}>{entry.source.toUpperCase()}</Text>
      </View>
      <View style={responsiveStyles.copy}>
        <Text numberOfLines={1} style={[responsiveStyles.title, { fontSize: responsiveFont(12) }]}>{details.label}</Text>
        <Text numberOfLines={1} style={[responsiveStyles.secondary, { fontSize: responsiveFont(10) }]}>{entry.notes || secondary || 'Recorded Books transaction'}</Text>
      </View>
      <View style={[responsiveStyles.amountColumn, { minWidth: responsiveWidth(84) }]}>
        <Text style={[responsiveStyles.amount, { color: isIncome ? theme.colors.scannerCyan : theme.colors.goldBright, fontSize: responsiveFont(11) }]}>
          {isIncome ? '+' : '−'}{formatMoney(entry.amountCents, entry.currency)}
        </Text>
        <Text style={responsiveStyles.direction}>{isIncome ? 'IN' : 'OUT'}</Text>
      </View>
      <Ionicons color={theme.colors.textMuted} name="chevron.right" size={14} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  row: { alignItems: 'center', borderBottomColor: theme.colors.divider, borderBottomWidth: 1, flexDirection: 'row', gap: 10, minHeight: 62, paddingHorizontal: 10, paddingVertical: 9 },
  pressed: { backgroundColor: theme.colors.cardSoft },
  marker: { borderRadius: 2, height: 30, width: 3 },
  dateColumn: { gap: 3 },
  date: { color: theme.colors.text, fontWeight: '700' },
  source: { color: theme.colors.textMuted, fontFamily: theme.fonts.radar, letterSpacing: 0.65 },
  copy: { flex: 1, gap: 3, minWidth: 0 },
  title: { color: theme.colors.cream, fontWeight: '700' },
  secondary: { color: theme.colors.textMuted },
  amountColumn: { alignItems: 'flex-end', gap: 3 },
  amount: { fontVariant: ['tabular-nums'], fontWeight: '700' },
  direction: { color: theme.colors.textMuted, fontFamily: theme.fonts.radar, fontSize: 8 },
});

function createStylesWebResponsive(layout: ReturnType<typeof useResponsiveLayout>) {
  return StyleSheet.create({
    ...styles,
    row: {
      ...styles["row"],
      gap: layout.isWeb ? layout.webResponsiveWidth(10) : 10,
      minHeight: layout.isWeb ? layout.webResponsiveHeight(62) : 62,
      paddingHorizontal: layout.isWeb ? layout.webResponsiveWidth(10) : 10,
      paddingVertical: layout.isWeb ? layout.webResponsiveHeight(9) : 9,
    },
    marker: {
      ...styles["marker"],
      height: layout.isWeb ? layout.webResponsiveHeight(30) : 30,
      width: layout.isWeb ? layout.webResponsiveWidth(3) : 3,
    },
    dateColumn: {
      ...styles["dateColumn"],
      gap: layout.isWeb ? layout.webResponsiveWidth(3) : 3,
    },
    copy: {
      ...styles["copy"],
      gap: layout.isWeb ? layout.webResponsiveWidth(3) : 3,
    },
    amountColumn: {
      ...styles["amountColumn"],
      gap: layout.isWeb ? layout.webResponsiveWidth(3) : 3,
    },
    direction: {
      ...styles["direction"],
      fontSize: layout.isWeb ? layout.webResponsiveFont(8) : 8,
    },
  });
}
