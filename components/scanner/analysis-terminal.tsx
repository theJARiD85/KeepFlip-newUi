import { useEffect, useMemo, useState } from "react";
import {
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { keepFlipTheme as theme } from "@/constants/keepflip-theme";
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import responsiveFont, { responsiveHeight, responsiveWidth } from '@/lib/responsiveFont';

import { useResponsiveStyles } from '@/hooks/use-responsive-layout';
type AnalysisTerminalProps = {
  detail?: string;
  stage?: string;
};

function terminalLabel(value?: string) {
  const cleaned = value?.trim();

  if (!cleaned) {
    return "ANALYZING ITEM";
  }

  return cleaned
    .replace(/\s+/g, " ")
    .toUpperCase();
}

export function AnalysisTerminal({
  detail,
  stage,
}: AnalysisTerminalProps) {
  const styles = useResponsiveStyles(createResponsiveStyles);
  const {
    responsiveFont
  } = useResponsiveLayout();

  const [dotCount, setDotCount] = useState(1);

  useEffect(() => {
    const timer = setInterval(() => {
      setDotCount((current) =>
        current >= 3 ? 1 : current + 1,
      );
    }, 420);

    return () => {
      clearInterval(timer);
    };
  }, []);

  const dots = useMemo(
    () => ".".repeat(dotCount),
    [dotCount],
  );

  return (
    <View
      accessibilityLiveRegion="polite"
      style={styles.terminal}
    >
      <View style={styles.header}>
        <View style={styles.signal} />

        <Text style={[styles.headerText, { fontSize: responsiveFont(8) }]}>
          KEEPFLIP://ITEM_ANALYSIS
        </Text>

        <Text style={[styles.statusText, { fontSize: responsiveFont(7) }]}>
          ACTIVE
        </Text>
      </View>

      <View style={styles.divider} />

      <View style={styles.commandRow}>
        <Text style={[styles.prompt, { fontSize: responsiveFont(13) }]}>
          {">"}
        </Text>

        <Text
          numberOfLines={1}
          style={styles.command}
        >
          {terminalLabel(stage)}
          <Text style={styles.dots}>
            {dots}
          </Text>
        </Text>
      </View>

      {detail ? (
        <Text
          numberOfLines={2}
          style={[styles.detail, { fontSize: responsiveFont(8), lineHeight: 12 }]}
        >
          {detail}
        </Text>
      ) : null}

      <View style={styles.footer}>
        <Text style={[styles.footerText, { fontSize: responsiveFont(6) }]}>
          NEURAL CHANNEL // SECURE
        </Text>

        <View style={styles.cursor} />
      </View>
    </View>
  );
}

function createResponsiveStyles(responsiveLayout: ReturnType<typeof useResponsiveLayout>) {
    const staticStyles = StyleSheet.create({
  terminal: {
    width: "100%",
    maxWidth: 390,
    minHeight: 116,
    paddingHorizontal: 15,
    paddingTop: 12,
    paddingBottom: 11,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(88, 223, 232, 0.34)",
    borderRadius: 8,
    backgroundColor: "rgba(1, 6, 10, 0.88)",
    boxShadow:
      "0 12px 28px rgba(0, 0, 0, 0.62), 0 0 22px rgba(88, 223, 232, 0.11)",
  },

  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
  },

  signal: {
    width: 6,
    height: 6,
    borderRadius: 999,
    backgroundColor: theme.colors.scannerCyan,
    boxShadow:
      "0 0 10px rgba(88, 223, 232, 0.92)",
  },

  headerText: {
    flex: 1,
    color: "rgba(88, 223, 232, 0.76)",
    fontFamily:
      Platform.OS === "ios"
        ? "Courier New"
        : "monospace",
    fontSize: 8,
    fontWeight: "800",
    letterSpacing: 1.05,
  },

  statusText: {
    color: theme.colors.goldBright,
    fontFamily:
      Platform.OS === "ios"
        ? "Courier New"
        : "monospace",
    fontSize: 7,
    fontWeight: "900",
    letterSpacing: 1,
  },

  divider: {
    height: StyleSheet.hairlineWidth,
    marginTop: 9,
    marginBottom: 13,
    backgroundColor:
      "rgba(88, 223, 232, 0.18)",
  },

  commandRow: {
    minHeight: 25,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },

  prompt: {
    color: theme.colors.scannerCyan,
    fontFamily:
      Platform.OS === "ios"
        ? "Courier New"
        : "monospace",
    fontSize: 13,
    fontWeight: "900",
    textShadowColor:
      "rgba(88, 223, 232, 0.8)",
    textShadowOffset: {
      width: 0,
      height: 0,
    },
    textShadowRadius: 5,
  },

  command: {
    flex: 1,
    color: "#E9FFFF",
    fontFamily:
      Platform.OS === "ios"
        ? "Courier New"
        : "monospace",
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 0.7,
  },

  dots: {
    color: theme.colors.scannerCyan,
  },

  detail: {
    marginTop: 6,
    paddingLeft: 19,
    color: "rgba(218, 238, 241, 0.56)",
    fontFamily:
      Platform.OS === "ios"
        ? "Courier New"
        : "monospace",
    fontSize: 8,
    lineHeight: 12,
    letterSpacing: 0.35,
  },

  footer: {
    minHeight: 17,
    marginTop: 10,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: 8,
  },

  footerText: {
    color: "rgba(141, 114, 255, 0.62)",
    fontFamily:
      Platform.OS === "ios"
        ? "Courier New"
        : "monospace",
    fontSize: 6,
    fontWeight: "800",
    letterSpacing: 0.9,
  },

  cursor: {
    width: 6,
    height: 10,
    backgroundColor:
      "rgba(88, 223, 232, 0.72)",
    boxShadow:
      "0 0 7px rgba(88, 223, 232, 0.74)",
  },
});
  return {
    ...staticStyles,
  signal: [
    staticStyles.signal,
    {
        width: responsiveLayout.responsiveWidth(6),
        height: responsiveLayout.responsiveHeight(6),
    },
  ],
  headerText: [
    staticStyles.headerText,
    {
        fontSize: responsiveLayout.responsiveFont(8),
    },
  ],
  statusText: [
    staticStyles.statusText,
    {
        fontSize: responsiveLayout.responsiveFont(7),
    },
  ],
  prompt: [
    staticStyles.prompt,
    {
        fontSize: responsiveLayout.responsiveFont(13),
        textShadowOffset: {
        width: responsiveLayout.responsiveWidth(0),
        height: responsiveLayout.responsiveHeight(0),
        },
    },
  ],
  command: [
    staticStyles.command,
    {
        fontSize: responsiveLayout.responsiveFont(11),
    },
  ],
  detail: [
    staticStyles.detail,
    {
        fontSize: responsiveLayout.responsiveFont(8),
    },
  ],
  footerText: [
    staticStyles.footerText,
    {
        fontSize: responsiveLayout.responsiveFont(6),
    },
  ],
  cursor: [
    staticStyles.cursor,
    {
        width: responsiveLayout.responsiveWidth(6),
        height: responsiveLayout.responsiveHeight(10),
    },
  ],
  };
}