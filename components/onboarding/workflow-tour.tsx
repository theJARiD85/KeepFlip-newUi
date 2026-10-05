import { useEffect, useMemo, useState } from 'react';
import { Image } from 'expo-image';
import { Pressable, StyleSheet, View } from 'react-native';
import Animated, { FadeInDown, SlideInRight, cancelAnimation, useAnimatedStyle, useReducedMotion, useSharedValue, withRepeat, withTiming } from 'react-native-reanimated';

import { BooksRecordRow } from '@/components/books/books-record-row';
import { FlipCompanion } from '@/components/flip';
import { InventoryCard } from '@/components/inventory/inventory-card';
import { SmartEvidenceCaptureGuide } from '@/components/scanner/smart-evidence-capture-guide';
import { ListingReadinessPanel } from '@/components/seller/listing-readiness-panel';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import { keepFlipTheme as theme } from '@/constants/keepflip-theme';
import type { InventoryItem } from '@/services/inventory-service';
import { EMPTY_EBAY_LISTING_REVIEW, type EbayListingReview } from '@/services/ebay-listing-readiness-service';
import type { PublishEbayListingInput } from '@/services/ebayListingService';
import type { ResellerLedgerEntry } from '@/services/reseller-ledger-service';
import { getSmartEvidenceCapturePlan } from '@/services/smart-evidence-capture';

const DEMO_IMAGE = require('@/assets/images/walkthrough-coach-bag.jpeg');
const DEMO_CAPTURE_PLAN = getSmartEvidenceCapturePlan({ categoryOverride: 'general' });
const TOUR = [
  { id: 'scan', number: '01', title: 'Scan the find', message: 'Start with clear photos. KeepFlip gives you an item match and market context to review before you decide what to buy.' },
  { id: 'inventory', number: '02', title: 'Save it to inventory', message: 'Confirm what you actually paid, then save the item. Your inventory card keeps its photo, cost, status, and next listing action together.' },
  { id: 'listing', number: '03', title: 'Prepare the listing', message: 'Generate a draft, then check the title, condition, photos, price, shipping, and seller policies yourself before you share or publish it.' },
  { id: 'records', number: '04', title: 'Record what happened', message: 'When it sells, record sale proceeds, the item cost, fees, and shipping in Books. KeepFlip can then show what was left after those recorded costs.' },
] as const;

const DEMO_ITEM: InventoryItem = {
  id: 'walkthrough-example', title: 'Secondhand Coach bag', brand: 'Coach', model: null,
  category: 'Bags', condition: 'Pre-owned', conditionNotes: 'Review corners, lining, and hardware',
  status: 'flip', estimatedValue: 60, acquisitionCost: 20, inventoryCostOnHand: 20,
  quantityPurchased: 1, quantityOnHand: 1, currency: 'USD', aiConfidence: null,
  flipDecision: null, flipVerdict: null, resaleVelocity: null, resaleTypicalDays: null,
  flipComplexity: null, flipDecisionConfidence: null, coverPhotoId: null, modelFile: null,
  photoCount: 1, itemPhotos: [], variant: null, color: 'Brown', era: null,
  serialNumber: null, itemSpecifics: {}, purchaseSource: 'Thrift store', sku: 'DEMO-001',
  storageLocation: 'Shelf A', isListed: false, resaleStatus: null, listingChannel: null,
  externalListingId: null, externalOfferId: null, listingCurrentPrice: null,
  listingQuantity: null, listingLastSyncedAt: null, listingSyncStatus: null,
  ebaySku: null, ebayOfferId: null, ebayListingId: null, listedAt: null,
  receiptFileId: null, purchaseNotes: null, createdAt: '2026-09-10T12:00:00.000Z',
};

const DEMO_LISTING: PublishEbayListingInput = {
  environment: 'sandbox', itemId: DEMO_ITEM.id, title: 'Coach brown shoulder bag, pre-owned',
  description: 'Example draft: brown Coach shoulder bag. Review measurements, wear, and photos before listing.',
  price: 60, quantity: 1, categoryId: 'demo-category', currency: 'USD',
  condition: 'Pre-owned', conditionDescription: 'Check corners and hardware in photos.',
  sku: 'DEMO-001', marketplaceId: 'EBAY_US',
};

const RECORD_DATE = '2026-09-10T12:00:00.000Z';
const DEMO_RECORDS: ResellerLedgerEntry[] = [
  { id: 'sale', ownerId: 'demo', itemId: DEMO_ITEM.id, saleGroupId: 'demo-sale', entryType: 'sale_proceeds', direction: 'income', amountCents: 6000, currency: 'USD', occurredAt: RECORD_DATE, channel: 'eBay', source: 'manual', externalId: null, notes: 'Example sale', receiptFileId: null, createdAt: RECORD_DATE, updatedAt: RECORD_DATE, voidedAt: null },
  { id: 'purchase', ownerId: 'demo', itemId: DEMO_ITEM.id, saleGroupId: 'demo-sale', entryType: 'inventory_purchase', direction: 'expense', amountCents: 2000, currency: 'USD', occurredAt: RECORD_DATE, channel: 'Thrift store', source: 'manual', externalId: null, notes: 'Item cost', receiptFileId: null, createdAt: RECORD_DATE, updatedAt: RECORD_DATE, voidedAt: null },
  { id: 'shipping', ownerId: 'demo', itemId: DEMO_ITEM.id, saleGroupId: 'demo-sale', entryType: 'shipping_label', direction: 'expense', amountCents: 800, currency: 'USD', occurredAt: RECORD_DATE, channel: 'eBay', source: 'manual', externalId: null, notes: 'Shipping label', receiptFileId: null, createdAt: RECORD_DATE, updatedAt: RECORD_DATE, voidedAt: null },
  { id: 'fee', ownerId: 'demo', itemId: DEMO_ITEM.id, saleGroupId: 'demo-sale', entryType: 'marketplace_fee', direction: 'expense', amountCents: 856, currency: 'USD', occurredAt: RECORD_DATE, channel: 'eBay', source: 'manual', externalId: null, notes: 'Example marketplace fee', receiptFileId: null, createdAt: RECORD_DATE, updatedAt: RECORD_DATE, voidedAt: null },
];

function ScanDemo({ phase }: { phase: number }) {
  const reducedMotion = useReducedMotion();
  const beam = useSharedValue(0);
  useEffect(() => {
    if (reducedMotion) return;
    beam.value = withRepeat(withTiming(1, { duration: 1600 }), -1, true);
    return () => cancelAnimation(beam);
  }, [beam, reducedMotion]);
  const beamStyle = useAnimatedStyle(() => ({ transform: [{ translateY: beam.value * 174 }] }));
  return (
    <View style={styles.demoStack}>
      <View style={styles.photoFrame}>
        <Image accessibilityLabel="Example Coach bag used in the walkthrough" contentFit="cover" source={DEMO_IMAGE} style={styles.photo} />
        <SmartEvidenceCaptureGuide photoCount={phase} plan={DEMO_CAPTURE_PLAN} />
        {!reducedMotion ? <Animated.View pointerEvents="none" style={[styles.scanBeam, beamStyle]} /> : null}
        {phase >= 1 ? <Animated.View entering={FadeInDown.duration(280)} style={styles.photoResult}><IconSymbol color={theme.colors.scannerCyan} name="checkmark.circle.fill" size={17} /><Text style={styles.resultText}>Photo captured · review the match</Text></Animated.View> : null}
      </View>
      {phase >= 2 ? <Animated.View entering={SlideInRight.duration(360)} style={styles.infoStrip}><Text style={styles.infoTitle}>Market context appears here</Text><Text style={styles.infoBody}>Check the item identity, condition, and sold evidence. A range is a research starting point, not a promised sale price.</Text></Animated.View> : null}
    </View>
  );
}

function InventoryDemo({ phase }: { phase: number }) {
  return (
    <View style={styles.demoStack}>
      <Animated.View entering={FadeInDown.springify().damping(17)} style={styles.inventoryWrap}>
        <InventoryCard compact coverImageSource={DEMO_IMAGE} item={DEMO_ITEM} onPress={() => undefined} onListingGuidePress={() => undefined} />
      </Animated.View>
      {phase >= 1 ? <Animated.View entering={SlideInRight.duration(350)} style={styles.infoStrip}><IconSymbol color={theme.colors.scannerCyan} name="checkmark.circle.fill" size={19} /><View style={styles.infoCopy}><Text style={styles.infoTitle}>Saved to inventory</Text><Text style={styles.infoBody}>Actual cost $20 · Shelf A · ready for a listing draft</Text></View></Animated.View> : null}
      {phase >= 2 ? <Animated.View entering={FadeInDown.duration(300)} style={styles.nextMove}><IconSymbol color={theme.colors.goldBright} name="arrow.right" size={18} /><Text style={styles.nextMoveText}>Next move: open the listing guide from this card.</Text></Animated.View> : null}
    </View>
  );
}

function ListingDemo({ phase }: { phase: number }) {
  const review: EbayListingReview = useMemo(() => ({
    ...EMPTY_EBAY_LISTING_REVIEW,
    identityConfirmed: phase >= 1,
    photosReviewed: phase >= 1,
    conditionConfirmed: phase >= 2,
    measurements: 'not_applicable',
    measurementsConfirmed: phase >= 2,
    shippingConfirmed: phase >= 2,
  }), [phase]);

  return (
    <View style={styles.demoStack}>
      <View style={styles.listingDraft}>
        <Text style={styles.demoLabel}>EXAMPLE LISTING DRAFT</Text>
        <Text style={styles.listingTitle}>{DEMO_LISTING.title}</Text>
        <Text style={styles.listingPrice}>$60.00 target price</Text>
        <Text style={styles.listingBody}>Review the item title, condition disclosure, and photos before using this copy.</Text>
      </View>
      <View style={styles.readinessClip}>
        <ListingReadinessPanel input={DEMO_LISTING} review={review} disabled onReviewChange={() => undefined} onAspectsChange={() => undefined} onMeasurementsChange={() => undefined} onReadyChange={() => undefined} />
      </View>
      {phase >= 2 ? <Animated.View entering={FadeInDown.duration(300)} style={styles.infoStrip}><IconSymbol color={theme.colors.goldBright} name="checkmark.circle.fill" size={20} /><View style={styles.infoCopy}><Text style={styles.infoTitle}>You stay in control</Text><Text style={styles.infoBody}>A draft is not published automatically. Confirm the details and choose where to list.</Text></View></Animated.View> : null}
    </View>
  );
}

function RecordsDemo({ phase }: { phase: number }) {
  const count = phase === 0 ? 1 : phase === 1 ? 3 : 4;
  return (
    <View style={styles.demoStack}>
      <View style={styles.recordsCard}>
        <Text style={styles.demoLabel}>BOOKS / EXAMPLE RECORDS</Text>
        {DEMO_RECORDS.slice(0, count).map((entry, index) => (
          <Animated.View key={entry.id} entering={FadeInDown.duration(260).delay(index * 60)}>
            <BooksRecordRow entry={entry} itemName={DEMO_ITEM.title} onPress={() => undefined} />
          </Animated.View>
        ))}
      </View>
      {phase >= 2 ? <Animated.View entering={FadeInDown.duration(360)} style={styles.profitCard}><Text style={styles.profitLabel}>EXAMPLE LEFT AFTER RECORDED COSTS</Text><Text style={styles.profitAmount}>$23.44</Text><Text style={styles.profitMath}>$60 sale − $20 item − $8 shipping − $8.56 fee</Text></Animated.View> : null}
      <Text style={styles.exampleNote}>These are example numbers only. Your actual Books entries come from your confirmed transactions.</Text>
    </View>
  );
}

export function WorkflowTour({ onBack, onFinish, saving }: { onBack: () => void; onFinish: () => void; saving: boolean }) {
  const reducedMotion = useReducedMotion();
  const [index, setIndex] = useState(0);
  const [phase, setPhase] = useState(reducedMotion ? 2 : 0);
  const step = TOUR[index];

  useEffect(() => {
    if (reducedMotion) return;
    const first = setTimeout(() => setPhase(1), 850);
    const second = setTimeout(() => setPhase(2), 1900);
    return () => { clearTimeout(first); clearTimeout(second); };
  }, [index, reducedMotion]);

  const back = () => {
    if (index === 0) { onBack(); return; }
    setPhase(reducedMotion ? 2 : 0);
    setIndex(index - 1);
  };
  const next = () => {
    if (index === TOUR.length - 1) { onFinish(); return; }
    setPhase(reducedMotion ? 2 : 0);
    setIndex(index + 1);
  };

  return (
    <View style={styles.tour}>
      <View style={styles.tourHeading}>
        <FlipCompanion size={48} />
        <View style={styles.headingCopy}><Text style={styles.tourEyebrow}>FLIP&apos;S WORKFLOW TOUR · EXAMPLE</Text><Text style={styles.tourTitle}>{step.title}</Text></View>
        <Text style={styles.stepCount}>{step.number} / 04</Text>
      </View>
      <View style={styles.progress}>{TOUR.map((item, itemIndex) => <View key={item.id} style={[styles.progressSegment, itemIndex <= index && styles.progressActive]} />)}</View>
      <Animated.View key={`copy-${step.id}`} entering={FadeInDown.duration(280)} style={styles.messageBubble}><Text style={styles.messageLabel}>FLIP</Text><Text style={styles.message}>{step.message}</Text></Animated.View>
      <Animated.View key={step.id} entering={FadeInDown.duration(300)}>
        {step.id === 'scan' ? <ScanDemo phase={phase} /> : step.id === 'inventory' ? <InventoryDemo phase={phase} /> : step.id === 'listing' ? <ListingDemo phase={phase} /> : <RecordsDemo phase={phase} />}
      </Animated.View>
      <View style={styles.controls}>
        <Pressable accessibilityLabel="Previous workflow step" accessibilityRole="button" disabled={saving} onPress={back} style={({ pressed }) => [styles.backButton, pressed && styles.pressed]}><Text style={styles.backText}>Back</Text></Pressable>
        <Pressable accessibilityLabel={index === TOUR.length - 1 ? 'Finish onboarding and open KeepFlip' : 'Next workflow step'} accessibilityRole="button" disabled={saving} onPress={next} style={({ pressed }) => [styles.nextButton, saving && styles.disabled, pressed && styles.pressed]} testID="keepflip-workflow-next"><Text style={styles.nextText}>{index === TOUR.length - 1 ? saving ? 'SAVING...' : 'OPEN KEEPFLIP' : 'NEXT STEP'}</Text><IconSymbol color={theme.colors.textOnAccent} name="arrow.right" size={17} /></Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  tour: { gap: 17, paddingBottom: 10 },
  tourHeading: { alignItems: 'center', flexDirection: 'row', gap: 10 },
  headingCopy: { flex: 1, gap: 4 },
  tourEyebrow: { color: theme.colors.goldBright, fontFamily: theme.fonts.radar, fontSize: 8, letterSpacing: 1 },
  tourTitle: { color: theme.colors.cream, fontFamily: theme.fonts.bold, fontSize: 22 },
  stepCount: { color: theme.colors.scannerCyan, fontFamily: theme.fonts.radar, fontSize: 9 },
  progress: { flexDirection: 'row', gap: 6 },
  progressSegment: { backgroundColor: theme.colors.divider, borderRadius: 4, flex: 1, height: 4 },
  progressActive: { backgroundColor: theme.colors.scannerCyan },
  messageBubble: { backgroundColor: theme.colors.iconSurfaceViolet, borderColor: theme.colors.accentVioletBorder, borderRadius: 17, borderTopLeftRadius: 4, borderWidth: 1, gap: 5, padding: 13 },
  messageLabel: { color: theme.colors.scannerViolet, fontFamily: theme.fonts.radar, fontSize: 8, letterSpacing: 1 },
  message: { color: theme.colors.cream, fontSize: 13, lineHeight: 19 },
  demoStack: { gap: 13 },
  photoFrame: { borderColor: theme.colors.accentCyanBorder, borderRadius: 20, borderWidth: 1, height: 250, overflow: 'hidden', position: 'relative' },
  photo: { height: '100%', width: '100%' },
  scanBeam: { backgroundColor: theme.colors.scannerCyan, height: 2, left: 12, opacity: 0.9, position: 'absolute', right: 12, top: 32 },
  photoResult: { alignItems: 'center', backgroundColor: theme.colors.surfaceOverlay, borderColor: theme.colors.accentCyanBorder, borderRadius: 11, borderWidth: 1, bottom: 10, flexDirection: 'row', gap: 8, left: 10, padding: 9, position: 'absolute', right: 10 },
  resultText: { color: theme.colors.cream, fontFamily: theme.fonts.medium, fontSize: 11 },
  demoLabel: { color: theme.colors.goldBright, fontFamily: theme.fonts.radar, fontSize: 8, letterSpacing: 1 },
  infoStrip: { alignItems: 'center', backgroundColor: theme.colors.iconSurfaceCyan, borderColor: theme.colors.accentCyanBorder, borderRadius: 14, borderWidth: 1, flexDirection: 'row', gap: 9, padding: 12 },
  infoCopy: { flex: 1, gap: 3 },
  infoTitle: { color: theme.colors.cream, fontFamily: theme.fonts.semibold, fontSize: 13 },
  infoBody: { color: theme.colors.textMuted, fontSize: 11, lineHeight: 16 },
  inventoryWrap: { alignSelf: 'center', maxWidth: 440, width: '100%' },
  nextMove: { alignItems: 'center', flexDirection: 'row', gap: 8, paddingHorizontal: 5 },
  nextMoveText: { color: theme.colors.goldBright, flex: 1, fontSize: 12 },
  listingDraft: { backgroundColor: theme.colors.surfaceInset, borderColor: theme.colors.divider, borderRadius: 16, borderWidth: 1, gap: 7, padding: 14 },
  listingTitle: { color: theme.colors.cream, fontFamily: theme.fonts.bold, fontSize: 16 },
  listingPrice: { color: theme.colors.scannerCyan, fontFamily: theme.fonts.semibold, fontSize: 15 },
  listingBody: { color: theme.colors.textMuted, fontSize: 11, lineHeight: 16 },
  readinessClip: { borderRadius: 16, maxHeight: 260, overflow: 'hidden' },
  recordsCard: { backgroundColor: theme.colors.surfaceInset, borderColor: theme.colors.divider, borderRadius: 16, borderWidth: 1, gap: 4, overflow: 'hidden', padding: 9 },
  profitCard: { alignItems: 'center', backgroundColor: theme.colors.iconSurfaceCyan, borderColor: theme.colors.accentCyanBorder, borderRadius: 17, borderWidth: 1, gap: 5, padding: 16 },
  profitLabel: { color: theme.colors.scannerCyan, fontFamily: theme.fonts.radar, fontSize: 9, letterSpacing: 0.8, textAlign: 'center' },
  profitAmount: { color: theme.colors.cream, fontFamily: theme.fonts.bold, fontSize: 31 },
  profitMath: { color: theme.colors.textMuted, fontSize: 10, textAlign: 'center' },
  exampleNote: { color: theme.colors.textMuted, fontSize: 10, lineHeight: 15 },
  controls: { flexDirection: 'row', gap: 9 },
  backButton: { alignItems: 'center', backgroundColor: theme.colors.cardSoft, borderColor: theme.colors.divider, borderRadius: 14, borderWidth: 1, justifyContent: 'center', minHeight: 52, paddingHorizontal: 17 },
  backText: { color: theme.colors.cream, fontFamily: theme.fonts.semibold, fontSize: 13 },
  nextButton: { alignItems: 'center', backgroundColor: theme.colors.goldBright, borderRadius: 14, flex: 1, flexDirection: 'row', gap: 7, justifyContent: 'center', minHeight: 52, paddingHorizontal: 13 },
  nextText: { color: theme.colors.textOnAccent, fontFamily: theme.fonts.bold, fontSize: 12 },
  disabled: { opacity: 0.5 },
  pressed: { opacity: 0.78 },
});
