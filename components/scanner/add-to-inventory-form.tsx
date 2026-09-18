import { KeepFlipText as Text, KeepFlipTextInput as TextInput } from "@/components/ui/keepflip-text";
import { keepFlipTheme as theme } from "@/constants/keepflip-theme";
import { useResponsiveLayout, useResponsiveStyles } from '@/hooks/use-responsive-layout';
import { responsiveWidth } from '@/lib/responsiveFont';
import { todayBusinessDate } from "@/services/reseller-ledger-service";
import type { SourcingTripSummary } from "@/services/sourcing-trip-service";
import * as ImagePicker from "expo-image-picker";
import { useState } from "react";
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  useWindowDimensions,
} from "react-native";
import Animated, { FadeIn, SlideInUp } from "react-native-reanimated";
import { useSafeAreaInsets } from 'react-native-safe-area-context';


export type AddToInventoryFormValues = {
  acquisitionCost: string;
  acquiredAt: string;
  itemSpecifics: string;
  quantity: string;
  source: string;
  sku: string;
  location: string;
  receiptReference: string;
  notes: string;
};

type AddToInventoryFormProps = {
  itemTitle: string;
  onCancel: () => void;
  onSubmit: (values: AddToInventoryFormValues) => void | Promise<void>;
  sourcingTrip?: SourcingTripSummary | null;
  submitting?: boolean;
  visible: boolean;
};

function emptyValues(sourcingTrip: SourcingTripSummary | null = null): AddToInventoryFormValues {
  return {
    acquisitionCost: "",
    acquiredAt: todayBusinessDate(),
    itemSpecifics: "",
    quantity: "1",
    source: sourcingTrip?.trip.sourceName ?? "",
    sku: "",
    location: "",
    receiptReference: "",
    notes: "",
  };
}

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function createResponsiveStyles(responsiveLayout: ReturnType<typeof useResponsiveLayout>) {
  const { responsiveFont, responsiveWidth, responsiveHeight } = responsiveLayout;
  const staticStyles = StyleSheet.create({
    modalLayer: { flex: 1 },
    backdrop: {
      flex: 1,
      justifyContent: "flex-start",
      backgroundColor: "rgba(3, 3, 5, 0.44)",
    },
    sheet: {
      maxHeight: "95%",
      borderBottomWidth: 1,
      borderBottomColor: "rgba(0, 255, 255, 0.30)",
      backgroundColor: theme.colors.surfaceSoft,
    },
    header: {
      flexDirection: "row",
      alignItems: "flex-start",
      gap: 16,
      paddingHorizontal: 20,
      paddingBottom: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.divider,
    },
    headerCopy: { flex: 1, gap: 5 },
    sourceTripNotice: {
      gap: 3,
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: "rgba(88, 223, 232, 0.28)",
      backgroundColor: "rgba(88, 223, 232, 0.055)",
    },
    sourceTripEyebrow: {
      color: theme.colors.scannerCyan,
      fontFamily: theme.fonts.radar,
      fontSize: 9,
      fontWeight: "900",
      letterSpacing: 0.9,
    },
    sourceTripCopy: {
      color: theme.colors.cream,
      fontFamily: theme.fonts.body,
      fontSize: 12,
      fontWeight: "800",
      lineHeight: 16,
    },
    sourceTripHelper: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.body,
      fontSize: 11,
      lineHeight: 15,
    },
    eyebrow: {
      color: theme.colors.scannerCyan,
      fontFamily: theme.fonts.radar,
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 1.2,
    },
    title: {
      color: theme.colors.text,
      fontFamily: theme.fonts.display,
      fontSize: 22,
      fontWeight: "800",
      lineHeight: 27,
    },
    subtitle: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.body,
      fontSize: 13,
      lineHeight: 18,
    },
    closeButton: {
      width: 30,
      height: 30,
      alignItems: "center",
      justifyContent: "center",
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.20)",
    },
    closeText: {
      color: theme.colors.text,
      fontSize: 24,
      fontWeight: "300",
      lineHeight: 26,
    },
    content: { gap: 8, padding: 20, paddingBottom: 34 },
    fieldLabel: {
      marginVertical: 5,
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.radar,
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 0.8,
    },
    input: {
      minHeight: 44,
      paddingHorizontal: 12,
      paddingVertical: 5,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.16)",
      backgroundColor: "rgba(255,255,255,0.045)",
      color: theme.colors.text,
      fontFamily: theme.fonts.body,
      fontSize: 15,
    },
    receiptButton: {
      minHeight: 58,
      flexDirection: "row",
      alignItems: "center",
      gap: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderWidth: 1,
      borderColor: "rgba(0,255,255,0.32)",
      backgroundColor: "rgba(0,255,255,0.045)",
    },
    receiptPreview: {
      width: 42,
      height: 42,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.18)",
    },
    receiptButtonCopy: { flex: 1, minWidth: 0, gap: 3 },
    receiptButtonTitle: {
      color: theme.colors.scannerCyan,
      fontFamily: theme.fonts.radar,
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 0.7,
    },
    receiptButtonSubtitle: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.body,
      fontSize: 11,
      lineHeight: 15,
    },
    receiptButtonArrow: {
      color: theme.colors.scannerCyan,
      fontSize: 24,
      fontWeight: "300",
    },
    notesInput: { minHeight: 76, textAlignVertical: "top" },
    helper: {
      marginTop: -2,
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.body,
      fontSize: 12,
      lineHeight: 17,
    },
    twoColumn: { flexDirection: "row", gap: 10 },
    column: { flex: 1, minWidth: 0 },
    quantityColumn: { flex: 0.46, minWidth: 86 },
    actions: {
      flexDirection: "row",
      gap: 10,
      marginTop: 16,
    },
    cancelButton: {
      minHeight: 46,
      minWidth: 92,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 14,
      borderWidth: 1,
      borderColor: "rgba(255,255,255,0.20)",
    },
    submitButton: {
      flex: 1,
      minHeight: 46,
      alignItems: "center",
      justifyContent: "center",
      paddingHorizontal: 14,
      backgroundColor: theme.colors.goldBright,
    },
    cancelText: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.radar,
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 0.7,
    },
    submitText: {
      color: theme.colors.backgroundDeep,
      fontFamily: theme.fonts.radar,
      fontSize: 10,
      fontWeight: "900",
      letterSpacing: 0.6,
      textAlign: "center",
    },
    pressed: { opacity: 0.78 },
    disabled: { opacity: 0.5 },
  });
  return {
    ...staticStyles,
    sourceTripEyebrow: [
      staticStyles.sourceTripEyebrow,
      {
        fontSize: responsiveFont(9),
      },
    ],
    sourceTripCopy: [
      staticStyles.sourceTripCopy,
      {
        fontSize: responsiveFont(12),
      },
    ],
    sourceTripHelper: [
      staticStyles.sourceTripHelper,
      {
        fontSize: responsiveFont(11),
      },
    ],
    eyebrow: [
      staticStyles.eyebrow,
      {
        fontSize: responsiveFont(10),
      },
    ],
    title: [
      staticStyles.title,
      {
        fontSize: responsiveFont(22),
      },
    ],
    subtitle: [
      staticStyles.subtitle,
      {
        fontSize: responsiveFont(13),
      },
    ],
    closeButton: [
      staticStyles.closeButton,
      {
        width: responsiveWidth(30),
        height: responsiveHeight(30),
      },
    ],
    closeText: [
      staticStyles.closeText,
      {
        fontSize: responsiveFont(24),
      },
    ],
    fieldLabel: [
      staticStyles.fieldLabel,
      {
        fontSize: responsiveFont(10),
      },
    ],
    input: [
      staticStyles.input,
      {
        fontSize: responsiveFont(15),
      },
    ],
    receiptPreview: [
      staticStyles.receiptPreview,
      {
        width: responsiveWidth(42),
        height: responsiveHeight(42),
      },
    ],
    receiptButtonTitle: [
      staticStyles.receiptButtonTitle,
      {
        fontSize: responsiveFont(10),
      },
    ],
    receiptButtonSubtitle: [
      staticStyles.receiptButtonSubtitle,
      {
        fontSize: responsiveFont(11),
      },
    ],
    receiptButtonArrow: [
      staticStyles.receiptButtonArrow,
      {
        fontSize: responsiveFont(24),
      },
    ],
    helper: [
      staticStyles.helper,
      {
        fontSize: responsiveFont(12),
      },
    ],
    cancelText: [
      staticStyles.cancelText,
      {
        fontSize: responsiveFont(10),
      },
    ],
    submitText: [
      staticStyles.submitText,
      {
        fontSize: responsiveFont(10),
      },
    ],
  };
}

function FieldLabel({ children, required = false }: { children: string; required?: boolean }) {
  const {
    responsiveFont
  } = useResponsiveLayout();
  const styles = useResponsiveStyles(createResponsiveStyles);

  return (
    <Text style={[styles.fieldLabel, { fontSize: responsiveFont(10) }]}>
      {children.toUpperCase()}{required ? " · REQUIRED" : null}
    </Text>
  );
}

export function AddToInventoryForm({
  itemTitle,
  onCancel,
  onSubmit,
  sourcingTrip = null,
  submitting = false,
  visible,
}: AddToInventoryFormProps) {
  const {
    responsiveFont
  } = useResponsiveLayout();

  const [values, setValues] = useState<AddToInventoryFormValues>(() => emptyValues(sourcingTrip));
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();

  const handleCancel = () => {
    if (submitting) return;
    setValues(emptyValues(sourcingTrip));
    onCancel();
  };

  const update = (key: keyof AddToInventoryFormValues, value: string) => {
    setValues((current) => ({ ...current, [key]: value }));
  };

  const captureReceipt = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Camera access needed",
        "Allow KeepFlip to use the camera so you can attach a receipt photo.",
      );
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: false,
      mediaTypes: ["images"],
      quality: 0.9,
    });
    if (result.canceled) return;

    const uri = result.assets[0]?.uri;
    if (!uri) throw new Error("KeepFlip could not read that receipt photo.");
    update("receiptReference", uri);
  };

  const chooseReceipt = async () => {
    const permission =
      await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Photo access needed",
        "Allow KeepFlip to choose a receipt photo from your device.",
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: false,
      mediaTypes: ["images"],
      quality: 0.9,
    });
    if (result.canceled) return;

    const uri = result.assets[0]?.uri;
    if (!uri) throw new Error("KeepFlip could not read that receipt photo.");
    update("receiptReference", uri);
  };

  const runReceiptPicker = async (picker: () => Promise<void>) => {
    try {
      await picker();
    } catch (error) {
      Alert.alert(
        "Could not add receipt",
        error instanceof Error
          ? error.message
          : "KeepFlip could not attach that receipt photo.",
      );
    }
  };

  const chooseReceiptSource = () => {
    if (submitting) return;
    Alert.alert(
      "Add receipt",
      "Capture a receipt or choose a photo from your device.",
      [
        {
          text: "Take photo",
          onPress: () => {
            void runReceiptPicker(captureReceipt);
          },
        },
        {
          text: "Choose photo",
          onPress: () => {
            void runReceiptPicker(chooseReceipt);
          },
        },
        { text: "Cancel", style: "cancel" },
      ],
    );
  };

  const styles = useResponsiveStyles(createResponsiveStyles);

  return (
    <Modal
      animationType="none"
      onRequestClose={submitting ? undefined : handleCancel}
      statusBarTranslucent
      transparent
      visible={visible}
    >
      {visible ? (
        <Animated.View
          entering={FadeIn.duration(500)}
          style={styles.modalLayer}
        >
          <KeyboardAvoidingView
            behavior={Platform.OS === "ios" ? "padding" : undefined}
            style={styles.backdrop}
          >
            <Animated.View
              entering={SlideInUp.duration(500)}
              style={[styles.sheet, { maxHeight: height - insets.bottom }]}
            >
              <View style={[styles.header, { paddingTop: insets.top + 20 }]}>
                <View style={styles.headerCopy}>
                  <Text style={[styles.eyebrow, { fontSize: responsiveFont(10) }]}>BOOKS &amp; RECORDS</Text>
                  <Text numberOfLines={2} style={[styles.title, { fontSize: responsiveFont(22), lineHeight: 27 }]}>
                    Add {itemTitle} to inventory
                  </Text>
                  <Text style={[styles.subtitle, { fontSize: responsiveFont(13), lineHeight: 18 }]}>
                    Confirm what you actually paid. KeepFlip&apos;s projection stays separate from these records.
                  </Text>
                </View>
                <Pressable
                  accessibilityLabel="Close add to inventory form"
                  accessibilityRole="button"
                  disabled={submitting}
                  hitSlop={10}
                  onPress={handleCancel}
                  style={styles.closeButton}
                >
                  <Text style={[styles.closeText, { fontSize: responsiveFont(24), lineHeight: 26 }]}>×</Text>
                </Pressable>
              </View>

              {sourcingTrip ? (
                <View style={styles.sourceTripNotice}>
                  <Text style={[styles.sourceTripEyebrow, { fontSize: responsiveFont(9) }]}>ACTIVE SOURCE TRIP</Text>
                  <Text numberOfLines={2} style={[styles.sourceTripCopy, { fontSize: responsiveFont(12), lineHeight: 16 }]}>
                    {sourcingTrip.trip.label || sourcingTrip.trip.sourceName} · {sourcingTrip.findCount} saved find{sourcingTrip.findCount === 1 ? "" : "s"} · {money(sourcingTrip.allocatedCostCents)} allocated
                  </Text>
                  <Text style={styles.sourceTripHelper}>
                    This item keeps its own actual cost, then returns you to the scanner for the next find.
                  </Text>
                </View>
              ) : null}

              <ScrollView
                contentContainerStyle={styles.content}
                keyboardShouldPersistTaps="handled"
                showsVerticalScrollIndicator={false}
              >
                <View style={styles.twoColumn}>
                  <View style={styles.column}>
                    <FieldLabel required>Total paid</FieldLabel>
                    <TextInput
                      autoFocus
                      editable={!submitting}
                      keyboardType="decimal-pad"
                      onChangeText={(value) => update("acquisitionCost", value)}
                      placeholder="$0.00"
                      placeholderTextColor="rgba(255,255,255,0.34)"
                      style={styles.input}
                      value={values.acquisitionCost}
                    />
                  </View>
                  <View style={styles.quantityColumn}>
                    <FieldLabel required>How many?</FieldLabel>
                    <TextInput
                      editable={!submitting}
                      keyboardType="number-pad"
                      onChangeText={(value) => update("quantity", value)}
                      placeholder="1"
                      placeholderTextColor="rgba(255,255,255,0.34)"
                      style={styles.input}
                      value={values.quantity}
                    />
                  </View>
                </View>
                <Text style={styles.helper}>
                  This actual amount becomes COGS. KeepFlip keeps the market buy ceiling separate and tracks the cost per item as units sell.
                </Text>
                <View style={styles.column}>
                  <FieldLabel required>Acquisition date</FieldLabel>
                  <TextInput
                    editable={!submitting}
                    keyboardType="numbers-and-punctuation"
                    onChangeText={(value) => update("acquiredAt", value)}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor="rgba(255,255,255,0.34)"
                    style={styles.input}
                    value={values.acquiredAt}
                  />
                </View>
                <View style={styles.twoColumn}>
                  <View style={styles.column}>
                    <FieldLabel>Purchase source</FieldLabel>
                    <TextInput
                      editable={!submitting}
                      onChangeText={(value) => update("source", value)}
                      placeholder="Thrift store, auction..."
                      placeholderTextColor="rgba(255,255,255,0.34)"
                      style={styles.input}
                      value={values.source}
                    />
                  </View>
                  <View style={styles.column}>
                    <FieldLabel>SKU / tag</FieldLabel>
                    <TextInput
                      editable={!submitting}
                      onChangeText={(value) => update("sku", value)}
                      placeholder="Optional"
                      placeholderTextColor="rgba(255,255,255,0.34)"
                      style={styles.input}
                      value={values.sku}
                    />
                  </View>
                </View>
                <View style={styles.column}>
                  <FieldLabel>Storage location</FieldLabel>
                  <TextInput
                    editable={!submitting}
                    onChangeText={(value) => update("location", value)}
                    placeholder="Bin, shelf, or room"
                    placeholderTextColor="rgba(255,255,255,0.34)"
                    style={styles.input}
                    value={values.location}
                  />
                </View>
                <View style={styles.column}>
                  <FieldLabel>Extra item details</FieldLabel>
                  <TextInput
                    editable={!submitting}
                    multiline
                    onChangeText={(value) => update("itemSpecifics", value)}
                    placeholder={"Size: Large\nMaterial: Leather\nMeasurements: 20 in"}
                    placeholderTextColor="rgba(255,255,255,0.34)"
                    style={[styles.input, styles.notesInput]}
                    value={values.itemSpecifics}
                  />
                  <Text style={styles.helper}>
                    Add one detail per line. These stay with the item for future listings.
                  </Text>
                </View>
                <View style={styles.column}>
                  <FieldLabel>Receipt photo</FieldLabel>
                  <Pressable
                    accessibilityHint="Opens the camera or photo library to attach a receipt"
                    accessibilityRole="button"
                    disabled={submitting}
                    onPress={chooseReceiptSource}
                    style={({ pressed }) => [
                      styles.receiptButton,
                      pressed && styles.pressed,
                      submitting && styles.disabled,
                    ]}
                  >
                    {values.receiptReference ? (
                      <Image
                        resizeMode="cover"
                        source={{ uri: values.receiptReference }}
                        style={styles.receiptPreview}
                      />
                    ) : null}
                    <View style={styles.receiptButtonCopy}>
                      <Text style={[styles.receiptButtonTitle, { fontSize: responsiveFont(10) }]}>
                        {values.receiptReference
                          ? "RECEIPT ATTACHED"
                          : "ADD RECEIPT PHOTO"}
                      </Text>
                      <Text style={[styles.receiptButtonSubtitle, { fontSize: responsiveFont(11), lineHeight: 15 }]}>
                        {values.receiptReference
                          ? "Tap to replace the photo"
                          : sourcingTrip?.trip.receiptFileId
                            ? "A shared trip receipt is already on file"
                            : sourcingTrip
                              ? "Attach an item receipt, or add the shared trip receipt when you close it"
                              : "Take a photo or choose one from your device"}
                      </Text>
                    </View>
                    <Text style={[styles.receiptButtonArrow, { fontSize: responsiveFont(24) }]}>›</Text>
                  </Pressable>
                </View>
                <View style={styles.column}>
                  <FieldLabel>Purchase notes</FieldLabel>
                  <TextInput
                    editable={!submitting}
                    multiline
                    onChangeText={(value) => update("notes", value)}
                    placeholder="Anything useful about this purchase"
                    placeholderTextColor="rgba(255,255,255,0.34)"
                    style={[styles.input, styles.notesInput]}
                    value={values.notes}
                  />
                </View>
                <View style={styles.actions}>
                  <Pressable
                    accessibilityRole="button"
                    disabled={submitting}
                    onPress={handleCancel}
                    style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}
                  >
                    <Text style={[styles.cancelText, { fontSize: responsiveFont(10) }]}>CANCEL</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    disabled={submitting}
                    onPress={() => void onSubmit(values)}
                    style={({ pressed }) => [styles.submitButton, pressed && styles.pressed, submitting && styles.disabled]}
                  >
                    <Text style={[styles.submitText, { fontSize: responsiveFont(10) }]}>{submitting ? "SAVING..." : "ADD TO INVENTORY & BOOKS"}</Text>
                  </Pressable>
                </View>
              </ScrollView>
            </Animated.View>
          </KeyboardAvoidingView>
        </Animated.View>
      ) : null}
    </Modal>
  );
};
