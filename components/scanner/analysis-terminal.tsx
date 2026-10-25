import { useEffect, useMemo, useState } from "react";
import {
  Platform,
  StyleSheet,
  Text,
  View,
} from "react-native";

import { keepFlipTheme as theme } from "@/constants/keepflip-theme";
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import { responsiveWidth } from '@/lib/responsiveFont';

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
  const responsiveLayout2 = useResponsiveLayout();
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
          style={[styles.detail, { fontSize: responsiveFont(8), lineHeight: responsiveLayout2.isWideWeb ? responsiveLayout2.webResponsiveFont(12) : responsiveLayout2.responsiveFont(12) }]}
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
  const { responsiveWidth, responsiveHeight, responsiveFont } = responsiveLayout;
  const staticStyles = StyleSheet.create({
    terminal: {
      width: "100%",
      maxWidth: responsiveLayout.isWideWeb ? responsiveLayout.webResponsiveWidth(390) : responsiveLayout.responsiveWidth(390),
      minHeight: responsiveLayout.isWideWeb ? responsiveLayout.webResponsiveHeight(116) : responsiveLayout.responsiveHeight(116),
      paddingHorizontal: responsiveLayout.isWideWeb ? responsiveLayout.webResponsiveWidth(15) : responsiveLayout.responsiveWidth(15),
      paddingTop: responsiveLayout.isWideWeb ? responsiveLayout.webResponsiveHeight(12) : responsiveLayout.responsiveHeight(12),
      paddingBottom: responsiveLayout.isWideWeb ? responsiveLayout.webResponsiveHeight(11) : responsiveLayout.responsiveHeight(11),
      overflow: "hidden",
      borderWidth: 1,
      borderColor: "rgba(88, 223, 232, 0.34)",
      borderRadius: responsiveLayout.isWideWeb ? responsiveLayout.webResponsiveWidth(8) : responsiveLayout.responsiveWidth(8),
      backgroundColor: "rgba(1, 6, 10, 0.88)",
      boxShadow:
        "0 12px 28px rgba(0, 0, 0, 0.62), 0 0 22px rgba(88, 223, 232, 0.11)",
    },

    header: {
      flexDirection: "row",
      alignItems: "center",
      gap: responsiveLayout.isWideWeb ? responsiveLayout.webResponsiveWidth(7) : responsiveLayout.responsiveWidth(7),
    },

    signal: {
      width: responsiveLayout.isWideWeb ? responsiveLayout.webResponsiveWidth(6) : responsiveLayout.responsiveWidth(6),
      height: responsiveLayout.isWideWeb ? responsiveLayout.webResponsiveHeight(6) : responsiveLayout.responsiveHeight(6),
      borderRadius: responsiveLayout.isWideWeb ? responsiveLayout.webResponsiveWidth(999) : responsiveLayout.responsiveWidth(999),
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
      fontSize: responsiveLayout.isWideWeb ? responsiveLayout.webResponsiveFont(8) : responsiveLayout.responsiveFont(8),
      fontWeight: "800",
      letterSpacing: responsiveLayout.isWideWeb ? responsiveLayout.webResponsiveFont(1.05) : responsiveLayout.responsiveFont(1.05),
    },

    statusText: {
      color: theme.colors.goldBright,
      fontFamily:
        Platform.OS === "ios"
          ? "Courier New"
          : "monospace",
      fontSize: responsiveLayout.isWideWeb ? responsiveLayout.webResponsiveFont(7) : responsiveLayout.responsiveFont(7),
      fontWeight: "900",
      letterSpacing: responsiveLayout.isWideWeb ? responsiveLayout.webResponsiveFont(1) : responsiveLayout.responsiveFont(1),
    },

    divider: {
      height: StyleSheet.hairlineWidth,
      marginTop: responsiveLayout.isWideWeb ? responsiveLayout.webResponsiveHeight(9) : responsiveLayout.responsiveHeight(9),
      marginBottom: responsiveLayout.isWideWeb ? responsiveLayout.webResponsiveHeight(13) : responsiveLayout.responsiveHeight(13),
      backgroundColor:
        "rgba(88, 223, 232, 0.18)",
    },

    commandRow: {
      minHeight: responsiveLayout.isWideWeb ? responsiveLayout.webResponsiveHeight(25) : responsiveLayout.responsiveHeight(25),
      flexDirection: "row",
      alignItems: "center",
      gap: responsiveLayout.isWideWeb ? responsiveLayout.webResponsiveWidth(8) : responsiveLayout.responsiveWidth(8),
    },

    prompt: {
      color: theme.colors.scannerCyan,
      fontFamily:
        Platform.OS === "ios"
          ? "Courier New"
          : "monospace",
      fontSize: responsiveLayout.isWideWeb ? responsiveLayout.webResponsiveFont(13) : responsiveLayout.responsiveFont(13),
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
      fontSize: responsiveLayout.isWideWeb ? responsiveLayout.webResponsiveFont(11) : responsiveLayout.responsiveFont(11),
      fontWeight: "800",
      letterSpacing: responsiveLayout.isWideWeb ? responsiveLayout.webResponsiveFont(0.7) : responsiveLayout.responsiveFont(0.7),
    },

    dots: {
      color: theme.colors.scannerCyan,
    },

    detail: {
      marginTop: responsiveLayout.isWideWeb ? responsiveLayout.webResponsiveHeight(6) : responsiveLayout.responsiveHeight(6),
      paddingLeft: responsiveLayout.isWideWeb ? responsiveLayout.webResponsiveWidth(19) : responsiveLayout.responsiveWidth(19),
      color: "rgba(218, 238, 241, 0.56)",
      fontFamily:
        Platform.OS === "ios"
          ? "Courier New"
          : "monospace",
      fontSize: responsiveLayout.isWideWeb ? responsiveLayout.webResponsiveFont(8) : responsiveLayout.responsiveFont(8),
      lineHeight: responsiveLayout.isWideWeb ? responsiveLayout.webResponsiveFont(12) : responsiveLayout.responsiveFont(12),
      letterSpacing: responsiveLayout.isWideWeb ? responsiveLayout.webResponsiveFont(0.35) : responsiveLayout.responsiveFont(0.35),
    },

    footer: {
      minHeight: responsiveLayout.isWideWeb ? responsiveLayout.webResponsiveHeight(17) : responsiveLayout.responsiveHeight(17),
      marginTop: responsiveLayout.isWideWeb ? responsiveLayout.webResponsiveHeight(10) : responsiveLayout.responsiveHeight(10),
      flexDirection: "row",
      alignItems: "center",
      justifyContent: "flex-end",
      gap: responsiveLayout.isWideWeb ? responsiveLayout.webResponsiveWidth(8) : responsiveLayout.responsiveWidth(8),
    },

    footerText: {
      color: "rgba(141, 114, 255, 0.62)",
      fontFamily:
        Platform.OS === "ios"
          ? "Courier New"
          : "monospace",
      fontSize: responsiveLayout.isWideWeb ? responsiveLayout.webResponsiveFont(6) : responsiveLayout.responsiveFont(6),
      fontWeight: "800",
      letterSpacing: responsiveLayout.isWideWeb ? responsiveLayout.webResponsiveFont(0.9) : responsiveLayout.responsiveFont(0.9),
    },

    cursor: {
      width: responsiveLayout.isWideWeb ? responsiveLayout.webResponsiveWidth(6) : responsiveLayout.responsiveWidth(6),
      height: responsiveLayout.isWideWeb ? responsiveLayout.webResponsiveHeight(10) : responsiveLayout.responsiveHeight(10),
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
        width: responsiveWidth(6),
        height: responsiveHeight(6),
      },
    ],
    headerText: [
      staticStyles.headerText,
      {
        fontSize: responsiveFont(8),
      },
    ],
    statusText: [
      staticStyles.statusText,
      {
        fontSize: responsiveFont(7),
      },
    ],
    prompt: [
      staticStyles.prompt,
      {
        fontSize: responsiveFont(13),
        textShadowOffset: {
          width: responsiveWidth(0),
          height: responsiveHeight(0),
        },
      },
    ],
    command: [
      staticStyles.command,
      {
        fontSize: responsiveFont(11),
      },
    ],
    detail: [
      staticStyles.detail,
      {
        fontSize: responsiveFont(8),
      },
    ],
    footerText: [
      staticStyles.footerText,
      {
        fontSize: responsiveFont(6),
      },
    ],
    cursor: [
      staticStyles.cursor,
      {
        width: responsiveWidth(6),
        height: responsiveHeight(10),
      },
    ],
  };
}