import type { VideoSource } from 'expo-video';

import type { FlipCompanionState } from '@/components/flip/flip-types';



export const FLIP_VIDEO_SOURCES: Record<
  FlipCompanionState,
  VideoSource
> = {
  idle: require('@/assets/flip/idle.webm'),

  sleeping: require('@/assets/flip/sleeping.webm'),

  speaking: require('@/assets/flip/speaking.webm'),

  greeting: require('@/assets/flip/greetings.webm'),

  confused: require('@/assets/flip/confused.webm'),

  aha: require('@/assets/flip/aha.webm'),

  acknowledge: require('@/assets/flip/acknowledge.webm'),

  celebrate: require('@/assets/flip/celebrate.webm'),

  goingtosleep: require('@/assets/flip/going-to-sleep.webm'),

  wakingup: require('@/assets/flip/waking-up.webm'),
};
