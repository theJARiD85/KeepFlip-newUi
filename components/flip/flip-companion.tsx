import { useEventListener } from 'expo';
import { Image } from 'expo-image';
import { VideoView, useVideoPlayer } from 'expo-video';
import { useCallback, useEffect, useRef } from 'react';
import {
  Platform,
  StyleSheet,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';

import {
  FLIP_BACKGROUND_SOURCE,
  FLIP_VIDEO_SOURCES,
} from '@/components/flip/flip-assets';
import { useFlipCompanion } from '@/components/flip/flip-companion-provider';
import { FLIP_LOOPING_STATES } from '@/components/flip/flip-types';
import type {
  FlipCompanionState,
  FlipReactionState,
} from '@/components/flip/flip-types';

type FlipCompanionProps = {
  /** Width and height of the companion stage. */
  size?: number;

  /** Additional styles for positioning the stage. */
  style?: StyleProp<ViewStyle>;

  /** Crop the source into the square companion stage when true. */
  cropToSquare?: boolean;
};

type PlayerIndex = 0 | 1;

type PendingFrame = {
  playerIndex: PlayerIndex;
  requestId: number;
  state: FlipCompanionState;
};

/*
 * After the hidden player reports its first advanced frame, give Android one
 * compositor turn to attach that frame to the TextureView. The visible player
 * remains fully opaque during this entire preload phase.
 */
const PRELOAD_SETTLE_MS = 150;
const FIRST_RENDERED_FRAME_TIME = 0.015;
const VIDEO_FADE_MS = 180;

function configurePlayer(videoPlayer: ReturnType<typeof useVideoPlayer>) {
  videoPlayer.muted = true;
  videoPlayer.loop = true;
  /*
   * Expo Video disables time updates by default. We use the first advancing
   * timestamp as the closest native signal that Android has a decoded frame
   * ready to put on the TextureView.
   */
  videoPlayer.timeUpdateEventInterval = 0.05;
}

export function FlipCompanion({
  size = 40,
  style,
  cropToSquare = true,
}: FlipCompanionProps) {
  const { state, reactionToken, finishReaction, finishSpeaking } = useFlipCompanion();
  const sourceRequestRef = useRef(0);
  const activeIndexRef = useRef<PlayerIndex>(0);
  const activeStateRef = useRef<FlipCompanionState>('idle');
  const pendingIndexRef = useRef<PlayerIndex | null>(null);
  const pendingStateRef = useRef<FlipCompanionState | null>(null);
  const pendingFrameRef = useRef<PendingFrame | null>(null);
  const primedFrameRef = useRef<PendingFrame | null>(null);
  const handoffTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const outgoingPauseTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);
  const firstOpacity = useSharedValue(1);
  const secondOpacity = useSharedValue(0);

  const playerA = useVideoPlayer(FLIP_VIDEO_SOURCES.idle, (videoPlayer) => {
    configurePlayer(videoPlayer);
    videoPlayer.play();
  });
  const playerB = useVideoPlayer(FLIP_VIDEO_SOURCES.idle, (videoPlayer) => {
    configurePlayer(videoPlayer);
  });

  const shouldLoop = FLIP_LOOPING_STATES.has(state);
  const firstVideoStyle = useAnimatedStyle(() => ({
    opacity: firstOpacity.get(),
  }));
  const secondVideoStyle = useAnimatedStyle(() => ({
    opacity: secondOpacity.get(),
  }));

  const handoffPrimedPlayer = useCallback(
    (playerIndex: PlayerIndex, currentTime: number) => {
      /*
       * The inactive player is warmed while it remains transparent. Its first
       * advancing timestamp is the closest Expo Video signal that Android has
       * decoded an actual image. Freeze that image before the handoff so the
       * new TextureView is never revealed in its default black state.
       */
      if (currentTime <= FIRST_RENDERED_FRAME_TIME) {
        return;
      }

      const pendingFrame = pendingFrameRef.current;
      if (
        !pendingFrame ||
        pendingFrame.playerIndex !== playerIndex ||
        !isMountedRef.current ||
        sourceRequestRef.current !== pendingFrame.requestId
      ) {
        return;
      }

      pendingFrameRef.current = null;
      primedFrameRef.current = pendingFrame;
      const incomingPlayer = playerIndex === 0 ? playerA : playerB;

      /* Hold the already-decoded opening frame invisibly behind the active clip. */
      incomingPlayer.pause();

      if (handoffTimerRef.current) {
        clearTimeout(handoffTimerRef.current);
      }
      handoffTimerRef.current = setTimeout(() => {
        const primedFrame = primedFrameRef.current;
        if (
          !primedFrame ||
          primedFrame.playerIndex !== playerIndex ||
          !isMountedRef.current ||
          sourceRequestRef.current !== primedFrame.requestId
        ) {
          handoffTimerRef.current = null;
          return;
        }

        primedFrameRef.current = null;
        const incomingOpacity =
          playerIndex === 0 ? firstOpacity : secondOpacity;
        const outgoingOpacity =
          playerIndex === 0 ? secondOpacity : firstOpacity;

        /*
         * This is the actual double-buffer swap: Player B/A already owns a
         * painted frame underneath, so fade it in before fading the old layer
         * out. The persistent Flip image beneath both layers keeps the stage
         * populated even if the native video texture misses a compositor beat.
         */
        incomingOpacity.set(withTiming(1, { duration: VIDEO_FADE_MS }));
        incomingPlayer.play();
        outgoingOpacity.set(withTiming(0, { duration: VIDEO_FADE_MS }));
        const outgoingPlayer = playerIndex === 0 ? playerB : playerA;
        if (outgoingPauseTimerRef.current) {
          clearTimeout(outgoingPauseTimerRef.current);
        }
        outgoingPauseTimerRef.current = setTimeout(() => {
          if (isMountedRef.current) {
            outgoingPlayer.pause();
          }
          outgoingPauseTimerRef.current = null;
        }, VIDEO_FADE_MS + 32);
        activeIndexRef.current = playerIndex;
        activeStateRef.current = primedFrame.state;
        pendingIndexRef.current = null;
        pendingStateRef.current = null;
        handoffTimerRef.current = null;
      }, PRELOAD_SETTLE_MS);
    },
    [firstOpacity, playerA, playerB, secondOpacity],
  );

  const handlePlaybackEnd = useCallback(
    (playerIndex: PlayerIndex) => {
      const activeState = activeStateRef.current;
      if (
        !isMountedRef.current ||
        activeIndexRef.current !== playerIndex
      ) {
        return;
      }

      if (activeState === 'speaking') {
        finishSpeaking();
        return;
      }

      if (!FLIP_LOOPING_STATES.has(activeState)) {
        finishReaction(activeState as FlipReactionState);
      }
    },
    [finishReaction, finishSpeaking],
  );

  useEffect(() => {
    const requestId = ++sourceRequestRef.current;
    const activeIndex = activeIndexRef.current;
    const activePlayer = activeIndex === 0 ? playerA : playerB;

    /*
     * Replaying the same clip should not replace its source. This keeps
     * repeated reactions from flashing the native video surface black.
     */
    if (activeStateRef.current === state && pendingStateRef.current === null) {
      configurePlayer(activePlayer);
      activePlayer.loop = shouldLoop;
      activePlayer.replay();
      return () => {
        if (sourceRequestRef.current === requestId) {
          sourceRequestRef.current += 1;
        }
      };
    }

    const targetIndex: PlayerIndex =
      pendingIndexRef.current !== null
        ? pendingIndexRef.current
        : activeIndex === 0
          ? 1
          : 0;
    const targetPlayer = targetIndex === 0 ? playerA : playerB;
    const incomingOpacity = targetIndex === 0 ? firstOpacity : secondOpacity;

    pendingIndexRef.current = targetIndex;
    pendingStateRef.current = state;
    pendingFrameRef.current = null;
    primedFrameRef.current = null;
    incomingOpacity.set(0);

    if (handoffTimerRef.current) {
      clearTimeout(handoffTimerRef.current);
      handoffTimerRef.current = null;
    }
    if (outgoingPauseTimerRef.current) {
      clearTimeout(outgoingPauseTimerRef.current);
      outgoingPauseTimerRef.current = null;
    }

    const switchVideo = () => {
      try {
        if (!isMountedRef.current) return;

        targetPlayer.pause();
        configurePlayer(targetPlayer);
        targetPlayer.loop = shouldLoop;
        /*
         * Flip's clips are bundled local assets. A synchronous replacement
         * avoids leaving a stale async load racing the idle timer on Android
         * (where that race can surface as a socket timeout).
         */
        targetPlayer.replace(FLIP_VIDEO_SOURCES[state], true);

        if (
          !isMountedRef.current ||
          sourceRequestRef.current !== requestId
        ) {
          return;
        }

        targetPlayer.currentTime = 0;
        pendingFrameRef.current = {
          playerIndex: targetIndex,
          requestId,
          state,
        };
        targetPlayer.play();
      } catch (error) {
        if (__DEV__ && isMountedRef.current) {
          console.warn(
            `[FlipCompanion] Failed to play "${state}" animation.`,
            error,
          );
        }
      }
    };

    void switchVideo();

    return () => {
      if (sourceRequestRef.current === requestId) {
        sourceRequestRef.current += 1;
      }
      if (pendingFrameRef.current?.requestId === requestId) {
        pendingFrameRef.current = null;
      }
      if (primedFrameRef.current?.requestId === requestId) {
        primedFrameRef.current = null;
      }
    };
  }, [
    firstOpacity,
    playerA,
    playerB,
    secondOpacity,
    shouldLoop,
    state,
    reactionToken,
  ]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      sourceRequestRef.current += 1;
      pendingFrameRef.current = null;
      primedFrameRef.current = null;
      if (handoffTimerRef.current) {
        clearTimeout(handoffTimerRef.current);
        handoffTimerRef.current = null;
      }
      if (outgoingPauseTimerRef.current) {
        clearTimeout(outgoingPauseTimerRef.current);
        outgoingPauseTimerRef.current = null;
      }
    };
  }, []);

  useEventListener(playerA, 'timeUpdate', ({ currentTime }) => {
    handoffPrimedPlayer(0, currentTime);
  });

  useEventListener(playerB, 'timeUpdate', ({ currentTime }) => {
    handoffPrimedPlayer(1, currentTime);
  });

  useEventListener(playerA, 'playToEnd', () => handlePlaybackEnd(0));

  useEventListener(playerB, 'playToEnd', () => handlePlaybackEnd(1));

  useEventListener(playerA, 'statusChange', ({ status, error }) => {
    if (status === 'error' && error && __DEV__ && isMountedRef.current) {
      console.warn('[FlipCompanion] Video player A error:', error);
    }
  });

  useEventListener(playerB, 'statusChange', ({ status, error }) => {
    if (status === 'error' && error && __DEV__ && isMountedRef.current) {
      console.warn('[FlipCompanion] Video player B error:', error);
    }
  });

  return (
    <View
      pointerEvents="none"
      style={[
        styles.container,
        {
          width: size,
          height: size,
        },
        style,
      ]}>
      {Platform.OS !== 'web' ? (
        <Image
          cachePolicy="memory-disk"
          contentFit={cropToSquare ? 'cover' : 'contain'}
          pointerEvents="none"
          source={FLIP_BACKGROUND_SOURCE}
          style={StyleSheet.absoluteFill}
        />
      ) : null}
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, firstVideoStyle]}>
        <VideoView
          player={playerA}
          style={StyleSheet.absoluteFill}
          nativeControls={false}
          contentFit={cropToSquare ? 'cover' : 'contain'}
          playsInline
          surfaceType="textureView"
          allowsVideoFrameAnalysis={false}
        />
      </Animated.View>
      <Animated.View
        pointerEvents="none"
        style={[StyleSheet.absoluteFill, secondVideoStyle]}>
        <VideoView
          player={playerB}
          style={StyleSheet.absoluteFill}
          nativeControls={false}
          contentFit={cropToSquare ? 'cover' : 'contain'}
          playsInline
          surfaceType="textureView"
          allowsVideoFrameAnalysis={false}
        />
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    backgroundColor: '#08080c',
  },
});
