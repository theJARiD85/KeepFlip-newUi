import { Image } from "expo-image";
import { ActivityIndicator, Pressable, StyleSheet, View } from "react-native";
import Animated, { FadeIn, FadeOut } from "react-native-reanimated";

import { IconSymbol } from "@/components/ui/icon-symbol";
import { KeepFlipText as Text } from "@/components/ui/keepflip-text";
import { keepFlipTheme as theme } from "@/constants/keepflip-theme";
import type { EbayBarcodeLookupResult } from "@/services/ebaySoldCompsService";
import { neutralizeMarketplaceBrand } from "@/services/market-copy";

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
          <Text style={styles.eyebrow}>BARCODE LOOKUP</Text>
          <Text style={styles.headerTitle}>
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
          <IconSymbol color={theme.colors.cream} name="xmark" size={20} />
        </Pressable>
      </View>

      <View style={styles.content}>
        <View style={styles.codePill}>
          <IconSymbol
            color={theme.colors.scannerViolet}
            name="barcode.viewfinder"
            size={18}
          />
          <Text selectable style={styles.codeText}>
            {barcode || "SCANNED CODE"}
          </Text>
        </View>

        {isSearching ? (
          <View style={styles.loadingState}>
            <View style={styles.loadingIcon}>
              <ActivityIndicator color={theme.colors.scannerCyan} />
            </View>
            <Text style={styles.title}>Finding the matching product</Text>
            <Text style={styles.body}>
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
                <IconSymbol
                  color={theme.colors.scannerCyan}
                  name="barcode.viewfinder"
                  size={34}
                />
              </View>
            )}

            <View style={styles.productCopy}>
              <Text selectable style={styles.title}>
                {neutralizeMarketplaceBrand(product.title)}
              </Text>
              <Text selectable style={styles.body}>
                {neutralizeMarketplaceBrand(product.description)}
              </Text>
            </View>

            {rows.length > 0 ? (
              <View style={styles.details}>
                {rows.map(([label, value]) => (
                  <View key={label} style={styles.detailRow}>
                    <Text style={styles.detailLabel}>{label}</Text>
                    <Text selectable style={styles.detailValue}>
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
              <IconSymbol
                color={theme.colors.goldBright}
                name="barcode.viewfinder"
                size={32}
              />
            </View>
            <Text style={styles.title}>
              {state.phase === "error" ? "Lookup needs another try" : "No product match yet"}
            </Text>
            <Text style={styles.body}>
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
            <IconSymbol
              color={theme.colors.background}
              name="barcode.viewfinder"
              size={20}
            />
            <Text style={styles.primaryActionText}>Scan another code</Text>
          </Pressable>
          <Pressable
            accessibilityLabel="Back to scanner tools"
            accessibilityRole="button"
            onPress={onDismiss}
            style={({ pressed }) => [styles.secondaryAction, pressed && styles.pressed]}
          >
            <Text style={styles.secondaryActionText}>Back to tools</Text>
          </Pressable>
        </View>
      ) : null}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  root: {
    ...StyleSheet.absoluteFill,
    justifyContent: "space-between",
    paddingHorizontal: 20,
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
    gap: 16,
  },
  headerCopy: { flex: 1, gap: 3 },
  eyebrow: {
    color: theme.colors.scannerViolet,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 2.1,
  },
  headerTitle: { color: theme.colors.cream, fontSize: 23, fontWeight: "800" },
  closeButton: {
    width: 42,
    height: 42,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 21,
    borderWidth: 1,
    borderColor: "rgba(247, 242, 232, 0.22)",
    backgroundColor: "rgba(247, 242, 232, 0.07)",
  },
  content: { flex: 1, justifyContent: "center", gap: 22, paddingVertical: 20 },
  codePill: {
    alignSelf: "center",
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 13,
    paddingVertical: 9,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    borderColor: "rgba(141, 114, 255, 0.40)",
    backgroundColor: "rgba(141, 114, 255, 0.12)",
  },
  codeText: { color: theme.colors.cream, fontSize: 12, fontWeight: "800", letterSpacing: 0.7 },
  loadingState: { alignItems: "center", gap: 12, paddingHorizontal: 18 },
  loadingIcon: {
    width: 72,
    height: 72,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 36,
    borderWidth: 1,
    borderColor: "rgba(88, 223, 232, 0.42)",
    backgroundColor: "rgba(88, 223, 232, 0.09)",
    boxShadow: "0 0 30px rgba(88, 223, 232, 0.18)",
  },
  resultState: { alignItems: "center", gap: 16 },
  productImage: {
    width: 146,
    height: 146,
    borderRadius: theme.radii.large,
    backgroundColor: "rgba(247, 242, 232, 0.06)",
  },
  productImageFallback: {
    width: 112,
    height: 112,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.radii.large,
    borderWidth: 1,
    borderColor: "rgba(88, 223, 232, 0.34)",
    backgroundColor: "rgba(88, 223, 232, 0.08)",
  },
  productCopy: { width: "100%", alignItems: "center", gap: 8 },
  title: { color: theme.colors.cream, fontSize: 21, fontWeight: "800", textAlign: "center" },
  body: { color: theme.colors.textMuted, fontSize: 14, lineHeight: 21, textAlign: "center" },
  details: {
    width: "100%",
    gap: 1,
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
    gap: 14,
    paddingHorizontal: 14,
    paddingVertical: 11,
    backgroundColor: "rgba(7, 7, 12, 0.74)",
  },
  detailLabel: { color: theme.colors.scannerCyan, fontSize: 11, fontWeight: "800", letterSpacing: 0.8 },
  detailValue: { flex: 1, color: theme.colors.cream, fontSize: 13, fontWeight: "700", textAlign: "right" },
  evidenceNote: { color: theme.colors.goldBright, fontSize: 12, fontWeight: "700", lineHeight: 18, textAlign: "center" },
  actions: { gap: 10 },
  primaryAction: {
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 9,
    borderRadius: theme.radii.medium,
    backgroundColor: theme.colors.scannerViolet,
  },
  primaryActionText: { color: theme.colors.background, fontSize: 15, fontWeight: "900" },
  secondaryAction: { minHeight: 48, alignItems: "center", justifyContent: "center", borderRadius: theme.radii.medium, borderWidth: 1, borderColor: "rgba(247, 242, 232, 0.20)" },
  secondaryActionText: { color: theme.colors.cream, fontSize: 14, fontWeight: "800" },
  disabled: { opacity: 0.42 },
  pressed: { opacity: 0.76, transform: [{ scale: 0.98 }] },
});
