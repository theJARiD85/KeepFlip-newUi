import type { VideoSource } from 'expo-video';

import type { FlipCompanionState } from '@/components/flip/flip-types';

/** Persistent fallback frame beneath Flip's animated video layers. */
export const FLIP_BACKGROUND_SOURCE = require('@/assets/flip/background.jpg');

export const FLIP_VIDEO_SOURCES: Record<
  FlipCompanionState,
  VideoSource
> = {
  idle: require('@/assets/flip/idle.mp4'),

  sleeping: require('@/assets/flip/sleeping.mp4'),

  speaking: require('@/assets/flip/speaking.mp4'),

  greeting: require('@/assets/flip/greetings.mp4'),

  confused: require('@/assets/flip/confused.mp4'),

  aha: require('@/assets/flip/aha.mp4'),

  acknowledge: require('@/assets/flip/acknowledge.mp4'),

  celebrate: require('@/assets/flip/celebrate.mp4'),

  goingtosleep: require('@/assets/flip/going-to-sleep.mp4'),

  wakingup: require('@/assets/flip/waking-up.mp4'),
};
