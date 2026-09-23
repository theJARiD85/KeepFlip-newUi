import * as ImagePicker from 'expo-image-picker';
import { useState } from 'react';
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
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useSourcingTrip } from '@/components/sourcing/sourcing-trip-context';
import { IconSymbol } from '@/components/ui/icon-symbol';
import {
  KeepFlipText as Text,
  KeepFlipTextInput as TextInput,
} from '@/components/ui/keepflip-text';
import { keepFlipTheme as theme } from '@/constants/keepflip-theme';
import {
  useResponsiveLayout,
  useResponsiveStyles,
} from '@/hooks/use-responsive-layout';
import {
  centsFromLedgerAmount,
  parseLedgerDate,
  todayBusinessDate,
} from '@/services/reseller-ledger-service';
import { formatSourcingTripMiles } from '@/services/sourcing-trip-location-service';

type TripFormValues = {
  sourceName: string;
  label: string;
  startedAt: string;
  budget: string;
  notes: string;
};

function emptyTripForm(): TripFormValues {
  return {
    sourceName: '',
    label: '',
    startedAt: todayBusinessDate(),
    budget: '',
    notes: '',
  };
}

function money(cents: number) {
  return `$${(cents / 100).toFixed(2)}`;
}

function signedMoney(cents: number) {
  return `${cents >= 0 ? '+' : '−'}${money(Math.abs(cents))}`;
}

function FieldLabel({ children, required = false }: { children: string; required?: boolean }) {
  const styles = useResponsiveStyles(createResponsiveStyles);
  const {
    responsiveFont
  } = useResponsiveLayout();

  return (
    <Text style={[styles.fieldLabel, { fontSize: responsiveFont(9) }]}>
      {children.toUpperCase()}{required ? ' · REQUIRED' : null}
    </Text>
  );
}

export function SourcingTripControl() {
  const styles = useResponsiveStyles(createResponsiveStyles);
  const {
    responsiveFont
  } = useResponsiveLayout();

  const insets = useSafeAreaInsets();
  const {
    activeTrip,
    configured,
    finishActiveTrip,
    isLoading,
    locationSnapshot,
    startTrip,
  } = useSourcingTrip();
  const [dialog, setDialog] = useState<'start' | 'location-disclosure' | 'finish' | null>(null);
  const [tripForm, setTripForm] = useState<TripFormValues>(emptyTripForm);
  const [receiptTotal, setReceiptTotal] = useState('');
  const [receiptReference, setReceiptReference] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const activeName = activeTrip
    ? activeTrip.trip.label || activeTrip.trip.sourceName
    : null;
  const tripButtonTitle = activeTrip
    ? activeName ?? 'Active sourcing trip'
    : configured
      ? 'Start a sourcing trip'
      : 'Set up sourcing trips';
  const tripButtonDetail = activeTrip
    ? locationSnapshot
      ? `${formatSourcingTripMiles(locationSnapshot.distanceMeters)} tracked · ${locationSnapshot.trackingMode === 'background' ? 'BACKGROUND LOCATION ON' : 'FOREGROUND LOCATION ON'} · ${activeTrip.findCount} find${activeTrip.findCount === 1 ? '' : 's'}`
      : `${activeTrip.findCount} saved find${activeTrip.findCount === 1 ? '' : 's'} · MILEAGE UNAVAILABLE`
    : configured
      ? 'GROUP THIS OUTING\'S FINDS'
      : 'APPWRITE SETUP NEEDED';

  const openControl = () => {
    if (!configured) {
      Alert.alert(
        'Sourcing Trips setup needed',
        'Create the sourcing_trips and sourcing_trip_finds Appwrite tables, then add their public resource IDs to this build. The schema is documented in docs/SOURCING_TRIPS_APPWRITE_SCHEMA.md.',
      );
      return;
    }
    if (isLoading || submitting) return;
    if (activeTrip) {
      setReceiptTotal(
        activeTrip.trip.receiptTotalCents == null
          ? ''
          : (activeTrip.trip.receiptTotalCents / 100).toFixed(2),
      );
      setReceiptReference('');
      setDialog('finish');
      return;
    }
    setTripForm(emptyTripForm());
    setDialog('start');
  };

  const updateTripField = (key: keyof TripFormValues, value: string) => {
    setTripForm((current) => ({ ...current, [key]: value }));
  };

  const handleStart = () => {
    const startedAt = parseLedgerDate(tripForm.startedAt);
    const budgetCents = tripForm.budget.trim()
      ? centsFromLedgerAmount(tripForm.budget)
      : null;

    if (!tripForm.sourceName.trim()) {
      Alert.alert('Name the source', 'For example: Goodwill on Main, estate sale, or flea market.');
      return;
    }
    if (!startedAt) {
      Alert.alert('Check the date', 'Use a real sourcing date in YYYY-MM-DD format.');
      return;
    }
    if (tripForm.budget.trim() && !budgetCents) {
      Alert.alert('Check planned spend', 'Enter an amount from $0.01 to $10,000,000.00.');
      return;
    }

    setDialog('location-disclosure');
  };

  const confirmLocationDisclosure = async () => {
    if (submitting) return;

    const startedAt = parseLedgerDate(tripForm.startedAt);
    const budgetCents = tripForm.budget.trim()
      ? centsFromLedgerAmount(tripForm.budget)
      : null;
    if (!startedAt || (tripForm.budget.trim() && !budgetCents)) {
      setDialog('start');
      Alert.alert(
        'Check the trip details',
        'Review the date and planned spend before starting the sourcing trip.',
      );
      return;
    }

    setSubmitting(true);
    try {
      await startTrip({
        sourceName: tripForm.sourceName,
        label: tripForm.label,
        startedAt,
        budgetCents,
        notes: tripForm.notes,
      });
      setDialog(null);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'KeepFlip could not start that sourcing trip.';
      console.log('Could not start trip', message);
      setDialog('start');
      Alert.alert(
        'Location access needed',
        `${message} You can try again or choose Cancel to leave the trip unopened.`,
      );
    } finally {
      setSubmitting(false);
    }
  };

  const captureReceipt = async () => {
    const permission = await ImagePicker.requestCameraPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Camera access needed',
        'Allow KeepFlip to use the camera so you can attach the trip receipt.',
      );
      return;
    }

    const result = await ImagePicker.launchCameraAsync({
      allowsEditing: false,
      mediaTypes: ['images'],
      quality: 0.9,
    });
    if (result.canceled) return;

    const uri = result.assets[0]?.uri;
    if (!uri) throw new Error('KeepFlip could not read that receipt photo.');
    setReceiptReference(uri);
  };

  const chooseReceipt = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Photo access needed',
        'Allow KeepFlip to choose a receipt photo from your device.',
      );
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      allowsEditing: false,
      mediaTypes: ['images'],
      quality: 0.9,
    });
    if (result.canceled) return;

    const uri = result.assets[0]?.uri;
    if (!uri) throw new Error('KeepFlip could not read that receipt photo.');
    setReceiptReference(uri);
  };

  const chooseReceiptSource = () => {
    if (submitting) return;
    Alert.alert('Attach trip receipt', 'Capture a receipt or choose a photo from your device.', [
      {
        text: 'Take photo',
        onPress: () => {
          void captureReceipt().catch((error) => {
            console.log(
              'Could not add receipt',
              error instanceof Error ? error.message : 'KeepFlip could not attach that receipt photo.',
            );
          });
        },
      },
      {
        text: 'Choose photo',
        onPress: () => {
          void chooseReceipt().catch((error) => {
            console.log(
              'Could not add receipt',
              error instanceof Error ? error.message : 'KeepFlip could not attach that receipt photo.',
            );
          });
        },
      },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const handleFinish = async () => {
    if (!activeTrip) return;
    const receiptTotalCents = receiptTotal.trim()
      ? centsFromLedgerAmount(receiptTotal)
      : undefined;
    if (receiptTotal.trim() && !receiptTotalCents) {
      Alert.alert('Check receipt total', 'Enter an amount from $0.01 to $10,000,000.00.');
      return;
    }

    setSubmitting(true);
    try {
      await finishActiveTrip({
        receiptReference,
        receiptTotalCents,
      });
      setDialog(null);
      Alert.alert(
        'Sourcing trip closed',
        `${activeTrip.findCount} saved find${activeTrip.findCount === 1 ? '' : 's'} remain linked to this trip. ${locationSnapshot ? `${formatSourcingTripMiles(locationSnapshot.distanceMeters)} of mileage was recorded.` : 'Mileage was not available for this trip.'}`,
      );
    } catch (error) {
      console.log(
        'Could not close trip',
        error instanceof Error ? error.message : 'KeepFlip could not close that sourcing trip.',
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <Pressable
        accessibilityHint={
          activeTrip
            ? 'Opens the active sourcing trip to attach a receipt or close it'
            : 'Starts a sourcing trip that groups each item you save from this outing'
        }
        accessibilityLabel={activeTrip ? `Active sourcing trip: ${activeName}` : 'Start sourcing trip'}
        accessibilityRole="button"
        disabled={isLoading || submitting}
        onPress={openControl}
        style={({ pressed }) => [
          styles.tripButton,
          activeTrip && styles.tripButtonActive,
          pressed && styles.tripButtonPressed,
          (isLoading || submitting) && styles.disabled,
        ]}
      >
        <IconSymbol
          color={activeTrip ? theme.colors.scannerCyan : theme.colors.goldMuted}
          name="rectangle.stack.fill"
          size={29}
        />
        <View style={styles.tripButtonCopy}>
          <Text numberOfLines={1} style={[styles.tripButtonTitle, { fontSize: responsiveFont(13) }]}>
            {tripButtonTitle}
          </Text>
          <Text numberOfLines={1} style={[styles.tripButtonDetail, activeTrip && styles.tripButtonDetailActive]}>
            {tripButtonDetail}
          </Text>
        </View>
        <IconSymbol
          color={activeTrip ? theme.colors.scannerCyan : theme.colors.goldMuted}
          name="chevron.right"
          size={18}
        />
      </Pressable>

      <Modal
        animationType="fade"
        onRequestClose={submitting ? undefined : () => setDialog(null)}
        statusBarTranslucent
        transparent
        visible={dialog === 'start'}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalBackdrop}
        >
          <ScrollView
            contentContainerStyle={[
              styles.modalScroll,
              { paddingTop: insets.top + 26, paddingBottom: insets.bottom + 26 },
            ]}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.modalSurface}>
              <View style={styles.modalHeader}>
                <View style={styles.modalHeaderCopy}>
                  <Text style={[styles.modalEyebrow, { fontSize: responsiveFont(9) }]}>SOURCE ONCE · SAVE AS YOU GO</Text>
                  <Text style={[styles.modalTitle, { fontSize: responsiveFont(24), lineHeight: 29 }]}>Start a sourcing trip</Text>
                  <Text style={[styles.modalBody, { fontSize: responsiveFont(13), lineHeight: 18 }]}>
                    Keep each find, its actual cost, and the shared receipt connected without turning the scanner into a spreadsheet.
                  </Text>
                </View>
                <Pressable
                  accessibilityLabel="Close start sourcing trip form"
                  accessibilityRole="button"
                  disabled={submitting}
                  onPress={() => setDialog(null)}
                  style={styles.closeButton}
                >
                  <Text style={[styles.closeText, { fontSize: responsiveFont(24), lineHeight: 26 }]}>×</Text>
                </Pressable>
              </View>

              <View style={styles.formContent}>
                <View>
                  <FieldLabel required>Where are you sourcing?</FieldLabel>
                  <TextInput
                    autoFocus
                    editable={!submitting}
                    onChangeText={(value) => updateTripField('sourceName', value)}
                    placeholder="Goodwill, estate sale, flea market..."
                    placeholderTextColor={theme.colors.textMuted}
                    style={styles.input}
                    value={tripForm.sourceName}
                  />
                </View>
                <View style={styles.twoColumn}>
                  <View style={styles.column}>
                    <FieldLabel>Trip label</FieldLabel>
                    <TextInput
                      editable={!submitting}
                      onChangeText={(value) => updateTripField('label', value)}
                      placeholder="Saturday route"
                      placeholderTextColor={theme.colors.textMuted}
                      style={styles.input}
                      value={tripForm.label}
                    />
                  </View>
                  <View style={styles.dateColumn}>
                    <FieldLabel required>Date</FieldLabel>
                    <TextInput
                      editable={!submitting}
                      keyboardType="numbers-and-punctuation"
                      onChangeText={(value) => updateTripField('startedAt', value)}
                      placeholder="YYYY-MM-DD"
                      placeholderTextColor={theme.colors.textMuted}
                      style={styles.input}
                      value={tripForm.startedAt}
                    />
                  </View>
                </View>
                <View>
                  <FieldLabel>Planned spend</FieldLabel>
                  <TextInput
                    editable={!submitting}
                    keyboardType="decimal-pad"
                    onChangeText={(value) => updateTripField('budget', value)}
                    placeholder="$0.00"
                    placeholderTextColor={theme.colors.textMuted}
                    style={styles.input}
                    value={tripForm.budget}
                  />
                  <Text style={styles.helper}>
                    Optional. It becomes a guardrail, not a claim about profit.
                  </Text>
                </View>
                <View style={styles.locationNoticeCard}>
                  <IconSymbol color={theme.colors.scannerCyan} name="location.fill" size={20} />
                  <View style={styles.locationNoticeCopy}>
                    <Text style={[styles.locationNoticeTitle, { fontSize: responsiveFont(9) }]}>LOCATION · ACTIVE TRIP ONLY</Text>
                    <Text style={[styles.locationNoticeBody, { fontSize: responsiveFont(11), lineHeight: 16 }]}>KeepFlip asks for location permission only when you start this trip. Background location may continue while you travel so the app can calculate business mileage until you close the trip.</Text>
                  </View>
                </View>
                <View>
                  <FieldLabel>Trip notes</FieldLabel>
                  <TextInput
                    editable={!submitting}
                    multiline
                    onChangeText={(value) => updateTripField('notes', value)}
                    placeholder="Store-wide sale, bins to revisit, sourcing conditions..."
                    placeholderTextColor={theme.colors.textMuted}
                    style={[styles.input, styles.notesInput]}
                    value={tripForm.notes}
                  />
                </View>
                <View style={styles.actions}>
                  <Pressable
                    accessibilityRole="button"
                    disabled={submitting}
                    onPress={() => setDialog(null)}
                    style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}
                  >
                    <Text style={[styles.cancelText, { fontSize: responsiveFont(9) }]}>CANCEL</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    disabled={submitting}
                    onPress={() => void handleStart()}
                    style={({ pressed }) => [
                      styles.primaryButton,
                      pressed && styles.pressed,
                      submitting && styles.disabled,
                    ]}
                  >
                    <Text style={[styles.primaryButtonText, { fontSize: responsiveFont(10) }]}>
                      {submitting ? 'STARTING...' : 'START & SCAN'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        animationType="fade"
        onRequestClose={submitting ? undefined : () => setDialog('start')}
        statusBarTranslucent
        transparent
        visible={dialog === 'location-disclosure'}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalBackdrop}
        >
          <ScrollView
            contentContainerStyle={[
              styles.modalScroll,
              { paddingTop: insets.top + 26, paddingBottom: insets.bottom + 26 },
            ]}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.modalSurface}>
              <View style={styles.modalHeader}>
                <View style={styles.modalHeaderCopy}>
                  <Text style={[styles.modalEyebrow, { fontSize: responsiveFont(9) }]}>LOCATION PERMISSION · ACTIVE TRIP ONLY</Text>
                  <Text style={[styles.modalTitle, { fontSize: responsiveFont(24), lineHeight: 29 }]}>KeepFlip needs location for trip mileage</Text>
                  <Text style={[styles.modalBody, { fontSize: responsiveFont(13), lineHeight: 18 }]}>When you start this sourcing trip, KeepFlip uses your location while you travel to calculate total business mileage for this outing.</Text>
                </View>
                <Pressable
                  accessibilityLabel="Close location disclosure"
                  accessibilityRole="button"
                  disabled={submitting}
                  onPress={() => setDialog('start')}
                  style={styles.closeButton}
                >
                  <Text style={[styles.closeText, { fontSize: responsiveFont(24), lineHeight: 26 }]}>×</Text>
                </Pressable>
              </View>

              <View style={styles.formContent}>
                <View style={styles.locationDisclosureCard}>
                  <IconSymbol color={theme.colors.scannerCyan} name="location.fill" size={23} />
                  <View style={styles.locationDisclosureCopy}>
                    <Text style={[styles.locationDisclosureTitle, { fontSize: responsiveFont(10) }]}>WHAT KEEPFLIP WILL DO</Text>
                    <Text style={[styles.locationDisclosureBody, { fontSize: responsiveFont(12), lineHeight: 17 }]}>On supported native builds, location may continue while KeepFlip is in the background so mileage can be measured while you drive. Tracking begins after you grant permission and ends when you close this active trip.</Text>
                  </View>
                </View>
                <Text style={[styles.modalBody, { fontSize: responsiveFont(13), lineHeight: 18 }]}>KeepFlip stores the mileage total and trip metadata, not a user-facing route history. The next step will show the device permission prompts. If you choose Not now, no location permission is requested and the trip stays unopened.</Text>
                <View style={styles.actions}>
                  <Pressable
                    accessibilityRole="button"
                    disabled={submitting}
                    onPress={() => setDialog('start')}
                    style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}
                  >
                    <Text style={[styles.cancelText, { fontSize: responsiveFont(9) }]}>NOT NOW</Text>
                  </Pressable>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityState={{ busy: submitting }}
                    disabled={submitting}
                    onPress={() => void confirmLocationDisclosure()}
                    style={({ pressed }) => [
                      styles.primaryButton,
                      pressed && styles.pressed,
                      submitting && styles.disabled,
                    ]}
                  >
                    <Text style={[styles.primaryButtonText, { fontSize: responsiveFont(10) }]}>
                      {submitting ? 'ASKING PERMISSION...' : 'ALLOW & START TRIP'}
                    </Text>
                  </Pressable>
                </View>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>

      <Modal
        animationType="fade"
        onRequestClose={submitting ? undefined : () => setDialog(null)}
        statusBarTranslucent
        transparent
        visible={dialog === 'finish' && activeTrip != null}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalBackdrop}
        >
          <ScrollView
            contentContainerStyle={[
              styles.modalScroll,
              { paddingTop: insets.top + 26, paddingBottom: insets.bottom + 26 },
            ]}
            keyboardShouldPersistTaps="handled"
          >
            {activeTrip ? (
              <View style={styles.modalSurface}>
                <View style={styles.modalHeader}>
                  <View style={styles.modalHeaderCopy}>
                    <Text style={[styles.modalEyebrow, { fontSize: responsiveFont(9) }]}>ACTIVE SOURCE TRIP</Text>
                    <Text style={[styles.modalTitle, { fontSize: responsiveFont(24), lineHeight: 29 }]}>{activeName}</Text>
                    <Text style={[styles.modalBody, { fontSize: responsiveFont(13), lineHeight: 18 }]}>
                      {activeTrip.findCount} saved find{activeTrip.findCount === 1 ? '' : 's'} · {money(activeTrip.allocatedCostCents)} allocated
                    </Text>
                  </View>
                  <Pressable
                    accessibilityLabel="Close sourcing trip details"
                    accessibilityRole="button"
                    disabled={submitting}
                    onPress={() => setDialog(null)}
                    style={styles.closeButton}
                  >
                    <Text style={[styles.closeText, { fontSize: responsiveFont(24), lineHeight: 26 }]}>×</Text>
                  </Pressable>
                </View>

                <View style={styles.formContent}>
                  <View style={styles.summaryGrid}>
                    <View style={styles.summaryCell}>
                      <Text style={[styles.summaryLabel, { fontSize: responsiveFont(7) }]}>ACTUAL COSTS</Text>
                      <Text style={[styles.summaryValue, { fontSize: responsiveFont(17) }]}>{money(activeTrip.allocatedCostCents)}</Text>
                    </View>
                    <View style={styles.summaryCell}>
                      <Text style={[styles.summaryLabel, { fontSize: responsiveFont(7) }]}>EST. RESALE SIGNAL</Text>
                      <Text style={[styles.summaryValue, { fontSize: responsiveFont(17) }]}>
                        {activeTrip.estimatedFindCount > 0
                          ? money(activeTrip.estimatedResaleCents)
                          : '—'}
                      </Text>
                    </View>
                    <View style={styles.summaryCell}>
                      <Text style={[styles.summaryLabel, { fontSize: responsiveFont(7) }]}>MILES TRACKED</Text>
                      <Text style={[styles.summaryValue, { fontSize: responsiveFont(17) }]}>
                        {formatSourcingTripMiles(
                          locationSnapshot?.distanceMeters ?? activeTrip.trip.mileageMeters,
                        )}
                      </Text>
                    </View>
                  </View>
                  <Text style={styles.locationNotice}>
                    {locationSnapshot?.trackingMode === 'background'
                      ? 'Background mileage tracking is active. Review the final miles before using them for your tax records.'
                      : locationSnapshot
                        ? 'Foreground-only mileage tracking is active. Keep KeepFlip open while you travel so the record stays complete.'
                        : 'Mileage tracking was not available for this trip. Do not use the displayed amount as a complete tax record.'}
                  </Text>
                  {activeTrip.estimatedGrossSpreadCents != null ? (
                    <Text style={styles.caution}>
                      Gross spread signal {signedMoney(activeTrip.estimatedGrossSpreadCents)} before fees, shipping, taxes, repairs, and time.
                    </Text>
                  ) : null}
                  <View>
                    <FieldLabel>Receipt total</FieldLabel>
                    <TextInput
                      editable={!submitting}
                      keyboardType="decimal-pad"
                      onChangeText={setReceiptTotal}
                      placeholder="Optional checkout total"
                      placeholderTextColor={theme.colors.textMuted}
                      style={styles.input}
                      value={receiptTotal}
                    />
                    <Text style={styles.helper}>
                      KeepFlip shows any amount not yet allocated to a saved item; it does not invent a cost split.
                    </Text>
                  </View>
                  <View>
                    <FieldLabel>Shared receipt photo</FieldLabel>
                    <Pressable
                      accessibilityHint="Opens the camera or photo library to attach a receipt to this sourcing trip"
                      accessibilityRole="button"
                      disabled={submitting}
                      onPress={chooseReceiptSource}
                      style={({ pressed }) => [
                        styles.receiptButton,
                        pressed && styles.pressed,
                        submitting && styles.disabled,
                      ]}
                    >
                      {receiptReference ? (
                        <Image source={{ uri: receiptReference }} style={styles.receiptPreview} />
                      ) : null}
                      <View style={styles.receiptCopy}>
                        <Text style={[styles.receiptTitle, { fontSize: responsiveFont(9) }]}>
                          {receiptReference
                            ? 'NEW RECEIPT READY'
                            : activeTrip.trip.receiptFileId
                              ? 'RECEIPT ALREADY ATTACHED'
                              : 'ADD SHARED RECEIPT'}
                        </Text>
                        <Text style={[styles.receiptSubtitle, { fontSize: responsiveFont(11), lineHeight: 15 }]}>
                          {receiptReference
                            ? 'Tap to replace this photo before closing'
                            : activeTrip.trip.receiptFileId
                              ? 'Tap to replace the receipt attached to this trip'
                              : 'Take a photo or choose one from your device'}
                        </Text>
                      </View>
                      <Text style={styles.receiptArrow}>›</Text>
                    </Pressable>
                  </View>
                  {activeTrip.trip.receiptTotalCents != null ? (
                    <Text
                      style={[
                        styles.reconcile,
                        activeTrip.receiptVarianceCents === 0 && styles.reconcileBalanced,
                      ]}
                    >
                      {activeTrip.receiptVarianceCents === 0
                        ? 'Receipt is fully allocated across saved finds.'
                        : `${signedMoney(activeTrip.receiptVarianceCents ?? 0)} remains ${(activeTrip.receiptVarianceCents ?? 0) >= 0
                          ? 'unallocated from the receipt'
                          : 'over the receipt total'
                        }.`}
                    </Text>
                  ) : null}
                  <View style={styles.actions}>
                    <Pressable
                      accessibilityRole="button"
                      disabled={submitting}
                      onPress={() => setDialog(null)}
                      style={({ pressed }) => [styles.cancelButton, pressed && styles.pressed]}
                    >
                      <Text style={[styles.cancelText, { fontSize: responsiveFont(9) }]}>KEEP TRIP OPEN</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      disabled={submitting}
                      onPress={() => void handleFinish()}
                      style={({ pressed }) => [
                        styles.primaryButton,
                        pressed && styles.pressed,
                        submitting && styles.disabled,
                      ]}
                    >
                      <Text style={[styles.primaryButtonText, { fontSize: responsiveFont(10) }]}>
                        {submitting ? 'CLOSING...' : 'CLOSE TRIP'}
                      </Text>
                    </Pressable>
                  </View>
                </View>
              </View>
            ) : null}
          </ScrollView>
        </KeyboardAvoidingView>
      </Modal>
    </>
  );
}

function createResponsiveStyles(responsiveLayout: ReturnType<typeof useResponsiveLayout>) {
  const { responsiveFont, responsiveWidth, responsiveHeight } = responsiveLayout;
  const staticStyles = StyleSheet.create({
    tripButton: {
      width: '100%',
      minHeight: 54,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 11,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: theme.radii.medium,
      borderWidth: 1,
      borderColor: theme.colors.dividerStrong,
      backgroundColor: theme.colors.cardSoft,
    },
    tripButtonActive: {
      borderColor: theme.colors.accentCyanBorder,
      backgroundColor: theme.colors.iconSurfaceCyan,
    },
    tripButtonPressed: { opacity: 0.76 },
    tripButtonCopy: {
      minWidth: 0,
      flex: 1,
      gap: 2,
    },
    tripButtonTitle: {
      color: theme.colors.cream,
      fontSize: 13,
      fontWeight: '800',
    },
    tripButtonDetail: {
      color: theme.colors.textMuted,
      fontSize: 7,
      fontWeight: '900',
      letterSpacing: 1.2,
    },
    tripButtonDetailActive: { color: theme.colors.scannerCyan },
    modalBackdrop: {
      flex: 1,
      backgroundColor: theme.colors.surfaceInset,
    },
    modalScroll: {
      flexGrow: 1,
      justifyContent: 'center',
      paddingHorizontal: 16,
    },
    modalSurface: {
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: theme.colors.accentCyanBorder,
      backgroundColor: theme.colors.surfaceSoft,
      boxShadow: '0 20px 50px rgba(0, 0, 0, 0.52)',
    },
    modalHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 14,
      padding: 19,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: theme.colors.divider,
    },
    modalHeaderCopy: { flex: 1, gap: 5 },
    modalEyebrow: {
      color: theme.colors.scannerCyan,
      fontFamily: theme.fonts.radar,
      fontSize: 9,
      fontWeight: '900',
      letterSpacing: 1.05,
    },
    modalTitle: {
      color: theme.colors.cream,
      fontFamily: theme.fonts.display,
      fontSize: 24,
      fontWeight: '800',
      lineHeight: 29,
    },
    modalBody: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.body,
      fontSize: 13,
      lineHeight: 18,
    },
    locationNotice: {
      color: theme.colors.goldMuted,
      fontFamily: theme.fonts.body,
      fontSize: 10,
      lineHeight: 14,
    },
    locationNoticeCard: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      padding: 12,
      borderWidth: 1,
      borderColor: theme.colors.accentCyanBorder,
      backgroundColor: theme.colors.iconSurfaceCyan,
    },
    locationNoticeCopy: { flex: 1, gap: 3 },
    locationNoticeTitle: {
      color: theme.colors.scannerCyan,
      fontFamily: theme.fonts.radar,
      fontSize: 9,
      fontWeight: '900',
      letterSpacing: 0.75,
    },
    locationNoticeBody: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.body,
      fontSize: 11,
      lineHeight: 16,
    },
    locationDisclosureCard: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 12,
      padding: 14,
      borderWidth: 1,
      borderColor: theme.colors.scannerCyan,
      backgroundColor: theme.colors.iconSurfaceCyan,
    },
    locationDisclosureCopy: { flex: 1, gap: 4 },
    locationDisclosureTitle: {
      color: theme.colors.scannerCyan,
      fontFamily: theme.fonts.radar,
      fontSize: 10,
      fontWeight: '900',
      letterSpacing: 0.8,
    },
    locationDisclosureBody: {
      color: theme.colors.cream,
      fontFamily: theme.fonts.body,
      fontSize: 12,
      lineHeight: 17,
    },
    closeButton: {
      width: 30,
      height: 30,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: theme.colors.dividerStrong,
    },
    closeText: {
      color: theme.colors.text,
      fontSize: 24,
      fontWeight: '300',
      lineHeight: 26,
    },
    formContent: { gap: 12, padding: 19 },
    fieldLabel: {
      marginBottom: 6,
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.radar,
      fontSize: 9,
      fontWeight: '900',
      letterSpacing: 0.75,
    },
    input: {
      minHeight: 44,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderWidth: 1,
      borderColor: theme.colors.divider,
      backgroundColor: theme.colors.cardSoft,
      color: theme.colors.text,
      fontFamily: theme.fonts.body,
      fontSize: 15,
    },
    notesInput: { minHeight: 76, textAlignVertical: 'top' },
    helper: {
      marginTop: 5,
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.body,
      fontSize: 11,
      lineHeight: 16,
    },
    twoColumn: { flexDirection: 'row', gap: 10 },
    column: { flex: 1.2, minWidth: 0 },
    dateColumn: { flex: 1, minWidth: 0 },
    actions: { flexDirection: 'row', gap: 10, marginTop: 6 },
    cancelButton: {
      minHeight: 46,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 13,
      borderWidth: 1,
      borderColor: theme.colors.dividerStrong,
    },
    primaryButton: {
      flex: 1,
      minHeight: 46,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 12,
      backgroundColor: theme.colors.goldBright,
    },
    cancelText: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.radar,
      fontSize: 9,
      fontWeight: '900',
      letterSpacing: 0.65,
    },
    primaryButtonText: {
      color: theme.colors.textOnAccent,
      fontFamily: theme.fonts.radar,
      fontSize: 10,
      fontWeight: '900',
      letterSpacing: 0.65,
    },
    summaryGrid: { flexDirection: 'row', gap: 7 },
    summaryCell: {
      flex: 1,
      gap: 4,
      padding: 11,
      borderWidth: 1,
      borderColor: theme.colors.accentCyanBorder,
      backgroundColor: theme.colors.iconSurfaceCyan,
    },
    summaryLabel: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.radar,
      fontSize: 7,
      fontWeight: '900',
      letterSpacing: 0.65,
    },
    summaryValue: {
      color: theme.colors.cream,
      fontFamily: theme.fonts.numbers,
      fontSize: 17,
      fontWeight: '900',
    },
    caution: {
      color: theme.colors.goldBright,
      fontFamily: theme.fonts.body,
      fontSize: 11,
      lineHeight: 16,
    },
    receiptButton: {
      minHeight: 60,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderWidth: 1,
      borderColor: theme.colors.accentCyanBorder,
      backgroundColor: theme.colors.iconSurfaceCyan,
    },
    receiptPreview: {
      width: 43,
      height: 43,
      borderWidth: 1,
      borderColor: theme.colors.divider,
    },
    receiptCopy: { flex: 1, minWidth: 0, gap: 3 },
    receiptTitle: {
      color: theme.colors.scannerCyan,
      fontFamily: theme.fonts.radar,
      fontSize: 9,
      fontWeight: '900',
      letterSpacing: 0.7,
    },
    receiptSubtitle: {
      color: theme.colors.textMuted,
      fontFamily: theme.fonts.body,
      fontSize: 11,
      lineHeight: 15,
    },
    receiptArrow: {
      color: theme.colors.scannerCyan,
      fontSize: 24,
      fontWeight: '300',
    },
    reconcile: {
      color: theme.colors.goldBright,
      fontFamily: theme.fonts.body,
      fontSize: 12,
      lineHeight: 17,
    },
    reconcileBalanced: { color: theme.colors.scannerCyan },
    pressed: { opacity: 0.76 },
    disabled: { opacity: 0.5 },
  });
  return {
    ...staticStyles,
    tripButtonTitle: [
      staticStyles.tripButtonTitle,
      {
        fontSize: responsiveFont(13),
      },
    ],
    tripButtonDetail: [
      staticStyles.tripButtonDetail,
      {
        fontSize: responsiveFont(7),
      },
    ],
    modalEyebrow: [
      staticStyles.modalEyebrow,
      {
        fontSize: responsiveFont(9),
      },
    ],
    modalTitle: [
      staticStyles.modalTitle,
      {
        fontSize: responsiveFont(24),
      },
    ],
    modalBody: [
      staticStyles.modalBody,
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
        fontSize: responsiveFont(9),
      },
    ],
    input: [
      staticStyles.input,
      {
        fontSize: responsiveFont(15),
      },
    ],
    helper: [
      staticStyles.helper,
      {
        fontSize: responsiveFont(11),
      },
    ],
    cancelText: [
      staticStyles.cancelText,
      {
        fontSize: responsiveFont(9),
      },
    ],
    primaryButtonText: [
      staticStyles.primaryButtonText,
      {
        fontSize: responsiveFont(10),
      },
    ],
    summaryLabel: [
      staticStyles.summaryLabel,
      {
        fontSize: responsiveFont(7),
      },
    ],
    summaryValue: [
      staticStyles.summaryValue,
      {
        fontSize: responsiveFont(17),
      },
    ],
    caution: [
      staticStyles.caution,
      {
        fontSize: responsiveFont(11),
      },
    ],
    receiptPreview: [
      staticStyles.receiptPreview,
      {
        width: responsiveWidth(43),
        height: responsiveHeight(43),
      },
    ],
    receiptTitle: [
      staticStyles.receiptTitle,
      {
        fontSize: responsiveFont(9),
      },
    ],
    receiptSubtitle: [
      staticStyles.receiptSubtitle,
      {
        fontSize: responsiveFont(11),
      },
    ],
    receiptArrow: [
      staticStyles.receiptArrow,
      {
        fontSize: responsiveFont(24),
      },
    ],
    reconcile: [
      staticStyles.reconcile,
      {
        fontSize: responsiveFont(12),
      },
    ],
  };
}
