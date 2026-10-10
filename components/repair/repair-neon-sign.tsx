import { responsiveWidth } from '@/lib/responsiveFont';
import { Image } from "expo-image";
import { useEffect, useRef } from "react";
import {
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

import { useResponsiveLayout, useResponsiveStyles } from '@/hooks/use-responsive-layout';
const FIX_SVG = require("@/assets/images/fix.svg");

type RepairNeonSignProps = {
  onSignError?: (message: string) => void;
  onSignReady?: () => void;
  style?: StyleProp<ViewStyle>;
};

/** Web fallback; Android and iOS use the Skia neon-sign sibling. */
export function RepairNeonSign({
  onSignReady,
  style,
}: RepairNeonSignProps): React.JSX.Element {
  const styles = useResponsiveStyles(createResponsiveStyles);
  const notifiedReady = useRef(false);

  useEffect(() => {
    if (notifiedReady.current) return;
    notifiedReady.current = true;
    onSignReady?.();
  }, [onSignReady]);

  return (
    <View pointerEvents="none" style={[styles.root, style]}>
      <View style={styles.cyanGlow} />
      <View style={styles.violetGlow} />
      <View style={styles.goldGlow} />
      <View style={styles.outerRing} />
      <View style={styles.innerRing} />
      <Image contentFit="contain" source={FIX_SVG} style={styles.sign} />
    </View>
  );
}

function createResponsiveStyles(responsiveLayout: ReturnType<typeof useResponsiveLayout>) {
  const { responsiveWidth, responsiveHeight } = responsiveLayout;
  const staticStyles = StyleSheet.create({
    root: {
      alignItems: "center",
      justifyContent: "center",
      overflow: "hidden",
    },
    cyanGlow: {
      position: "absolute",
      top: "10%",
      right: "8%",
      width: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(224) : 224,
      height: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(224) : 224,
      borderRadius: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(999) : 999,
      backgroundColor: "rgba(0, 255, 255, 0.16)",
      boxShadow: "0 0 88px 30px rgba(0, 255, 255, 0.22)",
    },
    violetGlow: {
      position: "absolute",
      bottom: "4%",
      left: "5%",
      width: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(218) : 218,
      height: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(218) : 218,
      borderRadius: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(999) : 999,
      backgroundColor: "rgba(141, 114, 255, 0.15)",
      boxShadow: "0 0 92px 30px rgba(141, 114, 255, 0.22)",
    },
    goldGlow: {
      position: "absolute",
      width: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(110) : 110,
      height: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(110) : 110,
      borderRadius: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(999) : 999,
      backgroundColor: "rgba(242, 211, 138, 0.16)",
      boxShadow: "0 0 56px 18px rgba(242, 211, 138, 0.26)",
    },
    outerRing: {
      position: "absolute",
      width: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(280) : 280,
      height: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(280) : 280,
      borderRadius: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(999) : 999,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: "rgba(0, 255, 255, 0.42)",
    },
    innerRing: {
      position: "absolute",
      width: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(216) : 216,
      height: responsiveLayout.isWeb ? responsiveLayout.webResponsiveHeight(216) : 216,
      borderRadius: responsiveLayout.isWeb ? responsiveLayout.webResponsiveWidth(999) : 999,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: "rgba(242, 211, 138, 0.38)",
    },
    sign: {
      width: "70%",
      height: "70%",
      filter: "drop-shadow(0 0 24px rgba(0, 255, 255, 0.7)) drop-shadow(0 0 38px rgba(141, 114, 255, 0.45))",
    },
  });
  return {
    ...staticStyles,
    cyanGlow: [
      staticStyles.cyanGlow,
      {
        width: responsiveWidth(224),
        height: responsiveHeight(224),
      },
    ],
    violetGlow: [
      staticStyles.violetGlow,
      {
        width: responsiveWidth(218),
        height: responsiveHeight(218),
      },
    ],
    goldGlow: [
      staticStyles.goldGlow,
      {
        width: responsiveWidth(110),
        height: responsiveHeight(110),
      },
    ],
    outerRing: [
      staticStyles.outerRing,
      {
        width: responsiveWidth(280),
        height: responsiveHeight(280),
      },
    ],
    innerRing: [
      staticStyles.innerRing,
      {
        width: responsiveWidth(216),
        height: responsiveHeight(216),
      },
    ],
  };
}
