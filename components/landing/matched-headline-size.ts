type MatchedHeadlineSizes = {
  top: number;
  bottom: number;
};

export function fitMatchedHeadlineSizes(
  availableWidth: number,
  topMeasuredWidth: number,
  bottomMeasuredWidth: number,
  measurementFontSize: number,
  maxTopFontSize: number,
): MatchedHeadlineSizes | null {
  if (
    ![availableWidth, topMeasuredWidth, bottomMeasuredWidth, measurementFontSize, maxTopFontSize]
      .every((value) => Number.isFinite(value) && value > 0)
  ) {
    return null;
  }

  const top = Math.min(maxTopFontSize, (availableWidth * measurementFontSize) / topMeasuredWidth);
  return { top, bottom: (top * topMeasuredWidth) / bottomMeasuredWidth };
}
