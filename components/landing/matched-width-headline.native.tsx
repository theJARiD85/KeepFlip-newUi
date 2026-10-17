import { fitMatchedHeadlineSizes } from '@/components/landing/matched-headline-size';
import { KeepFlipText as Text } from '@/components/ui/keepflip-text';
import { useState } from 'react';
import { StyleSheet, View, type StyleProp, type TextStyle } from 'react-native';
import { useResponsiveLayout, useResponsiveStyles } from '@/hooks/use-responsive-layout';

const MEASUREMENT_FONT_SIZE = 100;

type Props = {
  bottomStyle: StyleProp<TextStyle>;
  bottomText: string;
  topStyle: StyleProp<TextStyle>;
  topText: string;
};

export function MatchedWidthHeadline({ bottomStyle, bottomText, topStyle, topText }: Props) {
  const responsiveStyles = useResponsiveStyles(createStylesWebResponsive);
  const [availableWidth, setAvailableWidth] = useState(0);
  const [topMeasuredWidth, setTopMeasuredWidth] = useState(0);
  const [bottomMeasuredWidth, setBottomMeasuredWidth] = useState(0);
  const top = StyleSheet.flatten(topStyle) ?? {};
  const bottom = StyleSheet.flatten(bottomStyle) ?? {};
  const maxTopFontSize = typeof top.fontSize === 'number' ? top.fontSize : 60;
  const initialBottomFontSize = typeof bottom.fontSize === 'number' ? bottom.fontSize : 40;
  const topSpacingRatio = (typeof top.letterSpacing === 'number' ? top.letterSpacing : 0) / maxTopFontSize;
  const bottomSpacingRatio = (typeof bottom.letterSpacing === 'number' ? bottom.letterSpacing : 0) / initialBottomFontSize;
  const topLineHeightRatio = (typeof top.lineHeight === 'number' ? top.lineHeight : maxTopFontSize) / maxTopFontSize;
  const bottomLineHeightRatio = (typeof bottom.lineHeight === 'number' ? bottom.lineHeight : initialBottomFontSize) / initialBottomFontSize;
  const sizes = fitMatchedHeadlineSizes(
    Math.max(0, availableWidth - 1),
    topMeasuredWidth,
    bottomMeasuredWidth,
    MEASUREMENT_FONT_SIZE,
    maxTopFontSize,
  );
  const topFontSize = sizes?.top ?? maxTopFontSize;
  const bottomFontSize = sizes?.bottom ?? initialBottomFontSize;

  return (
    <View
      accessibilityRole="header"
      onLayout={(event) => setAvailableWidth(event.nativeEvent.layout.width)}
      style={responsiveStyles.container}
    >
      <Text
        numberOfLines={1}
        style={[topStyle, { fontSize: topFontSize, letterSpacing: topSpacingRatio * topFontSize, lineHeight: topLineHeightRatio * topFontSize, opacity: sizes ? 1 : 0 }]}
      >
        {topText}
      </Text>
      <Text
        numberOfLines={1}
        style={[bottomStyle, { fontSize: bottomFontSize, letterSpacing: bottomSpacingRatio * bottomFontSize, lineHeight: bottomLineHeightRatio * bottomFontSize, opacity: sizes ? 1 : 0 }]}
      >
        {bottomText}
      </Text>
      <Text
        accessible={false}
        importantForAccessibility="no"
        pointerEvents="none"
        onTextLayout={(event) => setTopMeasuredWidth(event.nativeEvent.lines[0]?.width ?? 0)}
        style={[responsiveStyles.measure, { fontFamily: top.fontFamily, letterSpacing: topSpacingRatio * MEASUREMENT_FONT_SIZE }]}
      >
        {topText}
      </Text>
      <Text
        accessible={false}
        importantForAccessibility="no"
        pointerEvents="none"
        onTextLayout={(event) => setBottomMeasuredWidth(event.nativeEvent.lines[0]?.width ?? 0)}
        style={[responsiveStyles.measure, { fontFamily: bottom.fontFamily, letterSpacing: bottomSpacingRatio * MEASUREMENT_FONT_SIZE }]}
      >
        {bottomText}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { width: '100%' },
  measure: { fontSize: MEASUREMENT_FONT_SIZE, opacity: 0, position: 'absolute', width: 2000 },
});

function createStylesWebResponsive(layout: ReturnType<typeof useResponsiveLayout>) {
  return StyleSheet.create({
    ...styles,
    measure: {
      ...styles["measure"],
      width: layout.isWeb ? layout.webResponsiveWidth(2000) : layout.responsiveWidth(2000),
    },
  });
}
