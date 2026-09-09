import { Image } from 'expo-image';
import { Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  FadeIn,
  FadeInUp,
  FadeOut,
  LinearTransition,
  withTiming,
} from 'react-native-reanimated';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { keepFlipTheme as theme } from '@/constants/keepflip-theme';
import { KeepFlipText as Text } from "@/components/ui/keepflip-text";
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';
import responsiveFont, { responsiveHeight, responsiveWidth } from '@/lib/responsiveFont';

import { useResponsiveStyles } from '@/hooks/use-responsive-layout';
type MultiScanPhotoStackProps = {
  accentColor?: string;
  accessibilityContext?: string;
  disabled?: boolean;
  onOpen: () => void;
  photos: MultiScanPhoto[];
};

type MultiScanPhotoReviewProps = {
  accentColor?: string;
  accessibilityContext?: string;
  bottomInset: number;
  eyebrow?: string;
  onClose: () => void;
  onDelete: (photoId: string) => void;
  photos: MultiScanPhoto[];
  topInset: number;
};

export type MultiScanPhoto = {
  createdAt: number;
  id: string;
  path: string;
  uri: string;
};

export function toDisplayUri(path: string) {
  if (/^[a-z][a-z0-9+.-]*:/i.test(path)) return path;
  return `file://${path.startsWith('/') ? '' : '/'}${path}`;
}

const photoPileEnter = () => {
  'worklet';

  return {
    initialValues: {
      opacity: 0,
      transform: [
        { translateX: -92 },
        { translateY: -150 },
        { scale: 5.4 },
        { rotateZ: '-5deg' },
      ],
    },
    animations: {
      opacity: withTiming(1, { duration: 210 }),
      transform: [
        { translateX: withTiming(0, { duration: 240 }) },
        { translateY: withTiming(0, { duration: 240 }) },
        { scale: withTiming(1, { duration: 240 }) },
        { rotateZ: withTiming('0deg', { duration: 240 }) },
      ],
    },
  };
};

export function MultiScanPhotoStack({
  accentColor = theme.colors.scannerCyan,
  accessibilityContext = 'multi-scan',
  disabled = false,
  onOpen,
  photos,
}: MultiScanPhotoStackProps) {
  const styles = useResponsiveStyles(createResponsiveStyles);
  if (photos.length === 0) return null;

  const visiblePhotos = photos.slice(-4);

  return (
    <Animated.View entering={FadeIn.duration(130)} exiting={FadeOut.duration(140)}>
      <Pressable
        accessibilityHint="Opens every selected photo for this item"
        accessibilityLabel={`Review ${photos.length} ${accessibilityContext} photo${photos.length === 1 ? '' : 's'}`}
        accessibilityRole="button"
        disabled={disabled}
        hitSlop={8}
        onPress={onOpen}
        style={({ pressed }) => [
          styles.stackButton,
          pressed && styles.stackButtonPressed,
          disabled && styles.stackButtonDisabled,
        ]}>
        {visiblePhotos.map((photo, index) => {
          const depth = visiblePhotos.length - index - 1;
          const rotation = depth === 3 ? '-10deg' : depth === 2 ? '8deg' : depth === 1 ? '-5deg' : '-1deg';

          return (
            <Animated.View
              entering={photoPileEnter}
              key={photo.id}
              layout={LinearTransition.duration(180)}
              style={[
                styles.stackPhoto,
                {
                  borderColor: accentColor,
                  boxShadow: `0 8px 20px rgba(0, 0, 0, 0.55), 0 0 14px ${accentColor}`,
                  zIndex: index + 1,
                  transform: [
                    { translateX: -depth * 3 },
                    { translateY: depth * 3 },
                    { rotateZ: rotation },
                    { scale: 1 - depth * 0.05 },
                  ],
                },
              ]}>
              <Image
                cachePolicy="memory-disk"
                contentFit="cover"
                recyclingKey={photo.id}
                source={{ uri: photo.uri }}
                style={StyleSheet.absoluteFill}
                transition={140}
              />
            </Animated.View>
          );
        })}

        <View pointerEvents="none" style={[styles.stackCount, { borderColor: accentColor }]}>
          <Text style={[styles.stackCountText, { color: accentColor }]}>
            {photos.length > 99 ? '99+' : photos.length}
          </Text>
        </View>
      </Pressable>
    </Animated.View>
  );
}

export function MultiScanPhotoReview({
  accentColor = theme.colors.scannerCyan,
  accessibilityContext = 'multi-scan',
  bottomInset,
  eyebrow = 'MULTI-SCAN SESSION',
  onClose,
  onDelete,
  photos,
  topInset,
}: MultiScanPhotoReviewProps) {
  const styles = useResponsiveStyles(createResponsiveStyles);
  const {
    responsiveFont
  } = useResponsiveLayout();

  const { width: viewportWidth } = useWindowDimensions();
  const gridWidth = Math.min(Math.max(viewportWidth - 40, 0), 760);
  const photoCardWidth = Math.floor((gridWidth - 12) / 2);
  const photoCardHeight = Math.round(photoCardWidth / 0.78);

  return (
    <Animated.View
      entering={FadeIn.duration(180)}
      exiting={FadeOut.duration(180)}
      style={styles.reviewBackdrop}>
      <View
        style={[
          styles.reviewShell,
          { paddingTop: topInset + 18, paddingBottom: bottomInset + 16 },
        ]}>
        <View style={styles.reviewHeader}>
          <View style={styles.reviewTitleGroup}>
            <Text style={[styles.reviewEyebrow, { color: accentColor }]}>{eyebrow}</Text>
            <Text style={[styles.reviewTitle, { fontSize: responsiveFont(26) }]}>
              {photos.length} photo{photos.length === 1 ? '' : 's'}
            </Text>
          </View>
          <Pressable
            accessibilityLabel={`Close ${accessibilityContext} photo review`}
            accessibilityRole="button"
            onPress={onClose}
            style={({ pressed }) => [
              styles.doneButton,
              { borderColor: accentColor },
              pressed && styles.doneButtonPressed,
            ]}>
            <Text style={[styles.doneButtonText, { color: accentColor }]}>Done</Text>
          </Pressable>
        </View>

        <ScrollView
          contentContainerStyle={styles.reviewContent}
          contentInsetAdjustmentBehavior="automatic"
          showsVerticalScrollIndicator={false}
          style={styles.reviewScroll}>
          <View style={styles.photoGrid}>
            {photos.map((photo, index) => (
              <Animated.View
                entering={FadeInUp.duration(220).delay(Math.min(index, 5) * 35)}
                exiting={FadeOut.duration(150)}
                key={photo.id}
                layout={LinearTransition.duration(180)}
                style={[
                  styles.photoCard,
                  { width: photoCardWidth, height: photoCardHeight },
                ]}>
                <Image
                  cachePolicy="memory-disk"
                  contentFit="cover"
                  recyclingKey={photo.id}
                  source={{ uri: photo.uri }}
                  style={StyleSheet.absoluteFill}
                  transition={150}
                />
                <View pointerEvents="none" style={styles.photoNumber}>
                  <Text style={[styles.photoNumberText, { fontSize: responsiveFont(11) }]}>{index + 1}</Text>
                </View>
                <Pressable
                  accessibilityLabel={`Remove ${accessibilityContext} photo ${index + 1} of ${photos.length}`}
                  accessibilityRole="button"
                  hitSlop={8}
                  onPress={() => onDelete(photo.id)}
                  style={({ pressed }) => [
                    styles.deleteButton,
                    pressed && styles.deleteButtonPressed,
                  ]}>
                  <IconSymbol color={theme.colors.cream} name="xmark" size={18} />
                </Pressable>
              </Animated.View>
            ))}
          </View>
        </ScrollView>
      </View>
    </Animated.View>
  );
}

function createResponsiveStyles(responsiveLayout: ReturnType<typeof useResponsiveLayout>) {
    const staticStyles = StyleSheet.create({
  stackButton: {
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stackButtonPressed: { opacity: 0.82, transform: [{ scale: 0.95 }] },
  stackButtonDisabled: { opacity: 0.48 },
  stackPhoto: {
    position: 'absolute',
    right: 14,
    bottom: 14,
    width: 20,
    height: 20,
    overflow: 'hidden',
    borderRadius: 5,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: 'rgba(88, 223, 232, 0.72)',
    backgroundColor: theme.colors.surface,
    boxShadow: '0 3px 8px rgba(0, 0, 0, 0.54), 0 0 8px rgba(88, 223, 232, 0.2)',
  },
  stackCount: {
    position: 'absolute',
    right: 0,
    bottom: 0,
    zIndex: 8,
    minWidth: 16,
    height: 16,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 3,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    borderColor: theme.colors.scannerCyan,
    backgroundColor: 'rgba(4, 8, 11, 0.96)',
    boxShadow: '0 0 12px rgba(88, 223, 232, 0.42)',
  },
  stackCountText: {
    color: theme.colors.scannerCyan,
    fontSize: 8,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  reviewBackdrop: {
    ...StyleSheet.absoluteFill,
    zIndex: 30,
    backgroundColor: 'rgba(2, 2, 4, 0.97)',
    experimental_backgroundImage: `
      radial-gradient(circle at 92% 12%, rgba(88, 223, 232, 0.10) 0%, transparent 34%),
      radial-gradient(circle at 10% 82%, rgba(141, 114, 255, 0.11) 0%, transparent 38%),
      linear-gradient(160deg, rgba(10, 9, 14, 0.99) 0%, rgba(2, 2, 4, 0.99) 72%)
    `,
  },
  reviewShell: { flex: 1, paddingHorizontal: 20 },
  reviewHeader: {
    minHeight: 72,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 16,
    paddingRight: 64,
    paddingBottom: 14,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(88, 223, 232, 0.18)',
  },
  reviewTitleGroup: { flexShrink: 1, gap: 3 },
  reviewEyebrow: {
    color: theme.colors.scannerCyan,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 1.8,
  },
  reviewTitle: { color: theme.colors.cream, fontSize: 26, fontWeight: '800' },
  doneButton: {
    minWidth: 70,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(88, 223, 232, 0.48)',
    backgroundColor: 'rgba(88, 223, 232, 0.10)',
  },
  doneButtonPressed: { opacity: 0.72, transform: [{ scale: 0.96 }] },
  doneButtonText: { color: theme.colors.scannerCyan, fontSize: 14, fontWeight: '900' },
  reviewScroll: { flex: 1, width: '100%' },
  reviewContent: { width: '100%', paddingTop: 18, paddingBottom: 28 },
  photoGrid: {
    width: '100%',
    maxWidth: 760,
    alignSelf: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    gap: 12,
  },
  photoCard: {
    overflow: 'hidden',
    borderRadius: theme.radii.medium,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: 'rgba(242, 211, 138, 0.24)',
    backgroundColor: theme.colors.surface,
    boxShadow: '0 10px 26px rgba(0, 0, 0, 0.44)',
  },
  photoNumber: {
    position: 'absolute',
    left: 10,
    bottom: 10,
    minWidth: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(242, 211, 138, 0.34)',
    backgroundColor: 'rgba(3, 3, 5, 0.82)',
  },
  photoNumberText: {
    color: theme.colors.cream,
    fontSize: 11,
    fontWeight: '900',
    fontVariant: ['tabular-nums'],
  },
  deleteButton: {
    position: 'absolute',
    top: 9,
    right: 9,
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(255, 244, 214, 0.46)',
    backgroundColor: 'rgba(148, 54, 46, 0.92)',
    boxShadow: '0 4px 14px rgba(0, 0, 0, 0.48)',
  },
  deleteButtonPressed: { opacity: 0.72, transform: [{ scale: 0.9 }] },
});
  return {
    ...staticStyles,
  stackButton: [
    staticStyles.stackButton,
    {
        width: responsiveLayout.responsiveWidth(48),
        height: responsiveLayout.responsiveHeight(48),
    },
  ],
  stackPhoto: [
    staticStyles.stackPhoto,
    {
        width: responsiveLayout.responsiveWidth(20),
        height: responsiveLayout.responsiveHeight(20),
    },
  ],
  stackCount: [
    staticStyles.stackCount,
    {
        height: responsiveLayout.responsiveHeight(16),
    },
  ],
  stackCountText: [
    staticStyles.stackCountText,
    {
        fontSize: responsiveLayout.responsiveFont(8),
    },
  ],
  reviewEyebrow: [
    staticStyles.reviewEyebrow,
    {
        fontSize: responsiveLayout.responsiveFont(10),
    },
  ],
  reviewTitle: [
    staticStyles.reviewTitle,
    {
        fontSize: responsiveLayout.responsiveFont(26),
    },
  ],
  doneButtonText: [
    staticStyles.doneButtonText,
    {
        fontSize: responsiveLayout.responsiveFont(14),
    },
  ],
  photoNumber: [
    staticStyles.photoNumber,
    {
        height: responsiveLayout.responsiveHeight(26),
    },
  ],
  photoNumberText: [
    staticStyles.photoNumberText,
    {
        fontSize: responsiveLayout.responsiveFont(11),
    },
  ],
  deleteButton: [
    staticStyles.deleteButton,
    {
        width: responsiveLayout.responsiveWidth(42),
        height: responsiveLayout.responsiveHeight(42),
    },
  ],
  };
}
