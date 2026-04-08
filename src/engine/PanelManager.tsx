import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

export type PanelId = 'settings' | 'stats' | 'puzzle-select' | 'solver';

interface PanelManagerContextValue {
  /** Currently open panel, or null if none */
  readonly activePanel: PanelId | null;
  /** Open a specific panel (closes any other open panel) */
  readonly openPanel: (id: PanelId) => void;
  /** Close the currently open panel */
  readonly closePanel: () => void;
  /** Toggle a panel open/closed */
  readonly togglePanel: (id: PanelId) => void;
  /** Check if a specific panel is open */
  readonly isPanelOpen: (id: PanelId) => boolean;
}

const PanelManagerContext = createContext<PanelManagerContextValue | null>(null);

export interface PanelManagerProviderProps {
  readonly children: ReactNode;
}

export const PanelManagerProvider = ({ children }: PanelManagerProviderProps) => {
  const [activePanel, setActivePanel] = useState<PanelId | null>(null);

  const openPanel = useCallback((id: PanelId) => {
    setActivePanel(id);
  }, []);

  const closePanel = useCallback(() => {
    setActivePanel(null);
  }, []);

  const togglePanel = useCallback((id: PanelId) => {
    setActivePanel((prev) => (prev === id ? null : id));
  }, []);

  const isPanelOpen = useCallback(
    (id: PanelId) => activePanel === id,
    [activePanel],
  );

  const value = useMemo<PanelManagerContextValue>(
    () => ({ activePanel, openPanel, closePanel, togglePanel, isPanelOpen }),
    [activePanel, openPanel, closePanel, togglePanel, isPanelOpen],
  );

  return (
    <PanelManagerContext.Provider value={value}>
      {children}
    </PanelManagerContext.Provider>
  );
};

export const usePanelManager = (): PanelManagerContextValue => {
  const ctx = useContext(PanelManagerContext);
  if (ctx === null) {
    throw new Error('usePanelManager must be used within PanelManagerProvider');
  }
  return ctx;
};
