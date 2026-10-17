import { fitMatchedHeadlineSizes } from '@/components/landing/matched-headline-size';
import { SemanticHeading } from '@/components/web/web-public-page';
import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { StyleSheet, type StyleProp, type TextStyle } from 'react-native';

const MEASUREMENT_FONT_SIZE = 100;

type Props = {
  bottomStyle: StyleProp<TextStyle>;
  bottomText: string;
  headingStyle: StyleProp<TextStyle>;
  topStyle: StyleProp<TextStyle>;
  topText: string;
};

export function MatchedWidthHeadline({
  bottomStyle,
  bottomText,
  headingStyle,
  topStyle,
  topText,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const topMeasureRef = useRef<HTMLSpanElement>(null);
  const bottomMeasureRef = useRef<HTMLSpanElement>(null);
  const [fontSizes, setFontSizes] = useState<{ top: number; bottom: number } | null>(null);
  const top = StyleSheet.flatten(topStyle) ?? {};
  const bottom = StyleSheet.flatten(bottomStyle) ?? {};
  const maxTopFontSize = typeof top.fontSize === 'number' ? top.fontSize : 100;
  const initialBottomFontSize = typeof bottom.fontSize === 'number' ? bottom.fontSize : 65;
  const topSpacingEm = (typeof top.letterSpacing === 'number' ? top.letterSpacing : 0) / maxTopFontSize;
  const bottomSpacingEm = (typeof bottom.letterSpacing === 'number' ? bottom.letterSpacing : 0) / initialBottomFontSize;
  const topFontFamily = top.fontFamily ?? 'sans-serif';
  const bottomFontFamily = bottom.fontFamily ?? topFontFamily;

  useEffect(() => {
    let active = true;
    const measure = () => {
      if (!active) return;
      const availableWidth = containerRef.current?.clientWidth ?? 0;
      const topWidth = topMeasureRef.current?.getBoundingClientRect().width ?? 0;
      const bottomWidth = bottomMeasureRef.current?.getBoundingClientRect().width ?? 0;
      const next = fitMatchedHeadlineSizes(
        Math.max(0, availableWidth - 1),
        topWidth,
        bottomWidth,
        MEASUREMENT_FONT_SIZE,
        maxTopFontSize,
      );
      if (next) {
        setFontSizes((current) =>
          current && Math.abs(current.top - next.top) < 0.1 && Math.abs(current.bottom - next.bottom) < 0.1
            ? current
            : next,
        );
      }
    };

    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    if (containerRef.current) observer?.observe(containerRef.current);
    window.addEventListener('resize', measure);
    void document.fonts.ready.then(measure);
    document.fonts.addEventListener?.('loadingdone', measure);

    return () => {
      active = false;
      observer?.disconnect();
      window.removeEventListener('resize', measure);
      document.fonts.removeEventListener?.('loadingdone', measure);
    };
  }, [bottomFontFamily, bottomSpacingEm, bottomText, maxTopFontSize, topFontFamily, topSpacingEm, topText]);

  const measurementStyle = (fontFamily: string, letterSpacingEm: number): CSSProperties => ({
    fontFamily,
    fontSize: MEASUREMENT_FONT_SIZE,
    letterSpacing: `${letterSpacingEm}em`,
    position: 'absolute',
    visibility: 'hidden',
    whiteSpace: 'nowrap',
    width: 'max-content',
  });
  const visibleStyle = (
    textStyle: TextStyle,
    fontSize: number,
    letterSpacingEm: number,
  ): CSSProperties => ({
    color: typeof textStyle.color === 'string' ? textStyle.color : undefined,
    display: 'block',
    fontFamily: textStyle.fontFamily,
    fontSize,
    letterSpacing: `${letterSpacingEm}em`,
    whiteSpace: 'nowrap',
    width: 'max-content',
  });

  return (
    <div ref={containerRef} style={{ opacity: fontSizes ? 1 : 0, position: 'relative', width: '100%' }}>
      <SemanticHeading level={1} style={headingStyle}>
        <span style={visibleStyle(top, fontSizes?.top ?? maxTopFontSize, topSpacingEm)}>{topText}</span>
        <span style={visibleStyle(bottom, fontSizes?.bottom ?? initialBottomFontSize, bottomSpacingEm)}>{bottomText}</span>
      </SemanticHeading>
      <span aria-hidden ref={topMeasureRef} style={measurementStyle(topFontFamily, topSpacingEm)}>{topText}</span>
      <span aria-hidden ref={bottomMeasureRef} style={measurementStyle(bottomFontFamily, bottomSpacingEm)}>{bottomText}</span>
    </div>
  );
}
