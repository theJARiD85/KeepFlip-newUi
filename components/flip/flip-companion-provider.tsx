import {
  createContext,
  type PropsWithChildren,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';

import type {
  FlipCompanionState,
  FlipLoopState,
  FlipReactionState,
} from './flip-types';

/* Give the seller a real minute or two before Flip powers down. */
const FLIP_IDLE_TIMEOUT_MS = 90_000;
const FLIP_SLEEP_RETRY_MS = 5_000;
type FlipTimerHandle = ReturnType<typeof setTimeout>;

type FlipCompanionContextValue = {
  /** State currently being displayed by Flip. */
  state: FlipCompanionState;

  /** Persistent state Flip should return to after a one-shot reaction. */
  mode: FlipLoopState;

  /**
   * Most recently requested reaction. It stays populated across a handoff
   * so the renderer never has to pass through a null reaction state.
   */
  reaction: FlipReactionState;

  /** Whether `reaction` is currently being played as a one-shot clip. */
  reactionActive: boolean;

  /** Incremented every time a reaction is requested. */
  reactionToken: number;

  /** Change Flip's persistent mode. */
  setMode: (mode: FlipLoopState) => void;

  /** Play a one-shot reaction. */
  react: (reaction: FlipReactionState) => void;

  /**
   * Tell Flip that the seller is interacting with him again.
   * Returns true when the interaction woke Flip from a sleep transition.
   */
  markActivity: () => boolean;

  /**
   * Called by FlipCompanion when a reaction video finishes. An expected
   * reaction can be supplied so a stale player event cannot finish a newer
   * reaction that is already being crossfaded in.
   */
  finishReaction: (expectedReaction?: FlipReactionState) => void;

  /** Called by FlipCompanion when the one-shot speaking clip finishes. */
  finishSpeaking: () => void;

  /** Return Flip completely to idle. */
  reset: () => void;
};

const FlipCompanionContext =
  createContext<FlipCompanionContextValue | null>(null);

export function FlipCompanionProvider({
  children,
}: PropsWithChildren) {
  const [mode, setModeState] = useState<FlipLoopState>('idle');

  /*
   * Keep the last reaction as metadata instead of clearing it during a
   * handoff. `displayState` is the source of truth for the video renderer,
   * and `reactionActive` tells the idle timer whether that clip is still
   * running.
   */
  const [reaction, setReaction] =
    useState<FlipReactionState>('greeting');
  const [reactionActive, setReactionActive] = useState(false);
  const [displayState, setDisplayState] =
    useState<FlipCompanionState>('idle');

  const [reactionToken, setReactionToken] = useState(0);

  const modeRef = useRef<FlipLoopState>(mode);
  const reactionRef = useRef<FlipReactionState>(reaction);
  const reactionActiveRef = useRef(false);
  const reactionTokenRef = useRef(0);
  const idleTimerRef = useRef<FlipTimerHandle | null>(null);
  const scheduleIdleTimerRef = useRef<(delay?: number) => void>(
    () => undefined,
  );

  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  useEffect(() => {
    reactionRef.current = reaction;
  }, [reaction]);

  const clearIdleTimer = useCallback(() => {
    if (idleTimerRef.current) {
      clearTimeout(idleTimerRef.current);
      idleTimerRef.current = null;
    }
  }, []);

  const react = useCallback(
    (nextReaction: FlipReactionState) => {
      clearIdleTimer();
      reactionRef.current = nextReaction;
      reactionActiveRef.current = true;
      setReaction(nextReaction);
      setReactionActive(true);
      setDisplayState(nextReaction);

      /* Increment even when the same reaction is requested twice in a row. */
      reactionTokenRef.current += 1;
      setReactionToken(reactionTokenRef.current);
    },
    [clearIdleTimer],
  );

  const scheduleIdleTimer = useCallback(
    (delay = FLIP_IDLE_TIMEOUT_MS) => {
      clearIdleTimer();
      idleTimerRef.current = setTimeout(() => {
        idleTimerRef.current = null;

        /* Never interrupt an active reaction or a spoken response. */
        if (
          modeRef.current === 'idle' &&
          !reactionActiveRef.current
        ) {
          react('goingtosleep');
          return;
        }

        scheduleIdleTimerRef.current(FLIP_SLEEP_RETRY_MS);
      }, delay);
    },
    [clearIdleTimer, react],
  );

  scheduleIdleTimerRef.current = scheduleIdleTimer;

  const setMode = useCallback(
    (nextMode: FlipLoopState) => {
      modeRef.current = nextMode;
      setModeState(nextMode);

      /* Do not interrupt a reaction that is already on screen. */
      if (!reactionActiveRef.current) {
        setDisplayState(nextMode);
      }

      if (nextMode === 'sleeping') {
        clearIdleTimer();
      } else {
        scheduleIdleTimer();
      }
    },
    [clearIdleTimer, scheduleIdleTimer],
  );

  const markActivity = useCallback(() => {
    const wasSleeping = modeRef.current === 'sleeping';
    const wasGoingToSleep =
      reactionActiveRef.current && reactionRef.current === 'goingtosleep';

    if (wasSleeping) {
      modeRef.current = 'idle';
      setModeState('idle');
      setDisplayState('idle');
    }

    if (wasSleeping || wasGoingToSleep) {
      react('wakingup');
    } else {
      scheduleIdleTimer();
    }

    return wasSleeping || wasGoingToSleep;
  }, [react, scheduleIdleTimer]);

  const finishReaction = useCallback(
    (expectedReaction?: FlipReactionState) => {
      if (!reactionActiveRef.current) return;

      const finishedReaction = reactionRef.current;
      if (expectedReaction && finishedReaction !== expectedReaction) {
        return;
      }

      reactionActiveRef.current = false;
      setReactionActive(false);

      if (finishedReaction === 'goingtosleep') {
        modeRef.current = 'sleeping';
        setModeState('sleeping');
        setDisplayState('sleeping');
        clearIdleTimer();
        return;
      }

      if (finishedReaction === 'wakingup') {
        modeRef.current = 'idle';
        setModeState('idle');
        setDisplayState('idle');
        scheduleIdleTimer();
        return;
      }

      /*
       * Normal reactions hand directly back to the persistent mode. The
       * companion crossfades into this state, so no null frame is exposed.
       */
      setDisplayState(modeRef.current);
      if (modeRef.current === 'sleeping') {
        clearIdleTimer();
      } else {
        scheduleIdleTimer();
      }
    },
    [clearIdleTimer, scheduleIdleTimer],
  );

  const finishSpeaking = useCallback(() => {
    /* A stale video-end event must never cancel a newer reaction. */
    if (modeRef.current !== 'speaking' || reactionActiveRef.current) return;

    modeRef.current = 'idle';
    setModeState('idle');
    setDisplayState('idle');
    scheduleIdleTimer();
  }, [scheduleIdleTimer]);

  const reset = useCallback(() => {
    clearIdleTimer();
    reactionActiveRef.current = false;
    setReactionActive(false);
    modeRef.current = 'idle';
    setModeState('idle');
    setDisplayState('idle');
    scheduleIdleTimer();
  }, [clearIdleTimer, scheduleIdleTimer]);

  useEffect(() => {
    scheduleIdleTimer();
    return clearIdleTimer;
  }, [clearIdleTimer, scheduleIdleTimer]);

  const value = useMemo<FlipCompanionContextValue>(
    () => ({
      state: displayState,
      mode,
      reaction,
      reactionActive,
      reactionToken,
      setMode,
      react,
      markActivity,
      finishReaction,
      finishSpeaking,
      reset,
    }),
    [
      displayState,
      mode,
      reaction,
      reactionActive,
      reactionToken,
      setMode,
      react,
      markActivity,
      finishReaction,
      finishSpeaking,
      reset,
    ],
  );

  return (
    <FlipCompanionContext.Provider value={value}>
      {children}
    </FlipCompanionContext.Provider>
  );
}

export function useFlipCompanion() {
  const context = useContext(FlipCompanionContext);

  if (!context) {
    throw new Error(
      'useFlipCompanion must be used inside a FlipCompanionProvider.',
    );
  }

  return context;
}
