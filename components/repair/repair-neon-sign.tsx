import { Image } from "expo-image";
import { useEffect, useRef } from "react";
import {
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from "react-native";

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

const styles = StyleSheet.create({
  root: {
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  cyanGlow: {
    position: "absolute",
    top: "10%",
    right: "8%",
    width: 224,
    height: 224,
    borderRadius: 999,
    backgroundColor: "rgba(0, 255, 255, 0.16)",
    boxShadow: "0 0 88px 30px rgba(0, 255, 255, 0.22)",
  },
  violetGlow: {
    position: "absolute",
    bottom: "4%",
    left: "5%",
    width: 218,
    height: 218,
    borderRadius: 999,
    backgroundColor: "rgba(141, 114, 255, 0.15)",
    boxShadow: "0 0 92px 30px rgba(141, 114, 255, 0.22)",
  },
  goldGlow: {
    position: "absolute",
    width: 110,
    height: 110,
    borderRadius: 999,
    backgroundColor: "rgba(242, 211, 138, 0.16)",
    boxShadow: "0 0 56px 18px rgba(242, 211, 138, 0.26)",
  },
  outerRing: {
    position: "absolute",
    width: 280,
    height: 280,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(0, 255, 255, 0.42)",
  },
  innerRing: {
    position: "absolute",
    width: 216,
    height: 216,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: "rgba(242, 211, 138, 0.38)",
  },
  sign: {
    width: "70%",
    height: "70%",
    filter: "drop-shadow(0 0 24px rgba(0, 255, 255, 0.7)) drop-shadow(0 0 38px rgba(141, 114, 255, 0.45))",
  },
});
