import Animated from 'react-native-reanimated';
import { useResponsiveSize } from "@/hooks/use-responsive-layout";

export function HelloWave() {
  const { responsiveSize } = useResponsiveSize();
  return (
    <Animated.Text
      style={{
        fontSize: responsiveSize(28),
        lineHeight: 32,
        marginTop: -6,
        animationName: {
          '50%': { transform: [{ rotate: '25deg' }] },
        },
        animationIterationCount: 4,
        animationDuration: '300ms',
      }}>
      👋
    </Animated.Text>
  );
}
