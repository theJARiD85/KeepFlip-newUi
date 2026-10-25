import { Image } from "expo-image";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";

import { Ionicons } from '@react-native-vector-icons/ionicons';
import { KeepFlipText as Text } from "@/components/ui/keepflip-text";
import { keepFlipTheme as theme } from "@/constants/keepflip-theme";
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import type { EbayBarcodeLookupResult } from "@/services/ebaySoldCompsService";
import { neutralizeMarketplaceBrand } from "@/services/market-copy";

import { useResponsiveStyles } from '@/hooks/use-responsive-layout';
export type BarcodeLookupOverlayState =
  | { phase: "idle" }
  | { phase: "searching"; barcode: string }
  | { phase: "result"; result: EbayBarcodeLookupResult }
  | { phase: "error"; barcode: string | null; message: string };

type BarcodeLookupOverlayProps = {
  bottomInset: number;
  onDismiss: () => void;
  onScanAgain: () => void;
  state: BarcodeLookupOverlayState;
  topInset: number;
};

function detailRows(result: EbayBarcodeLookupResult) {
  const product = result.product;
  if (!product) return [];

  return [
    product.brand ? ["Brand", neutralizeMarketplaceBrand(product.brand)] : null,
    product.model ? ["Model", neutralizeMarketplaceBrand(product.model)] : null,
    product.category
      ? ["Category", neutralizeMarketplaceBrand(product.category)]
      : null,
  ].filter((row): row is [string, string] => row != null);
}

export function BarcodeLookupOverlay({
  bottomInset,
  onDismiss,
  onScanAgain,
  state,
  topInset,
}: BarcodeLookupOverlayProps) {
  const responsiveLayout2 = useResponsiveLayout();
  const styles = useResponsiveStyles(createResponsiveStyles);
  const {
    responsiveFont
  } = useResponsiveLayout();

  const result = state.phase === "result" ? state.result : null;
  const product = result?.product ?? null;
  const isSearching = state.phase === "searching";
  const barcode =
    state.phase === "result"
      ? state.result.barcode
      : state.phase === "idle"
        ? null
        : state.barcode;
  const rows = result ? detailRows(result) : [];
  const relatedListingCount = result?.matches.length ?? 0;

  return (
    <Animated.View
      accessibilityViewIsModal
      entering={FadeIn.duration(180)}
      exiting={FadeOut.duration(140)}
      style={[styles.root, { paddingTop: topInset + 16, paddingBottom: bottomInset + 16 }]}
    >
      <View pointerEvents="none" style={styles.atmosphere} />

      <View style={styles.header}>
        <View style={styles.headerCopy}>
          <Text style={[styles.eyebrow, { fontSize: responsiveFont(10) }]}>BARCODE LOOKUP</Text>
          <Text style={[styles.headerTitle, { fontSize: responsiveFont(23) }]}>
            {isSearching
              ? "Checking..."
              : product
                ? "Product match found"
                : "No confirmed match"}
          </Text>
        </View>
        <Pressable
          accessibilityLabel="Close barcode lookup"
          accessibilityRole="button"
          disabled={isSearching}
          onPress={onDismiss}
          style={({ pressed }) => [
            styles.closeButton,
            pressed && styles.pressed,
            isSearching && styles.disabled,
          ]}
        >
          <Ionicons color={theme.colors.cream} name="close" size={20} />
        </Pressable>
      </View>

      <View style={styles.content}>
        <View style={styles.codePill}>
          <Ionicons
            color={theme.colors.scannerViolet}
            name="barcode-outline"
            size={18}
          />
          <Text selectable style={[styles.codeText, { fontSize: responsiveFont(12) }]}>
            {barcode || "SCANNED CODE"}
          </Text>
        </View>

        {isSearching ? (
          <View style={styles.loadingState}>
            <View style={styles.loadingIcon}>
              <ActivityIndicator color={theme.colors.scannerCyan} />
            </View>
            <Text style={[styles.title, { fontSize: responsiveFont(21) }]}>Finding the matching product</Text>
            <Text style={[styles.body, { fontSize: responsiveFont(14), lineHeight: responsiveLayout2.isWeb ? responsiveLayout2.webResponsiveFont(21) : responsiveLayout2.responsiveFont(21) }]}>
              KeepFlip is checking this code against current market evidence. Your photo-analysis tools remain separate from this search.
            </Text>
          </View>
        ) : product ? (
          <View style={styles.resultState}>
            {product.imageUrl ? (
              <Image
                contentFit="cover"
                source={{ uri: product.imageUrl }}
                style={styles.productImage}
              />
            ) : (
              <View style={styles.productImageFallback}>
                <Ionicons
                  color={theme.colors.scannerCyan}
                  name="barcode-outline"
                  size={34}
                />
              </View>
            )}

            <View style={styles.productCopy}>
              <Text selectable style={[styles.title, { fontSize: responsiveFont(21) }]}>
                {neutralizeMarketplaceBrand(product.title)}
              </Text>
              <Text selectable style={[styles.body, { fontSize: responsiveFont(14), lineHeight: responsiveLayout2.isWeb ? responsiveLayout2.webResponsiveFont(21) : responsiveLayout2.responsiveFont(21) }]}>
                {neutralizeMarketplaceBrand(product.description)}
              </Text>
            </View>

            {rows.length > 0 ? (
              <View style={styles.details}>
                {rows.map(([label, value]) => (
                  <View key={label} style={styles.detailRow}>
                    <Text style={[styles.detailLabel, { fontSize: responsiveFont(11) }]}>{label}</Text>
                    <Text selectable style={[styles.detailValue, { fontSize: responsiveFont(13) }]}>
                      {value}
                    </Text>
                  </View>
                ))}
              </View>
            ) : null}

            <Text style={styles.evidenceNote}>
              {relatedListingCount > 0
                ? `${relatedListingCount} related listing${relatedListingCount === 1 ? "" : "s"} found. Confirm the item condition before relying on any price.`
                : "Confirm the item condition before relying on any price."}
            </Text>
          </View>
        ) : (
          <View style={styles.loadingState}>
            <View style={styles.loadingIcon}>
              <Ionicons
                color={theme.colors.goldBright}
                name="barcode-outline"
                size={32}
              />
            </View>
            <Text style={[styles.title, { fontSize: responsiveFont(21) }]}>
              {state.phase === "error" ? "Lookup needs another try" : "No product match yet"}
            </Text>
            <Text style={[styles.body, { fontSize: responsiveFont(14), lineHeight: responsiveLayout2.isWeb ? responsiveLayout2.webResponsiveFont(21) : responsiveLayout2.responsiveFont(21) }]}>
              {state.phase === "error"
                ? neutralizeMarketplaceBrand(state.message)
                : "Scan the full code again in bright, even light. UPC, EAN, ISBN, and product codes work best."}
            </Text>
          </View>
        )}
      </View>

      {!isSearching ? (
        <View style={styles.actions}>
          <Pressable
            accessibilityLabel="Scan another barcode"
            accessibilityRole="button"
            onPress={onScanAgain}
            style={({ pressed }) => [styles.primaryAction, pressed && styles.pressed]}
          >
            <Ionicons
              color={theme.colors.background}
              name="barcode-outline"
              size={20}
            />
            <Text style={[styles.primaryActionText, { fontSize: responsiveFont(15) }]}>Scan another code</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="Back to scanner tools"
            accessibilityRole="button"
            onPress={onDismiss}
            style={({ pressed }) => [styles.secondaryAction, pressed && styles.pressed]}
          >
            <Text style={[styles.secondaryActionText, { fontSize: responsiveFont(14) }]}>Back to tools</Text>
          </Pressable>
        </View>
      ) : null}
    </Animated.View>
  );
}

function createResponsiveStyles(responsiveLayout: ReturnType<typeof useResponsiveLayout>) {
  const { responsiveFont, responsiveWidth, responsiveHeight } = responsiveLayout;
  const staticStyles = StyleSheet.create({
    root: {
      ...StyleSheet.absoluteFill,
      justifyContent: "space-between",
      paddingHorizontal: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(20) : responsiveLayout.responsiveWidth(20),
      backgroundColor: "rgba(3, 3, 7, 0.98)",
    },
    atmosphere: {
      ...StyleSheet.absoluteFill,
      experimental_backgroundImage: `
      radial-gradient(circle at 84% 8%, rgba(141, 114, 255, 0.24) 0%, transparent 34%),
      radial-gradient(circle at 12% 75%, rgba(88, 223, 232, 0.16) 0%, transparent 36%),
      linear-gradient(160deg, rgba(11, 8, 18, 0.98) 0%, rgba(4, 4, 8, 0.99) 72%)
    `,
    },
    header: {
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "space-between",
      gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(16) : responsiveLayout.responsiveWidth(16),
    },
    headerCopy: { flex: 1, gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(3) : responsiveLayout.responsiveWidth(3) },
    eyebrow: {
      color: theme.colors.scannerViolet,
      fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(10) : responsiveLayout.responsiveFont(10),
      fontWeight: "900",
      letterSpacing: 2.1,
    },
    headerTitle: { color: theme.colors.cream, fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(23) : responsiveLayout.responsiveFont(23), fontWeight: "800" },
    closeButton: {
      width: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(42) : responsiveLayout.responsiveWidth(42),
      height: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(42) : responsiveLayout.responsiveHeight(42),
      alignItems: "center",
      justifyContent: "center",
      borderRadius: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(21) : responsiveLayout.responsiveWidth(21),
      borderWidth: 1,
      borderColor: "rgba(247, 242, 232, 0.22)",
      backgroundColor: "rgba(247, 242, 232, 0.07)",
    },
    content: { flex: 1, justifyContent: "center", gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(22) : responsiveLayout.responsiveWidth(22), paddingVertical: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(20) : responsiveLayout.responsiveHeight(20) },
    codePill: {
      alignSelf: "center",
      flexDirection: "row",
      alignItems: "center",
      gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(8) : responsiveLayout.responsiveWidth(8),
      paddingHorizontal: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(13) : responsiveLayout.responsiveWidth(13),
      paddingVertical: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(9) : responsiveLayout.responsiveHeight(9),
      borderRadius: theme.radii.pill,
      borderWidth: 1,
      borderColor: "rgba(141, 114, 255, 0.40)",
      backgroundColor: "rgba(141, 114, 255, 0.12)",
    },
    codeText: { color: theme.colors.cream, fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(12) : responsiveLayout.responsiveFont(12), fontWeight: "800", letterSpacing: 0.7 },
    loadingState: { alignItems: "center", gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(12) : responsiveLayout.responsiveWidth(12), paddingHorizontal: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(18) : responsiveLayout.responsiveWidth(18) },
    loadingIcon: {
      width: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(72) : responsiveLayout.responsiveWidth(72),
      height: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(72) : responsiveLayout.responsiveHeight(72),
      alignItems: "center",
      justifyContent: "center",
      borderRadius: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(36) : responsiveLayout.responsiveWidth(36),
      borderWidth: 1,
      borderColor: "rgba(88, 223, 232, 0.42)",
      backgroundColor: "rgba(88, 223, 232, 0.09)",
      boxShadow: "0 0 30px rgba(88, 223, 232, 0.18)",
    },
    resultState: { alignItems: "center", gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(16) : responsiveLayout.responsiveWidth(16) },
    productImage: {
      width: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(146) : responsiveLayout.responsiveWidth(146),
      height: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(146) : responsiveLayout.responsiveHeight(146),
      borderRadius: theme.radii.large,
      backgroundColor: "rgba(247, 242, 232, 0.06)",
    },
    productImageFallback: {
      width: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(112) : responsiveLayout.responsiveWidth(112),
      height: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(112) : responsiveLayout.responsiveHeight(112),
      alignItems: "center",
      justifyContent: "center",
      borderRadius: theme.radii.large,
      borderWidth: 1,
      borderColor: "rgba(88, 223, 232, 0.34)",
      backgroundColor: "rgba(88, 223, 232, 0.08)",
    },
    productCopy: { width: "100%", alignItems: "center", gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(8) : responsiveLayout.responsiveWidth(8) },
    title: { color: theme.colors.cream, fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(21) : responsiveLayout.responsiveFont(21), fontWeight: "800", textAlign: "center" },
    body: { color: theme.colors.textMuted, fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(14) : responsiveLayout.responsiveFont(14), lineHeight: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(21) : responsiveLayout.responsiveFont(21), textAlign: "center" },
    details: {
      width: "100%",
      gap: responsiveLayout.isWideWeb ? responsiveLayout.webResponsiveWidth(1) : responsiveLayout.responsiveWidth(1),
      overflow: "hidden",
      borderRadius: theme.radii.medium,
      borderWidth: 1,
      borderColor: "rgba(247, 242, 232, 0.14)",
      backgroundColor: "rgba(247, 242, 232, 0.05)",
    },
    detailRow: {
      flexDirection: "row",
      alignItems: "baseline",
      justifyContent: "space-between",
      gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(14) : responsiveLayout.responsiveWidth(14),
      paddingHorizontal: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(14) : responsiveLayout.responsiveWidth(14),
      paddingVertical: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(11) : responsiveLayout.responsiveHeight(11),
      backgroundColor: "rgba(7, 7, 12, 0.74)",
    },
    detailLabel: { color: theme.colors.scannerCyan, fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(11) : responsiveLayout.responsiveFont(11), fontWeight: "800", letterSpacing: 0.8 },
    detailValue: { flex: 1, color: theme.colors.cream, fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(13) : responsiveLayout.responsiveFont(13), fontWeight: "700", textAlign: "right" },
    evidenceNote: { color: theme.colors.goldBright, fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(12) : responsiveLayout.responsiveFont(12), fontWeight: "700", lineHeight: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(18) : responsiveLayout.responsiveFont(18), textAlign: "center" },
    actions: { gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(10) : responsiveLayout.responsiveWidth(10) },
    primaryAction: {
      minHeight: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(54) : responsiveLayout.responsiveHeight(54),
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "center",
      gap: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(9) : responsiveLayout.responsiveWidth(9),
      borderRadius: theme.radii.medium,
      backgroundColor: theme.colors.scannerViolet,
    },
    primaryActionText: { color: theme.colors.background, fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(15) : responsiveLayout.responsiveFont(15), fontWeight: "900" },
    secondaryAction: { minHeight: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(48) : responsiveLayout.responsiveHeight(48), alignItems: "center", justifyContent: "center", borderRadius: theme.radii.medium, borderWidth: 1, borderColor: "rgba(247, 242, 232, 0.20)" },
    secondaryActionText: { color: theme.colors.cream, fontSize: responsiveLayout.isWeb ? responsiveLayout.webResponsiveFont(14) : responsiveLayout.responsiveFont(14), fontWeight: "800" },
    disabled: { opacity: 0.42 },
    pressed: { opacity: 0.76, transform: [{ scale: 0.98 }] },
  });
  return {
    ...staticStyles,
    eyebrow: [
      staticStyles.eyebrow,
      {
        fontSize: responsiveFont(10),
      },
    ],
    headerTitle: [
      staticStyles.headerTitle,
      {
        fontSize: responsiveFont(23),
      },
    ],
    closeButton: [
      staticStyles.closeButton,
      {
        width: responsiveWidth(42),
        height: responsiveHeight(42),
      },
    ],
    codeText: [
      staticStyles.codeText,
      {
        fontSize: responsiveFont(12),
      },
    ],
    loadingIcon: [
      staticStyles.loadingIcon,
      {
        width: responsiveWidth(72),
        height: responsiveHeight(72),
      },
    ],
    productImage: [
      staticStyles.productImage,
      {
        width: responsiveWidth(146),
        height: responsiveHeight(146),
      },
    ],
    productImageFallback: [
      staticStyles.productImageFallback,
      {
        width: responsiveWidth(112),
        height: responsiveHeight(112),
      },
    ],
    title: [
      staticStyles.title,
      {
        fontSize: responsiveFont(21),
      },
    ],
    body: [
      staticStyles.body,
      {
        fontSize: responsiveFont(14),
      },
    ],
    detailLabel: [
      staticStyles.detailLabel,
      {
        fontSize: responsiveFont(11),
      },
    ],
    detailValue: [
      staticStyles.detailValue,
      {
        fontSize: responsiveFont(13),
      },
    ],
    evidenceNote: [
      staticStyles.evidenceNote,
      {
        fontSize: responsiveFont(12),
      },
    ],
    primaryActionText: [
      staticStyles.primaryActionText,
      {
        fontSize: responsiveFont(15),
      },
    ],
    secondaryActionText: [
      staticStyles.secondaryActionText,
      {
        fontSize: responsiveFont(14),
      },
    ],
  };
}
