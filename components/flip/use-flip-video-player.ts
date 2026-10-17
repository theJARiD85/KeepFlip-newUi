import { createVideoPlayer, type VideoPlayer, type VideoSource } from 'expo-video';
import { useEffect, useRef, useState } from 'react';
import { Platform } from 'react-native';

// Android can apply a queued VideoView.player prop after React unmounts its view.
const ANDROID_VIEW_TEARDOWN_MS = 1000;

export function useFlipVideoPlayer(
  source: VideoSource,
  setup?: (player: VideoPlayer) => void,
): VideoPlayer {
  const [player] = useState(() => {
    const createdPlayer = createVideoPlayer(source);
    setup?.(createdPlayer);
    return createdPlayer;
  });
  const releaseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (releaseTimerRef.current) {
      clearTimeout(releaseTimerRef.current);
      releaseTimerRef.current = null;
    }

    return () => {
      // Keep the shared object valid until Android's pending view updates finish.
      releaseTimerRef.current = setTimeout(() => {
        releaseTimerRef.current = null;
        player.pause();
        player.release();
      }, Platform.OS === 'android' ? ANDROID_VIEW_TEARDOWN_MS : 0);
    };
  }, [player]);

  return player;
}
