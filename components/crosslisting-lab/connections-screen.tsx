import { SymbolView } from 'expo-symbols';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import { brand } from '@/components/crosslisting-lab/brand';
import {
  channels,
  type MarketplaceConnectionStatus,
  type MarketplaceId,
} from '@/components/crosslisting-lab/types';

/** Connection state is loaded from the isolated Appwrite lab API. */
export interface ConnectionsScreenProps {
  connectionStatuses?: Partial<Record<MarketplaceId, MarketplaceConnectionStatus>>;
  isLoading?: boolean;
  loadError?: string | null;
  onRetry?: () => void;
  onOpenConnection?: (platform: MarketplaceId) => void;
}

const statusLabels: Record<MarketplaceConnectionStatus, string> = {
  connected: 'Saved for testing',
  disconnected: 'Not connected',
  attention: 'Needs attention',
};

export function ConnectionsScreen({
  connectionStatuses,
  isLoading = false,
  loadError = null,
  onRetry,
  onOpenConnection,
}: ConnectionsScreenProps) {
  const connectedCount = channels.filter((channel) => connectionStatuses?.[channel.id] === 'connected').length;

  const header = (
    <View style={styles.headerContent}>
      <View style={styles.brandRow}>
        <View style={styles.brandMark}><Text style={styles.brandLetter}>K</Text></View>
        <View style={styles.brandCopy}>
          <Text style={styles.brandName}>KEEPFLIP</Text>
          <Text style={styles.brandLabel}>CROSSLISTING LAB</Text>
        </View>
        <View style={styles.previewPill}><View style={styles.previewDot} /><Text style={styles.previewText}>PROTOTYPE</Text></View>
      </View>

      <Text style={styles.eyebrow}>MARKETPLACE / CONNECTIONS</Text>
      <Text style={styles.heading}>Your marketplaces</Text>
      <Text style={styles.subtitle}>See which marketplaces are connected as the listing flows are built out.</Text>

      <View style={styles.overviewCard}>
        <View style={styles.overviewIcon}>
          <SymbolView name={{ ios: 'link', android: 'link', web: 'link' }} size={23} tintColor={brand.colors.cyan} />
        </View>
        <View style={styles.overviewCopy}>
          <Text style={styles.overviewTitle}>{connectedCount} of {channels.length} saved</Text>
          <Text style={styles.overviewBody}>Saved access is encrypted. A listing run still needs review.</Text>
        </View>
      </View>

      <View style={styles.noticeCard}>
        <Text style={styles.noticeTitle}>Prototype status</Text>
        <Text style={styles.noticeBody}>{onOpenConnection ? 'Open a channel to save test access. Browser adapters and their form mappings still need live validation.' : 'These cards preview the marketplace paths. Sign in to save test access.'}</Text>
      </View>

      <View style={styles.sectionHeading}>
        <Text style={styles.eyebrow}>SUPPORTED PATHS</Text>
        <Text style={styles.sectionTitle}>Marketplace channels</Text>
      </View>
      {loadError ? (
        <View style={styles.errorCard}>
          <Text style={styles.errorTitle}>Connections unavailable</Text>
          <Text style={styles.errorBody}>{loadError}</Text>
          {onRetry ? <Pressable accessibilityRole="button" onPress={onRetry} style={styles.retryButton}><Text style={styles.retryText}>Try again</Text></Pressable> : null}
        </View>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <FlatList
        contentContainerStyle={styles.listContent}
        data={isLoading || loadError ? [] : channels}
        initialNumToRender={7}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={header}
        ListEmptyComponent={isLoading ? (
          <View style={styles.loadingCard}><ActivityIndicator color={brand.colors.goldBright} /><Text style={styles.loadingText}>Loading connections…</Text></View>
        ) : null}
        ListFooterComponent={<Text style={styles.footer}>Listings are queued one marketplace at a time. Automatic sale detection and global delisting are not active in this prototype.</Text>}
        renderItem={({ item }) => {
          const status = connectionStatuses?.[item.id] ?? 'disconnected';
          return (
            <Pressable accessibilityRole="button" accessibilityLabel={`${item.name} connection`} disabled={!onOpenConnection} onPress={() => onOpenConnection?.(item.id)} style={({ pressed }) => [styles.channelCard, pressed && styles.channelPressed]}>
              <View style={styles.channelMark}><Text style={styles.channelInitial}>{item.name[0].toUpperCase()}</Text></View>
              <View style={styles.channelCopy}>
                <View style={styles.channelTitleRow}>
                  <Text numberOfLines={1} style={styles.channelName}>{item.name}</Text>
                  <Text style={styles.channelType}>{item.type}</Text>
                </View>
                <Text style={styles.channelMethod}>{item.method}</Text>
                <View style={[styles.statusPill, status === 'connected' && styles.connectedPill, status === 'attention' && styles.attentionPill]}>
                  <View style={[styles.statusDot, status === 'connected' && styles.connectedDot, status === 'attention' && styles.attentionDot]} />
                  <Text style={[styles.statusText, status === 'connected' && styles.connectedText, status === 'attention' && styles.attentionText]}>{statusLabels[status]}</Text>
                </View>
              </View>
              {onOpenConnection ? <Text style={styles.channelArrow}>›</Text> : null}
            </Pressable>
          );
        }}
        maxToRenderPerBatch={7}
        windowSize={5}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: { flex: 1, backgroundColor: brand.colors.background },
  listContent: { paddingHorizontal: 16, paddingBottom: 32 },
  headerContent: { width: '100%', maxWidth: 760, alignSelf: 'center' },
  brandRow: { flexDirection: 'row', alignItems: 'center', paddingTop: 15, paddingBottom: 24, gap: 10 },
  brandMark: { width: 38, height: 38, borderRadius: 13, backgroundColor: brand.colors.goldSurface, borderWidth: 1, borderColor: brand.colors.borderStrong, alignItems: 'center', justifyContent: 'center' },
  brandLetter: { color: brand.colors.goldBright, fontSize: 23, fontWeight: '900' },
  brandCopy: { flex: 1, gap: 2 },
  brandName: { color: brand.colors.text, fontSize: 14, fontWeight: '900', letterSpacing: 2.1 },
  brandLabel: { color: brand.colors.gold, fontSize: 9, fontWeight: '800', letterSpacing: 1.4 },
  previewPill: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 9, paddingVertical: 7, borderRadius: brand.radii.pill, backgroundColor: brand.colors.cyanSurface, borderWidth: 1, borderColor: 'rgba(88, 223, 232, 0.35)' },
  previewDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: brand.colors.cyan },
  previewText: { color: brand.colors.cyan, fontSize: 9, fontWeight: '900', letterSpacing: 0.8 },
  eyebrow: { color: brand.colors.gold, fontSize: 9, fontWeight: '900', letterSpacing: 1.5 },
  heading: { color: brand.colors.text, fontSize: 29, lineHeight: 34, fontWeight: '900', letterSpacing: -0.5, marginTop: 5 },
  subtitle: { color: brand.colors.textMuted, fontSize: 13, lineHeight: 19, maxWidth: 560, marginTop: 5 },
  overviewCard: { flexDirection: 'row', alignItems: 'center', gap: 12, borderRadius: brand.radii.medium, borderWidth: 1, borderColor: brand.colors.borderStrong, backgroundColor: brand.colors.card, padding: 15, marginTop: 20 },
  overviewIcon: { width: 45, height: 45, borderRadius: brand.radii.small, backgroundColor: brand.colors.cyanSurface, alignItems: 'center', justifyContent: 'center' },
  overviewCopy: { flex: 1 },
  overviewTitle: { color: brand.colors.text, fontSize: 16, fontWeight: '900' },
  overviewBody: { color: brand.colors.textMuted, fontSize: 11, lineHeight: 16, marginTop: 3 },
  noticeCard: { backgroundColor: brand.colors.goldSurface, borderLeftWidth: 3, borderLeftColor: brand.colors.gold, padding: 13, borderTopRightRadius: brand.radii.small, borderBottomRightRadius: brand.radii.small, marginTop: 12 },
  noticeTitle: { color: brand.colors.goldBright, fontSize: 12, fontWeight: '900' },
  noticeBody: { color: brand.colors.textMuted, fontSize: 11, lineHeight: 17, marginTop: 3 },
  sectionHeading: { gap: 4, marginTop: 26, marginBottom: 12 },
  sectionTitle: { color: brand.colors.text, fontSize: 20, fontWeight: '900' },
  errorCard: { backgroundColor: brand.colors.dangerSurface, borderRadius: brand.radii.small, borderWidth: 1, borderColor: brand.colors.danger, padding: 14, marginBottom: 12 },
  errorTitle: { color: brand.colors.text, fontSize: 14, fontWeight: '800' },
  errorBody: { color: brand.colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: 4 },
  retryButton: { alignSelf: 'flex-start', paddingVertical: 8, marginTop: 5 },
  retryText: { color: brand.colors.goldBright, fontSize: 12, fontWeight: '800' },
  loadingCard: { width: '100%', maxWidth: 760, alignSelf: 'center', backgroundColor: brand.colors.card, borderRadius: brand.radii.medium, borderWidth: 1, borderColor: brand.colors.border, padding: 22, alignItems: 'center', gap: 8 },
  loadingText: { color: brand.colors.textMuted, fontSize: 12 },
  channelCard: { width: '100%', maxWidth: 760, alignSelf: 'center', flexDirection: 'row', gap: 12, backgroundColor: brand.colors.card, borderRadius: brand.radii.medium, borderWidth: 1, borderColor: brand.colors.border, padding: 14, marginBottom: 10 },
  channelPressed: { opacity: 0.8 },
  channelArrow: { color: brand.colors.goldBright, fontSize: 25, alignSelf: 'center' },
  channelMark: { width: 46, height: 46, borderRadius: brand.radii.small, backgroundColor: brand.colors.goldSurface, alignItems: 'center', justifyContent: 'center' },
  channelInitial: { color: brand.colors.goldBright, fontSize: 19, fontWeight: '900' },
  channelCopy: { flex: 1, minWidth: 0, alignItems: 'flex-start' },
  channelTitleRow: { width: '100%', flexDirection: 'row', alignItems: 'center', gap: 8 },
  channelName: { flex: 1, minWidth: 0, color: brand.colors.text, fontSize: 15, fontWeight: '900' },
  channelType: { color: brand.colors.cyan, fontSize: 9, fontWeight: '900', letterSpacing: 0.5 },
  channelMethod: { color: brand.colors.textMuted, fontSize: 11, lineHeight: 16, marginTop: 3 },
  statusPill: { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: brand.colors.inset, borderRadius: brand.radii.pill, paddingHorizontal: 9, paddingVertical: 5, marginTop: 8 },
  statusDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: brand.colors.textMuted },
  statusText: { color: brand.colors.textMuted, fontSize: 10, fontWeight: '800' },
  connectedPill: { backgroundColor: brand.colors.successSurface },
  connectedDot: { backgroundColor: brand.colors.success },
  connectedText: { color: brand.colors.success },
  attentionPill: { backgroundColor: brand.colors.dangerSurface },
  attentionDot: { backgroundColor: brand.colors.danger },
  attentionText: { color: brand.colors.danger },
  footer: { width: '100%', maxWidth: 760, alignSelf: 'center', color: brand.colors.textMuted, fontSize: 11, lineHeight: 17, paddingVertical: 8 },
});
