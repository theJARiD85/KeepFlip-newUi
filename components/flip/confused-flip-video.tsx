import { VideoView } from 'expo-video';
import type { StyleProp, ViewStyle } from 'react-native';

import { useFlipVideoPlayer } from '@/components/flip/use-flip-video-player';

const CONFUSED_FLIP_VIDEO = require('@/assets/videos/flip-confused.mp4');

type ConfusedFlipVideoProps = {
  accessibilityLabel?: string;
  style?: StyleProp<ViewStyle>;
};

export function ConfusedFlipVideo({
  accessibilityLabel = 'Flip is ready for more item evidence.',
  style,
}: ConfusedFlipVideoProps) {
  const player = useFlipVideoPlayer(CONFUSED_FLIP_VIDEO, (player) => {
    player.loop = true;
    player.muted = true;
    player.play();
  });

  return (
    <VideoView
      accessibilityLabel={accessibilityLabel}
      contentFit="contain"
      nativeControls={false}
      player={player}
      pointerEvents="none"
      style={style}
      surfaceType="textureView"
    />
  );
}
