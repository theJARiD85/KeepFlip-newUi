export type FlipLoopState =
  | 'idle'
  | 'sleeping'
  | 'speaking';

export type FlipReactionState =
  | 'greeting'
  | 'confused'
  | 'aha'
  | 'acknowledge'
  | 'goingtosleep'
  | 'wakingup'
  | 'celebrate';

export type FlipCompanionState =
  | FlipLoopState
  | FlipReactionState;

export const FLIP_LOOPING_STATES = new Set<FlipCompanionState>([
  'idle',
  'sleeping',
]);
