import { Pressable, StyleSheet, View } from 'react-native';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import { keepFlipTheme as theme } from '@/constants/keepflip-theme';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
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
      style={({ pressed }) => [styles.row, pressed && styles.pressed]}>
      <View style={[styles.marker, { backgroundColor: isIncome ? theme.colors.scannerCyan : theme.colors.gold }]} />
      <View style={[styles.dateColumn, { width: responsiveWidth(74) }]}>
        <Text style={[styles.date, { fontSize: responsiveFont(10) }]}>{shortDate(entry.occurredAt)}</Text>
        <Text style={[styles.source, { fontSize: responsiveFont(8) }]}>{entry.source.toUpperCase()}</Text>
      </View>
      <View style={styles.copy}>
        <Text numberOfLines={1} style={[styles.title, { fontSize: responsiveFont(12) }]}>{details.label}</Text>
        <Text numberOfLines={1} style={[styles.secondary, { fontSize: responsiveFont(10) }]}>{entry.notes || secondary || 'Recorded Books transaction'}</Text>
      </View>
      <View style={[styles.amountColumn, { minWidth: responsiveWidth(84) }]}>
        <Text style={[styles.amount, { color: isIncome ? theme.colors.scannerCyan : theme.colors.goldBright, fontSize: responsiveFont(11) }]}>
          {isIncome ? '+' : '−'}{formatMoney(entry.amountCents, entry.currency)}
        </Text>
        <Text style={styles.direction}>{isIncome ? 'IN' : 'OUT'}</Text>
      </View>
      <IconSymbol color={theme.colors.textMuted} name="chevron.right" size={14} />
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
