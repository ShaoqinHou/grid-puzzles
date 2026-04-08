import { useState, useMemo } from 'react';
import { useGameState } from '@/engine/GameStateProvider';
import { usePanelManager } from '@/engine/PanelManager';
import { LEVEL_PACKS, loadProgress, packCompletionCount, type LevelDef, type LevelPack } from './levelPacks';
import { hexmineClueConfig, generateHexMine } from './generate';
import { formatElapsed } from '@/utils/formatters';

function PackHeader({ pack, completedCount, expanded, onToggle }: {
  pack: LevelPack; completedCount: number; expanded: boolean; onToggle: () => void;
}) {
  const total = pack.levels.length;
  const pct = Math.round((completedCount / total) * 100);

  return (
    <button
      type="button"
      onClick={onToggle}
      className="w-full flex items-center justify-between px-3 py-2.5 hover:bg-bg-tertiary transition-colors"
    >
      <div className="text-left">
        <div className="text-sm font-medium text-text-primary">{pack.name}</div>
        <div className="text-[10px] text-text-tertiary">{pack.description}</div>
      </div>
      <div className="flex items-center gap-2 text-xs">
        <span className="text-text-secondary">{completedCount}/{total}</span>
        <div className="w-12 h-1.5 rounded-full bg-bg-primary overflow-hidden">
          <div
            className="h-full rounded-full bg-accent transition-all"
            style={{ width: `${pct}%` }}
          />
        </div>
        <span className="text-text-tertiary">{expanded ? '▾' : '▸'}</span>
      </div>
    </button>
  );
}

function LevelButton({ level, progress, onPlay }: {
  level: LevelDef;
  progress: { completed: boolean; bestTimeMs: number | null } | undefined;
  onPlay: (level: LevelDef) => void;
}) {
  const diffColors: Record<string, string> = {
    easy: 'text-success',
    medium: 'text-warning',
    hard: 'text-error',
    expert: 'text-accent',
  };

  return (
    <button
      type="button"
      onClick={() => onPlay(level)}
      className="w-full flex items-center justify-between px-4 py-1.5 text-xs hover:bg-bg-primary transition-colors"
    >
      <div className="flex items-center gap-2">
        <span className={progress?.completed ? 'text-success' : 'text-text-tertiary'}>
          {progress?.completed ? '✓' : '○'}
        </span>
        <span className="text-text-secondary">{level.name}</span>
        <span className={`text-[10px] ${diffColors[level.difficulty] ?? ''}`}>
          {level.difficulty}
        </span>
      </div>
      {progress?.bestTimeMs != null && (
        <span className="text-text-tertiary text-[10px]">
          {formatElapsed(progress.bestTimeMs)}
        </span>
      )}
    </button>
  );
}

export function LevelPackPanel({ onClose }: { onClose: () => void }) {
  const { dispatch } = useGameState();
  const { closePanel } = usePanelManager();
  const [expandedPack, setExpandedPack] = useState<string | null>('intro');
  const progress = useMemo(() => loadProgress(), []);

  const handlePlay = (level: LevelDef) => {
    // Save current config, apply level overrides
    const savedConfig = { ...hexmineClueConfig };

    if (level.config) {
      Object.assign(hexmineClueConfig, level.config);
    }
    hexmineClueConfig.seed = level.seed;

    const instance = generateHexMine(0, 0, level.difficulty);

    // Restore config (except seed which resets to null)
    Object.assign(hexmineClueConfig, savedConfig);
    hexmineClueConfig.seed = null;

    dispatch({
      type: 'NEW_GAME',
      payload: {
        id: `level:${level.id}`,
        puzzleType: 'hexmine',
        difficulty: level.difficulty,
        width: instance.width,
        height: instance.height,
        grid: instance.grid as unknown[][],
        solution: instance.solution as unknown[][],
        clues: instance.clues,
        emptyCell: instance.emptyCell,
        shape: instance.shape ?? null,
      },
    });

    onClose();
    closePanel();
  };

  return (
    <div className="bg-bg-secondary rounded-lg border border-grid-line overflow-hidden max-w-sm max-h-[60vh] overflow-y-auto">
      <div className="flex items-center justify-between px-3 py-2 bg-bg-tertiary sticky top-0 z-10">
        <h3 className="text-sm font-bold text-text-primary">Level Packs</h3>
        <button
          type="button"
          onClick={onClose}
          className="text-text-tertiary hover:text-text-primary text-xs"
        >
          ✕
        </button>
      </div>

      {LEVEL_PACKS.map((pack) => {
        const count = packCompletionCount(pack, progress);
        const isExpanded = expandedPack === pack.id;
        return (
          <div key={pack.id} className="border-b border-grid-line last:border-b-0">
            <PackHeader
              pack={pack}
              completedCount={count}
              expanded={isExpanded}
              onToggle={() => setExpandedPack(isExpanded ? null : pack.id)}
            />
            {isExpanded && (
              <div className="pb-1">
                {pack.levels.map((level) => (
                  <LevelButton
                    key={level.id}
                    level={level}
                    progress={progress[level.id]}
                    onPlay={handlePlay}
                  />
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
