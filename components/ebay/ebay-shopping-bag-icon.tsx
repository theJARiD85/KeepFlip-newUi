import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';

type EbayShoppingBagIconProps = {
  size?: number;
  style?: StyleProp<ViewStyle>;
};

/**
 * Lightweight recreation of the eBay shopping-bag mark supplied for the
 * connection UI. Keeping it as native views avoids adding another image
 * dependency or changing the app's asset pipeline.
 */
export function EbayShoppingBagIcon({
  size = 32,
  style,
}: EbayShoppingBagIconProps) {
  const handleWidth = size * 0.56;
  const handleHeight = size * 0.32;
  const handleThickness = Math.max(2, size * 0.075);
  const bodyTop = size * 0.27;
  const bodyHeight = size * 0.7;

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={[styles.root, { width: size, height: size }, style]}>
      <View
        style={[
          styles.handle,
          {
            width: handleWidth,
            height: handleHeight,
            left: (size - handleWidth) / 2,
            borderWidth: handleThickness,
            borderBottomWidth: 0,
            borderTopLeftRadius: handleWidth / 2,
            borderTopRightRadius: handleWidth / 2,
          },
        ]}
      />

      <View
        style={[
          styles.bag,
          {
            top: bodyTop,
            width: size,
            height: bodyHeight,
            borderBottomLeftRadius: size * 0.085,
            borderBottomRightRadius: size * 0.085,
          },
        ]}>
        <View style={[styles.stripe, styles.red]} />
        <View style={[styles.stripe, styles.blue]} />
        <View style={[styles.stripe, styles.yellow]} />
        <View style={[styles.stripe, styles.green]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    position: 'relative',
  },
  handle: {
    position: 'absolute',
    top: 0,
    borderColor: '#444444',
  },
  bag: {
    position: 'absolute',
    left: 0,
    zIndex: 1,
    flexDirection: 'row',
    overflow: 'hidden',
  },
  stripe: {
    flex: 1,
    height: '100%',
  },
  red: {
    backgroundColor: '#F2333D',
  },
  blue: {
    backgroundColor: '#0A69D1',
  },
  yellow: {
    backgroundColor: '#FFB400',
  },
  green: {
    backgroundColor: '#86BD18',
  },
});
