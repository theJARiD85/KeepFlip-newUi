import { StyleSheet, View } from "react-native";
import { AppodealMrec } from "react-native-appodeal";
import { keepFlipTheme as theme } from "@/constants/keepflip-theme";

type InventoryMRECCardProps = {
  placement: string;
};

export function InventoryMRECCard({
  placement,
}: InventoryMRECCardProps) {
  return (
    <View style={styles.card}>
      <AppodealMrec
        placement={placement}
        onAdLoaded={() =>
          console.info("[Appodeal] Inventory MREC loaded:", placement)
        }
        onAdFailedToLoad={() =>
          console.warn("[Appodeal] Inventory MREC failed:", placement)
        }
        onAdClicked={() =>
          console.info("[Appodeal] Inventory MREC clicked:", placement)
        }
        onAdExpired={() =>
          console.info("[Appodeal] Inventory MREC expired:", placement)
        }
        style={styles.ad}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    alignItems: "center",
    overflow: "hidden",
    marginBottom: 15,
    borderRadius: theme.radii.large,
    borderCurve: "continuous",
    borderWidth: 1,
    borderColor: "rgba(215, 168, 74, 0.32)",
    backgroundColor: "rgba(5, 5, 8, 0.98)",
    boxShadow:
      "0 18px 42px rgba(0, 0, 0, 0.46), 0 0 28px rgba(215, 168, 74, 0.08)",
  },
  ad: {
    width: "100%",
    height: 250,
    marginVertical: 15,
  },
});