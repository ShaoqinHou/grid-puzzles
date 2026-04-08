import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { loadFromStorage, saveToStorage } from '@/services/storage';
import { STORAGE_KEYS } from '@/constants';

export type Theme = 'light' | 'dark' | 'system';

export interface Preferences {
  readonly theme: Theme;
  readonly soundEnabled: boolean;
  readonly cellSize: number;
  readonly showTimer: boolean;
}

const DEFAULT_PREFERENCES: Preferences = {
  theme: 'system',
  soundEnabled: true,
  cellSize: 32,
  showTimer: true,
};

interface PreferencesContextValue {
  readonly preferences: Preferences;
  readonly setTheme: (theme: Theme) => void;
  readonly setSoundEnabled: (enabled: boolean) => void;
  readonly setCellSize: (size: number) => void;
  readonly setShowTimer: (show: boolean) => void;
}

const PreferencesContext = createContext<PreferencesContextValue | null>(null);

const loadPreferences = (): Preferences => {
  const stored = loadFromStorage<Partial<Preferences>>(STORAGE_KEYS.PREFS);
  if (stored === null) return DEFAULT_PREFERENCES;
  return { ...DEFAULT_PREFERENCES, ...stored };
};

export interface PreferencesProviderProps {
  readonly children: ReactNode;
}

export const PreferencesProvider = ({ children }: PreferencesProviderProps) => {
  const [preferences, setPreferences] = useState<Preferences>(loadPreferences);

  const update = useCallback((patch: Partial<Preferences>) => {
    setPreferences((prev) => {
      const next = { ...prev, ...patch };
      saveToStorage(STORAGE_KEYS.PREFS, next);
      return next;
    });
  }, []);

  const setTheme = useCallback((theme: Theme) => update({ theme }), [update]);
  const setSoundEnabled = useCallback(
    (soundEnabled: boolean) => update({ soundEnabled }),
    [update],
  );
  const setCellSize = useCallback(
    (cellSize: number) => update({ cellSize }),
    [update],
  );
  const setShowTimer = useCallback(
    (showTimer: boolean) => update({ showTimer }),
    [update],
  );

  const value = useMemo<PreferencesContextValue>(
    () => ({ preferences, setTheme, setSoundEnabled, setCellSize, setShowTimer }),
    [preferences, setTheme, setSoundEnabled, setCellSize, setShowTimer],
  );

  return (
    <PreferencesContext.Provider value={value}>
      {children}
    </PreferencesContext.Provider>
  );
};

export const usePreferences = (): PreferencesContextValue => {
  const ctx = useContext(PreferencesContext);
  if (ctx === null) {
    throw new Error('usePreferences must be used within PreferencesProvider');
  }
  return ctx;
};
