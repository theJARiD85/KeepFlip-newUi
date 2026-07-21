import { ScrollView, StyleSheet, Text, View } from 'react-native';

import { ScannerAtmosphere } from '@/components/scanner/scanner-atmosphere';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { KeepFlipBackground } from '@/components/ui/keepflip-background';
import { keepFlipTheme as theme } from '@/constants/keepflip-theme';
import { useResponsiveLayout } from '@/hooks/use-responsive-layout';

export default function ScannerScreen() {
  const {
    contentWidth,
    isCompactHeight,
    moderateScale,
    pageGutter,
    responsiveFont,
    verticalScale,
  } = useResponsiveLayout();

  return (
    <KeepFlipBackground>
      <ScrollView
        contentInsetAdjustmentBehavior="automatic"
        contentContainerStyle={[
          styles.content,
          {
            paddingHorizontal: pageGutter,
            paddingVertical: verticalScale(isCompactHeight ? 24 : 40, 0.55),
          },
        ]}>
        <View
          style={[
            styles.preview,
            {
              width: contentWidth,
              minHeight: verticalScale(isCompactHeight ? 480 : 560, 0.45),
            },
          ]}>
          <View pointerEvents="none" style={styles.colorWash} />
          <ScannerAtmosphere phase="scanning" />

          <View style={styles.liveBadge}>
            <View style={styles.liveDot} />
            <Text style={styles.liveBadgeText}>SCANNER PREVIEW</Text>
          </View>

          <View style={[styles.corner, styles.topLeft]} />
          <View style={[styles.corner, styles.topRight]} />
          <View style={[styles.corner, styles.bottomLeft]} />
          <View style={[styles.corner, styles.bottomRight]} />
          <View pointerEvents="none" style={styles.scanLine} />

          <View style={[
              styles.card,
              {
                gap: moderateScale(20, 0.5),
                padding: moderateScale(28, 0.5),
              },
            ]}>
            <View style={styles.iconRing}>
              <IconSymbol name="camera.fill" size={30} color={theme.colors.goldBright} />
            </View>

            <View style={styles.copy}>
              <Text selectable style={[styles.eyebrow, { fontSize: responsiveFont(10) }]}>
                KEEPFLIP VISION
              </Text>
              <Text selectable style={[styles.title, { fontSize: responsiveFont(25) }]}>
                Live scanner on mobile
              </Text>
              <Text
                selectable
                style={[
                  styles.body,
                  { fontSize: responsiveFont(14), lineHeight: responsiveFont(21) },
                ]}>
                Camera scanning runs in the KeepFlip iOS or Android development build. The web
                preview keeps the scanner interface available without requesting camera access.
              </Text>
            </View>

            <View style={styles.buildPill}>
              <IconSymbol name="bolt.fill" size={15} color={theme.colors.scannerCyan} />
              <Text selectable style={styles.buildPillText}>OPEN THE DEVELOPMENT BUILD TO SCAN</Text>
            </View>
          </View>
        </View>
      </ScrollView>
    </KeepFlipBackground>
  );
}

const styles = StyleSheet.create({
  content: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
    paddingVertical: 40,
  },
  preview: {
    width: '100%',
    maxWidth: 520,
    minHeight: 560,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
    borderRadius: theme.radii.large,
    borderWidth: 1,
    borderColor: 'rgba(215, 168, 74, 0.30)',
    backgroundColor: 'rgba(5, 5, 8, 0.88)',
    boxShadow: '0 28px 80px rgba(0, 0, 0, 0.58), 0 0 42px rgba(88, 223, 232, 0.07)',
  },
  colorWash: {
    ...StyleSheet.absoluteFill,
    experimental_backgroundImage: `
      radial-gradient(circle at 18% 22%, rgba(141, 114, 255, 0.18) 0%, transparent 36%),
      radial-gradient(circle at 82% 76%, rgba(88, 223, 232, 0.14) 0%, transparent 38%),
      radial-gradient(circle at 50% 48%, rgba(224, 172, 75, 0.10) 0%, transparent 48%)
    `,
  },
  liveBadge: {
    position: 'absolute',
    top: 22,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(88, 223, 232, 0.34)',
    backgroundColor: 'rgba(3, 3, 6, 0.80)',
  },
  liveDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.colors.scannerCyan,
    boxShadow: '0 0 10px rgba(88, 223, 232, 0.92)',
  },
  liveBadgeText: {
    color: theme.colors.scannerCyan,
    fontSize: 9,
    fontWeight: '900',
    letterSpacing: 1.5,
  },
  corner: {
    position: 'absolute',
    width: 58,
    height: 58,
    borderColor: theme.colors.goldBright,
  },
  topLeft: {
    top: 26,
    left: 26,
    borderTopWidth: 2,
    borderLeftWidth: 2,
    borderTopLeftRadius: 18,
  },
  topRight: {
    top: 26,
    right: 26,
    borderTopWidth: 2,
    borderRightWidth: 2,
    borderTopRightRadius: 18,
  },
  bottomLeft: {
    bottom: 26,
    left: 26,
    borderBottomWidth: 2,
    borderLeftWidth: 2,
    borderBottomLeftRadius: 18,
  },
  bottomRight: {
    right: 26,
    bottom: 26,
    borderRightWidth: 2,
    borderBottomWidth: 2,
    borderBottomRightRadius: 18,
  },
  scanLine: {
    position: 'absolute',
    top: '50%',
    left: 32,
    right: 32,
    height: 1,
    experimental_backgroundImage:
      'linear-gradient(90deg, transparent 0%, rgba(141, 114, 255, 0.64) 20%, rgba(88, 223, 232, 0.96) 50%, rgba(242, 211, 138, 0.72) 80%, transparent 100%)',
    boxShadow: '0 0 18px rgba(88, 223, 232, 0.46)',
  },
  card: {
    width: '82%',
    maxWidth: 380,
    alignItems: 'center',
    gap: 20,
    padding: 28,
    borderRadius: theme.radii.large,
    borderWidth: 1,
    borderColor: 'rgba(215, 168, 74, 0.32)',
    backgroundColor: 'rgba(7, 7, 11, 0.93)',
    boxShadow: '0 18px 52px rgba(0, 0, 0, 0.58), 0 0 26px rgba(215, 168, 74, 0.09)',
  },
  iconRing: {
    width: 66,
    height: 66,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(242, 211, 138, 0.58)',
    backgroundColor: 'rgba(215, 168, 74, 0.12)',
    boxShadow: '0 0 24px rgba(215, 168, 74, 0.14)',
  },
  copy: {
    alignItems: 'center',
    gap: 8,
  },
  eyebrow: {
    color: theme.colors.gold,
    fontSize: 10,
    fontWeight: '900',
    letterSpacing: 2.2,
  },
  title: {
    color: theme.colors.cream,
    fontSize: 25,
    fontWeight: '800',
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  body: {
    color: theme.colors.textMuted,
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  buildPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: theme.radii.pill,
    borderWidth: 1,
    borderColor: 'rgba(141, 114, 255, 0.30)',
    backgroundColor: 'rgba(141, 114, 255, 0.08)',
  },
  buildPillText: {
    flexShrink: 1,
    color: theme.colors.text,
    fontSize: 9,
    fontWeight: '800',
    letterSpacing: 0.8,
    textAlign: 'center',
  },
});
