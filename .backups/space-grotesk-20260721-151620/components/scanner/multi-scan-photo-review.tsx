import { Image } from 'expo-image';
import {
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
  useWindowDimensions,
} from 'react-native';
import Animated, {
  FadeIn,
  FadeInUp,
  FadeOut,
  LinearTransition,
} from 'react-native-reanimated';

import { IconSymbol } from '@/components/ui/icon-symbol';
import { keepFlipTheme as theme } from '@/constants/keepflip-theme';

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

export function MultiScanPhotoStack({
  accentColor = theme.colors.scannerCyan,
  accessibilityContext = 'multi-scan',
  disabled = false,
  onOpen,
  photos,
}: MultiScanPhotoStackProps) {
  if (photos.length === 0) return null;

  const visiblePhotos = photos.slice(-3);

  return (
    <Animated.View entering={FadeInUp.duration(190)} exiting={FadeOut.duration(140)}>
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
          const rotation = depth === 2 ? '-9deg' : depth === 1 ? '6deg' : '-1deg';

          return (
            <Animated.View
              entering={FadeIn.duration(160)}
              key={photo.id}
              layout={LinearTransition.duration(180)}
              style={[
                styles.stackPhoto,
                {
                  borderColor: accentColor,
                  boxShadow: `0 8px 20px rgba(0, 0, 0, 0.55), 0 0 14px ${accentColor}`,
                  zIndex: index + 1,
                  transform: [
                    { translateX: -depth * 7 },
                    { translateY: depth * 4 },
                    { rotateZ: rotation },
                    { scale: 1 - depth * 0.04 },
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
            <Text style={styles.reviewTitle}>
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
                  <Text style={styles.photoNumberText}>{index + 1}</Text>
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

const styles = StyleSheet.create({
  stackButton: {
    width: 82,
    height: 92,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stackButtonPressed: { opacity: 0.82, transform: [{ scale: 0.95 }] },
  stackButtonDisabled: { opacity: 0.48 },
  stackPhoto: {
    position: 'absolute',
    width: 62,
    height: 76,
    overflow: 'hidden',
    borderRadius: theme.radii.small,
    borderCurve: 'continuous',
    borderWidth: 1,
    borderColor: 'rgba(88, 223, 232, 0.72)',
    backgroundColor: theme.colors.surface,
    boxShadow: '0 8px 20px rgba(0, 0, 0, 0.55), 0 0 14px rgba(88, 223, 232, 0.22)',
  },
  stackCount: {
    position: 'absolute',
    right: 1,
    bottom: 0,
    zIndex: 8,
    minWidth: 26,
    height: 26,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 6,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    borderColor: theme.colors.scannerCyan,
    backgroundColor: 'rgba(4, 8, 11, 0.96)',
    boxShadow: '0 0 12px rgba(88, 223, 232, 0.42)',
  },
  stackCountText: {
    color: theme.colors.scannerCyan,
    fontSize: 11,
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
