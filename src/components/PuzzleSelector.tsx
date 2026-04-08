import { useEffect, useState } from 'react';
import type { Difficulty } from '@/types';
import { usePuzzleRegistry } from '@/engine/PuzzleRegistry';
import { useGameState } from '@/engine/GameStateProvider';
import { usePanelManager } from '@/engine/PanelManager';
import { SlidePanel } from './ui/SlidePanel';

const SIZE_PRESETS: Record<Difficulty, { width: number; height: number }> = {
  easy: { width: 5, height: 5 },
  medium: { width: 10, height: 10 },
  hard: { width: 15, height: 15 },
  expert: { width: 20, height: 20 },
};

export function PuzzleSelector() {
  const { allTypeIds, getDefinition } = usePuzzleRegistry();
  const { dispatch } = useGameState();
  const { activePanel, closePanel } = usePanelManager();
  const [difficulty, setDifficulty] = useState<Difficulty>('easy');
  const [customWidth, setCustomWidth] = useState(10);
  const [customHeight, setCustomHeight] = useState(10);
  const [useCustomSize, setUseCustomSize] = useState(false);

  // Reset custom size state when the panel opens
  useEffect(() => {
    if (activePanel === 'puzzle-select') {
      setUseCustomSize(false);
      setCustomWidth(10);
      setCustomHeight(10);
    }
  }, [activePanel]);

  const handleNewGame = (typeId: string) => {
    const def = getDefinition(typeId);
    if (!def) return;
    const size = useCustomSize
      ? { width: customWidth, height: customHeight }
      : SIZE_PRESETS[difficulty];
    const instance = def.generate(size.width, size.height, difficulty);
    dispatch({
      type: 'NEW_GAME',
      payload: {
        id: crypto.randomUUID(),
        puzzleType: typeId,
        width: instance.width,
        height: instance.height,
        difficulty,
        grid: instance.grid as unknown[][],
        solution: instance.solution as unknown[][],
        clues: instance.clues,
        emptyCell: instance.emptyCell,
        shape: instance.shape ?? null,
      },
    });
    closePanel();
  };

  return (
    <SlidePanel open={activePanel === 'puzzle-select'} onClose={closePanel} title="New Game">
      <div className="space-y-4">
        {/* Difficulty */}
        <div>
          <label className="text-[10px] font-mono text-text-tertiary uppercase tracking-wider block mb-2">
            Difficulty
          </label>
          <div className="grid grid-cols-2 gap-2">
            {(['easy', 'medium', 'hard', 'expert'] as Difficulty[]).map(d => (
              <button
                key={d}
                type="button"
                onClick={() => { setDifficulty(d); setUseCustomSize(false); }}
                className={`px-3 py-2 rounded text-sm capitalize transition-colors ${
                  d === difficulty && !useCustomSize
                    ? 'bg-accent text-white'
                    : 'bg-bg-tertiary text-text-secondary hover:text-text-primary'
                }`}
              >
                {d} ({SIZE_PRESETS[d].width}×{SIZE_PRESETS[d].height})
              </button>
            ))}
          </div>
        </div>

        {/* Custom Size */}
        <div>
          <button
            type="button"
            onClick={() => setUseCustomSize(!useCustomSize)}
            className={`text-[10px] font-mono uppercase tracking-wider block mb-2 ${useCustomSize ? 'text-accent' : 'text-text-tertiary hover:text-text-secondary'}`}
          >
            {useCustomSize ? '▼ Custom Size' : '▶ Custom Size'}
          </button>
          {useCustomSize && (
            <div className="flex items-center gap-2">
              <input
                type="number"
                min={3}
                max={30}
                value={customWidth}
                onChange={(e) => setCustomWidth(Math.max(3, Math.min(30, Number(e.target.value))))}
                className="w-16 px-2 py-1 bg-bg-tertiary border border-grid-line rounded text-sm text-text-primary text-center"
              />
              <span className="text-text-tertiary">×</span>
              <input
                type="number"
                min={3}
                max={30}
                value={customHeight}
                onChange={(e) => setCustomHeight(Math.max(3, Math.min(30, Number(e.target.value))))}
                className="w-16 px-2 py-1 bg-bg-tertiary border border-grid-line rounded text-sm text-text-primary text-center"
              />
            </div>
          )}
        </div>

        {/* Puzzle Type */}
        <div>
          <label className="text-[10px] font-mono text-text-tertiary uppercase tracking-wider block mb-2">
            Puzzle Type
          </label>
          <div className="space-y-2">
            {allTypeIds.map((id) => {
              const def = getDefinition(id);
              if (!def) return null;
              return (
                <button
                  key={id}
                  type="button"
                  onClick={() => handleNewGame(id)}
                  className="w-full flex items-center gap-3 p-3 rounded bg-bg-tertiary hover:bg-grid-line transition-colors text-left"
                >
                  <span className="text-2xl">{def.icon}</span>
                  <div>
                    <div className="text-sm font-semibold text-text-primary">{def.label}</div>
                    <div className="text-xs text-text-tertiary">{def.description}</div>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </SlidePanel>
  );
}
