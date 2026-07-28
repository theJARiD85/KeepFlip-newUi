import { useLocalSearchParams, useRouter } from "expo-router";
import { useEffect } from "react";
import { ActivityIndicator, StyleSheet, View } from "react-native";

import { useItemAnalysisResult } from "@/components/scanner/item-analysis-result-context";
import { KeepFlipText as Text } from "@/components/ui/keepflip-text";
import { keepFlipTheme as theme } from "@/constants/keepflip-theme";

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function ItemAnalysisScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{
    sessionId?: string | string[];
  }>();
  const sessionId = firstParam(params.sessionId);
  const {
    clearScannerAnalysis,
    scannerAnalysis,
  } = useItemAnalysisResult();
  const session =
    sessionId && scannerAnalysis?.id === sessionId
      ? scannerAnalysis
      : null;

  useEffect(
    () => () => {
      if (!session) return;
      session.onCancel();
      clearScannerAnalysis(session.id);
    },
    [clearScannerAnalysis, session],
  );

  return (
    <View style={styles.root}>
      {session ? (
        <>
          <ActivityIndicator color={theme.colors.scannerCyan} />
          <Text style={styles.title}>KeepFlip AI is analyzing this item</Text>
          <Text style={styles.body}>
            Open the iOS or Android build to see the live 3D analysis sequence.
          </Text>
        </>
      ) : (
        <>
          <Text style={styles.title}>Analysis session unavailable</Text>
          <Text onPress={() => router.back()} style={styles.link}>
            Back to scanner
          </Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    gap: 14,
    padding: 28,
    backgroundColor: theme.colors.backgroundDeep,
  },
  title: {
    color: theme.colors.cream,
    fontSize: 22,
    textAlign: "center",
  },
  body: {
    maxWidth: 420,
    color: theme.colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
    textAlign: "center",
  },
  link: {
    color: theme.colors.scannerCyan,
    fontSize: 13,
  },
});
