import { usePreferences } from '@/engine/PreferencesProvider';
import { usePanelManager } from '@/engine/PanelManager';
import { SlidePanel } from './ui/SlidePanel';
import { Toggle } from './ui/Toggle';

export function SettingsPanel() {
  const { activePanel, closePanel } = usePanelManager();
  const { preferences, setShowTimer, setSoundEnabled, setCellSize } = usePreferences();

  return (
    <SlidePanel open={activePanel === 'settings'} onClose={closePanel} title="Settings">
      <div className="space-y-3">
        <Toggle
          label="Show Timer"
          checked={preferences.showTimer}
          onChange={(checked) => setShowTimer(checked)}
        />
        <Toggle
          label="Sound Effects"
          checked={preferences.soundEnabled}
          onChange={(checked) => setSoundEnabled(checked)}
        />
        <div className="pt-3 border-t border-grid-line">
          <label className="text-sm text-text-secondary block mb-2">Cell Size</label>
          <input
            type="range"
            min={20}
            max={48}
            value={preferences.cellSize}
            onChange={(e) => setCellSize(Number(e.target.value))}
            className="w-full accent-accent"
          />
          <span className="text-xs text-text-tertiary">{preferences.cellSize}px</span>
        </div>
      </div>
    </SlidePanel>
  );
}
