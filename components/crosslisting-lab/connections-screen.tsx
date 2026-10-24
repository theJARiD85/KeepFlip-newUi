import { Ionicons } from '@react-native-vector-icons/ionicons';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import { brand } from '@/components/crosslisting-lab/brand';
import {
  channels,
  type MarketplaceConnectionStatus,
  type MarketplaceId,
} from '@/components/crosslisting-lab/types';
import { useResponsiveLayout, useResponsiveStyles } from '@/hooks/use-responsive-layout';

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
  const responsiveStyles = useResponsiveStyles(createStylesWebResponsive);
  const connectedCount = channels.filter((channel) => connectionStatuses?.[channel.id] === 'connected').length;

  const header = (
    <View style={responsiveStyles.headerContent}>
      <View style={responsiveStyles.brandRow}>
        <View style={responsiveStyles.brandMark}><Text style={responsiveStyles.brandLetter}>K</Text></View>
        <View style={responsiveStyles.brandCopy}>
          <Text style={responsiveStyles.brandName}>KEEPFLIP</Text>
          <Text style={responsiveStyles.brandLabel}>CROSSLISTING LAB</Text>
        </View>
        <View style={responsiveStyles.previewPill}><View style={responsiveStyles.previewDot} /><Text style={responsiveStyles.previewText}>PROTOTYPE</Text></View>
      </View>

      <Text style={responsiveStyles.eyebrow}>MARKETPLACE / CONNECTIONS</Text>
      <Text style={responsiveStyles.heading}>Your marketplaces</Text>
      <Text style={responsiveStyles.subtitle}>See which marketplaces are connected as the listing flows are built out.</Text>

      <View style={responsiveStyles.overviewCard}>
        <View style={responsiveStyles.overviewIcon}>
          <Ionicons color={brand.colors.cyan} name="link-outline" size={23} />
        </View>
        <View style={responsiveStyles.overviewCopy}>
          <Text style={responsiveStyles.overviewTitle}>{connectedCount} of {channels.length} saved</Text>
          <Text style={responsiveStyles.overviewBody}>Saved access is encrypted. A listing run still needs review.</Text>
        </View>
      </View>

      <View style={responsiveStyles.noticeCard}>
        <Text style={responsiveStyles.noticeTitle}>Prototype status</Text>
        <Text style={responsiveStyles.noticeBody}>{onOpenConnection ? 'Open a channel to save test access. Browser adapters and their form mappings still need live validation.' : 'These cards preview the marketplace paths. Sign in to save test access.'}</Text>
      </View>

      <View style={responsiveStyles.sectionHeading}>
        <Text style={responsiveStyles.eyebrow}>SUPPORTED PATHS</Text>
        <Text style={responsiveStyles.sectionTitle}>Marketplace channels</Text>
      </View>
      {loadError ? (
        <View style={responsiveStyles.errorCard}>
          <Text style={responsiveStyles.errorTitle}>Connections unavailable</Text>
          <Text style={responsiveStyles.errorBody}>{loadError}</Text>
          {onRetry ? <Pressable accessibilityRole="button" onPress={onRetry} style={responsiveStyles.retryButton}><Text style={responsiveStyles.retryText}>Try again</Text></Pressable> : null}
        </View>
      ) : null}
    </View>
  );

  return (
    <SafeAreaView edges={['top']} style={responsiveStyles.safeArea}>
      <FlatList
        contentContainerStyle={responsiveStyles.listContent}
        data={isLoading || loadError ? [] : channels}
        initialNumToRender={7}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={header}
        ListEmptyComponent={isLoading ? (
          <View style={responsiveStyles.loadingCard}><ActivityIndicator color={brand.colors.goldBright} /><Text style={responsiveStyles.loadingText}>Loading connections…</Text></View>
        ) : null}
        ListFooterComponent={<Text style={responsiveStyles.footer}>Listings are queued one marketplace at a time. Automatic sale detection and global delisting are not active in this prototype.</Text>}
        renderItem={({ item }) => {
          const status = connectionStatuses?.[item.id] ?? 'disconnected';
          return (
            <Pressable accessibilityRole="button" accessibilityLabel={`${item.name} connection`} disabled={!onOpenConnection} onPress={() => onOpenConnection?.(item.id)} style={({ pressed }) => [responsiveStyles.channelCard, pressed && responsiveStyles.channelPressed]}>
              <View style={responsiveStyles.channelMark}><Text style={responsiveStyles.channelInitial}>{item.name[0].toUpperCase()}</Text></View>
              <View style={responsiveStyles.channelCopy}>
                <View style={responsiveStyles.channelTitleRow}>
                  <Text numberOfLines={1} style={responsiveStyles.channelName}>{item.name}</Text>
                  <Text style={responsiveStyles.channelType}>{item.type}</Text>
                </View>
                <Text style={responsiveStyles.channelMethod}>{item.method}</Text>
                <View style={[responsiveStyles.statusPill, status === 'connected' && responsiveStyles.connectedPill, status === 'attention' && responsiveStyles.attentionPill]}>
                  <View style={[responsiveStyles.statusDot, status === 'connected' && responsiveStyles.connectedDot, status === 'attention' && responsiveStyles.attentionDot]} />
                  <Text style={[responsiveStyles.statusText, status === 'connected' && responsiveStyles.connectedText, status === 'attention' && responsiveStyles.attentionText]}>{statusLabels[status]}</Text>
                </View>
              </View>
              {onOpenConnection ? <Ionicons color={brand.colors.cyan} name="chevron-forward" size={16} style={responsiveStyles.channelArrow} /> : null}
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

function createStylesWebResponsive(layout: ReturnType<typeof useResponsiveLayout>) {
  return StyleSheet.create({
    ...styles,
    listContent: {
      ...styles["listContent"],
      paddingHorizontal: layout.isWideWeb ? layout.webResponsiveWidth(16) : layout.responsiveWidth(16),
      paddingBottom: layout.isWideWeb ? layout.webResponsiveHeight(32) : layout.responsiveHeight(32),
    },
    headerContent: {
      ...styles["headerContent"],
      maxWidth: layout.isWideWeb ? layout.webResponsiveWidth(760) : layout.responsiveWidth(760),
    },
    brandRow: {
      ...styles["brandRow"],
      paddingTop: layout.isWideWeb ? layout.webResponsiveHeight(15) : layout.responsiveHeight(15),
      paddingBottom: layout.isWideWeb ? layout.webResponsiveHeight(24) : layout.responsiveHeight(24),
      gap: layout.isWideWeb ? layout.webResponsiveWidth(10) : layout.responsiveWidth(10),
    },
    brandMark: {
      ...styles["brandMark"],
      width: layout.isWideWeb ? layout.webResponsiveWidth(38) : layout.responsiveWidth(38),
      height: layout.isWideWeb ? layout.webResponsiveHeight(38) : layout.responsiveHeight(38),
      borderRadius: layout.isWideWeb ? layout.webResponsiveWidth(13) : layout.responsiveWidth(13),
    },
    brandLetter: {
      ...styles["brandLetter"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(23) : layout.responsiveFont(23),
    },
    brandName: {
      ...styles["brandName"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(14) : layout.responsiveFont(14),
    },
    brandLabel: {
      ...styles["brandLabel"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(9) : layout.responsiveFont(9),
    },
    previewPill: {
      ...styles["previewPill"],
      gap: layout.isWideWeb ? layout.webResponsiveWidth(6) : layout.responsiveWidth(6),
      paddingHorizontal: layout.isWideWeb ? layout.webResponsiveWidth(9) : layout.responsiveWidth(9),
      paddingVertical: layout.isWideWeb ? layout.webResponsiveHeight(7) : layout.responsiveHeight(7),
    },
    previewDot: {
      ...styles["previewDot"],
      width: layout.isWideWeb ? layout.webResponsiveWidth(6) : layout.responsiveWidth(6),
      height: layout.isWideWeb ? layout.webResponsiveHeight(6) : layout.responsiveHeight(6),
      borderRadius: layout.isWideWeb ? layout.webResponsiveWidth(3) : layout.responsiveWidth(3),
    },
    previewText: {
      ...styles["previewText"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(9) : layout.responsiveFont(9),
    },
    eyebrow: {
      ...styles["eyebrow"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(9) : layout.responsiveFont(9),
    },
    heading: {
      ...styles["heading"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(29) : layout.responsiveFont(29),
      lineHeight: layout.isWideWeb ? layout.webResponsiveFont(34) : layout.responsiveFont(34),
      marginTop: layout.isWideWeb ? layout.webResponsiveHeight(5) : layout.responsiveHeight(5),
    },
    subtitle: {
      ...styles["subtitle"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(13) : layout.responsiveFont(13),
      lineHeight: layout.isWideWeb ? layout.webResponsiveFont(19) : layout.responsiveFont(19),
      maxWidth: layout.isWideWeb ? layout.webResponsiveWidth(560) : layout.responsiveWidth(560),
      marginTop: layout.isWideWeb ? layout.webResponsiveHeight(5) : layout.responsiveHeight(5),
    },
    overviewCard: {
      ...styles["overviewCard"],
      gap: layout.isWideWeb ? layout.webResponsiveWidth(12) : layout.responsiveWidth(12),
      marginTop: layout.isWideWeb ? layout.webResponsiveHeight(20) : layout.responsiveHeight(20),
    },
    overviewIcon: {
      ...styles["overviewIcon"],
      width: layout.isWideWeb ? layout.webResponsiveWidth(45) : layout.responsiveWidth(45),
      height: layout.isWideWeb ? layout.webResponsiveHeight(45) : layout.responsiveHeight(45),
    },
    overviewTitle: {
      ...styles["overviewTitle"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(16) : layout.responsiveFont(16),
    },
    overviewBody: {
      ...styles["overviewBody"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(11) : layout.responsiveFont(11),
      lineHeight: layout.isWideWeb ? layout.webResponsiveFont(16) : layout.responsiveFont(16),
      marginTop: layout.isWideWeb ? layout.webResponsiveHeight(3) : layout.responsiveHeight(3),
    },
    noticeCard: {
      ...styles["noticeCard"],
      marginTop: layout.isWideWeb ? layout.webResponsiveHeight(12) : layout.responsiveHeight(12),
    },
    noticeTitle: {
      ...styles["noticeTitle"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(12) : layout.responsiveFont(12),
    },
    noticeBody: {
      ...styles["noticeBody"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(11) : layout.responsiveFont(11),
      lineHeight: layout.isWideWeb ? layout.webResponsiveFont(17) : layout.responsiveFont(17),
      marginTop: layout.isWideWeb ? layout.webResponsiveHeight(3) : layout.responsiveHeight(3),
    },
    sectionHeading: {
      ...styles["sectionHeading"],
      gap: layout.isWideWeb ? layout.webResponsiveWidth(4) : layout.responsiveWidth(4),
      marginTop: layout.isWideWeb ? layout.webResponsiveHeight(26) : layout.responsiveHeight(26),
      marginBottom: layout.isWideWeb ? layout.webResponsiveHeight(12) : layout.responsiveHeight(12),
    },
    sectionTitle: {
      ...styles["sectionTitle"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(20) : layout.responsiveFont(20),
    },
    errorCard: {
      ...styles["errorCard"],
      marginBottom: layout.isWideWeb ? layout.webResponsiveHeight(12) : layout.responsiveHeight(12),
    },
    errorTitle: {
      ...styles["errorTitle"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(14) : layout.responsiveFont(14),
    },
    errorBody: {
      ...styles["errorBody"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(12) : layout.responsiveFont(12),
      lineHeight: layout.isWideWeb ? layout.webResponsiveFont(18) : layout.responsiveFont(18),
      marginTop: layout.isWideWeb ? layout.webResponsiveHeight(4) : layout.responsiveHeight(4),
    },
    retryButton: {
      ...styles["retryButton"],
      paddingVertical: layout.isWideWeb ? layout.webResponsiveHeight(8) : layout.responsiveHeight(8),
      marginTop: layout.isWideWeb ? layout.webResponsiveHeight(5) : layout.responsiveHeight(5),
    },
    retryText: {
      ...styles["retryText"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(12) : layout.responsiveFont(12),
    },
    loadingCard: {
      ...styles["loadingCard"],
      maxWidth: layout.isWideWeb ? layout.webResponsiveWidth(760) : layout.responsiveWidth(760),
      gap: layout.isWideWeb ? layout.webResponsiveWidth(8) : layout.responsiveWidth(8),
    },
    loadingText: {
      ...styles["loadingText"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(12) : layout.responsiveFont(12),
    },
    channelCard: {
      ...styles["channelCard"],
      maxWidth: layout.isWideWeb ? layout.webResponsiveWidth(760) : layout.responsiveWidth(760),
      gap: layout.isWideWeb ? layout.webResponsiveWidth(12) : layout.responsiveWidth(12),
      marginBottom: layout.isWideWeb ? layout.webResponsiveHeight(10) : layout.responsiveHeight(10),
    },
    channelArrow: {
      ...styles["channelArrow"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(25) : layout.responsiveFont(25),
    },
    channelMark: {
      ...styles["channelMark"],
      width: layout.isWideWeb ? layout.webResponsiveWidth(46) : layout.responsiveWidth(46),
      height: layout.isWideWeb ? layout.webResponsiveHeight(46) : layout.responsiveHeight(46),
    },
    channelInitial: {
      ...styles["channelInitial"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(19) : layout.responsiveFont(19),
    },
    channelTitleRow: {
      ...styles["channelTitleRow"],
      gap: layout.isWideWeb ? layout.webResponsiveWidth(8) : layout.responsiveWidth(8),
    },
    channelName: {
      ...styles["channelName"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(15) : layout.responsiveFont(15),
    },
    channelType: {
      ...styles["channelType"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(9) : layout.responsiveFont(9),
    },
    channelMethod: {
      ...styles["channelMethod"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(11) : layout.responsiveFont(11),
      lineHeight: layout.isWideWeb ? layout.webResponsiveFont(16) : layout.responsiveFont(16),
      marginTop: layout.isWideWeb ? layout.webResponsiveHeight(3) : layout.responsiveHeight(3),
    },
    statusPill: {
      ...styles["statusPill"],
      gap: layout.isWideWeb ? layout.webResponsiveWidth(5) : layout.responsiveWidth(5),
      paddingHorizontal: layout.isWideWeb ? layout.webResponsiveWidth(9) : layout.responsiveWidth(9),
      paddingVertical: layout.isWideWeb ? layout.webResponsiveHeight(5) : layout.responsiveHeight(5),
      marginTop: layout.isWideWeb ? layout.webResponsiveHeight(8) : layout.responsiveHeight(8),
    },
    statusDot: {
      ...styles["statusDot"],
      width: layout.isWideWeb ? layout.webResponsiveWidth(6) : layout.responsiveWidth(6),
      height: layout.isWideWeb ? layout.webResponsiveHeight(6) : layout.responsiveHeight(6),
      borderRadius: layout.isWideWeb ? layout.webResponsiveWidth(3) : layout.responsiveWidth(3),
    },
    statusText: {
      ...styles["statusText"],
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(10) : layout.responsiveFont(10),
    },
    footer: {
      ...styles["footer"],
      maxWidth: layout.isWideWeb ? layout.webResponsiveWidth(760) : layout.responsiveWidth(760),
      fontSize: layout.isWideWeb ? layout.webResponsiveFont(11) : layout.responsiveFont(11),
      lineHeight: layout.isWideWeb ? layout.webResponsiveFont(17) : layout.responsiveFont(17),
      paddingVertical: layout.isWideWeb ? layout.webResponsiveHeight(8) : layout.responsiveHeight(8),
    },
  });
}
