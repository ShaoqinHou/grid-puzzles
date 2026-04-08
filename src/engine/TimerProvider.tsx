import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react';
import { useGameState, useGameDispatch } from '@/engine/GameStateProvider';

interface TimerContextValue {
  readonly elapsedMs: number;
  readonly paused: boolean;
  readonly pause: () => void;
  readonly resume: () => void;
}

const TimerContext = createContext<TimerContextValue | null>(null);

export interface TimerProviderProps {
  readonly children: ReactNode;
}

export const TimerProvider = ({ children }: TimerProviderProps) => {
  const { state } = useGameState();
  const dispatch = useGameDispatch();

  const { id, elapsedMs, paused, solved } = state;
  const isActive = id !== '' && !paused && !solved;

  // 1-second tick interval — restart on new game (id change)
  useEffect(() => {
    if (!isActive) return;

    const interval = setInterval(() => {
      dispatch({ type: 'TICK' });
    }, 1000);

    return () => clearInterval(interval);
  }, [isActive, id, dispatch]);

  // Pause on tab hidden via visibilitychange
  useEffect(() => {
    const handleVisibility = () => {
      if (document.hidden) {
        dispatch({ type: 'PAUSE' });
      } else if (!solved) {
        dispatch({ type: 'RESUME' });
      }
    };

    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, [dispatch, solved]);

  const pause = useCallback(() => dispatch({ type: 'PAUSE' }), [dispatch]);
  const resume = useCallback(() => dispatch({ type: 'RESUME' }), [dispatch]);

  const value = useMemo<TimerContextValue>(
    () => ({ elapsedMs, paused, pause, resume }),
    [elapsedMs, paused, pause, resume],
  );

  return (
    <TimerContext.Provider value={value}>
      {children}
    </TimerContext.Provider>
  );
};

export const useTimer = (): TimerContextValue => {
  const ctx = useContext(TimerContext);
  if (ctx === null) {
    throw new Error('useTimer must be used within TimerProvider');
  }
  return ctx;
};
