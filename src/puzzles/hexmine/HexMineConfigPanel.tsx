import { useState, useEffect } from 'react';
import { hexmineClueConfig } from './generate';
import { loadFromStorage, saveToStorage } from '@/services/storage';

const CONFIG_KEY = 'grid-puzzles:hexmine-config';

// Load persisted config on module init
const saved = loadFromStorage<Partial<typeof hexmineClueConfig>>(CONFIG_KEY);
if (saved) {
  Object.assign(hexmineClueConfig, saved);
}

function Toggle({ label, checked, onChange }: {
  label: string; checked: boolean; onChange: (v: boolean) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-2 py-1">
      <span className="text-xs text-text-secondary">{label}</span>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`w-8 h-4 rounded-full transition-colors relative ${
          checked ? 'bg-accent' : 'bg-bg-primary'
        }`}
      >
        <span
          className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-transform ${
            checked ? 'translate-x-4' : 'translate-x-0.5'
          }`}
        />
      </button>
    </label>
  );
}

function NumberInput({ label, value, onChange, min, max, step = 1 }: {
  label: string; value: number; onChange: (v: number) => void;
  min: number; max: number; step?: number;
}) {
  return (
    <label className="flex items-center justify-between gap-2 py-1">
      <span className="text-xs text-text-secondary">{label}</span>
      <input
        type="number"
        value={value}
        min={min}
        max={max}
        step={step}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-14 text-xs text-center bg-bg-primary border border-grid-line rounded px-1 py-0.5 text-text-primary"
      />
    </label>
  );
}

export function HexMineConfigPanel({ onClose }: { onClose: () => void }) {
  // Local state mirrors the config — applied on close
  const [cfg, setCfg] = useState({ ...hexmineClueConfig });

  const update = <K extends keyof typeof hexmineClueConfig>(
    key: K,
    value: typeof hexmineClueConfig[K],
  ) => {
    setCfg((prev) => ({ ...prev, [key]: value }));
    hexmineClueConfig[key] = value;
    saveToStorage(CONFIG_KEY, { ...hexmineClueConfig });
  };

  return (
    <div className="bg-bg-secondary rounded-lg border border-grid-line overflow-hidden max-w-xs">
      <div className="flex items-center justify-between px-3 py-2 bg-bg-tertiary">
        <h3 className="text-sm font-bold text-text-primary">Generation Config</h3>
        <button
          type="button"
          onClick={onClose}
          className="text-text-tertiary hover:text-text-primary text-xs"
        >
          ✕
        </button>
      </div>

      <div className="px-3 py-2 space-y-0.5">
        <p className="text-[10px] text-text-tertiary uppercase tracking-wide mb-1">Clue Types</p>
        <Toggle
          label="Adjacent {N} / -N-"
          checked={cfg.adjacentClues}
          onChange={(v) => update('adjacentClues', v)}
        />
        <Toggle
          label="Line clues (directional)"
          checked={cfg.lineClues}
          onChange={(v) => update('lineClues', v)}
        />
        <Toggle
          label="Range clues (radius-2)"
          checked={cfg.rangeClues}
          onChange={(v) => update('rangeClues', v)}
        />
        <Toggle
          label="Question marks ?"
          checked={cfg.questionMarks}
          onChange={(v) => update('questionMarks', v)}
        />
        <Toggle
          label="Edge headers (row/col totals)"
          checked={cfg.edgeHeaders}
          onChange={(v) => update('edgeHeaders', v)}
        />
      </div>

      <div className="px-3 py-2 space-y-0.5 border-t border-grid-line">
        <p className="text-[10px] text-text-tertiary uppercase tracking-wide mb-1">Gameplay Rules</p>
        <Toggle
          label="Cascade reveal (0-cells)"
          checked={cfg.cascadeReveal}
          onChange={(v) => update('cascadeReveal', v)}
        />
        <Toggle
          label="Chord reveal"
          checked={cfg.chordReveal}
          onChange={(v) => update('chordReveal', v)}
        />
        <Toggle
          label="Lose on wrong flag"
          checked={cfg.loseOnWrongFlag}
          onChange={(v) => update('loseOnWrongFlag', v)}
        />
      </div>

      <div className="px-3 py-2 space-y-0.5 border-t border-grid-line">
        <p className="text-[10px] text-text-tertiary uppercase tracking-wide mb-1">Quantities</p>
        <NumberInput
          label="Adjacent ratio"
          value={Math.round(cfg.adjacentRatio * 100)}
          onChange={(v) => update('adjacentRatio', v / 100)}
          min={0} max={100}
        />
        <NumberInput
          label="Line clues (hard)"
          value={cfg.lineCountHard}
          onChange={(v) => update('lineCountHard', v)}
          min={0} max={10}
        />
        <NumberInput
          label="Line clues (expert)"
          value={cfg.lineCountExpert}
          onChange={(v) => update('lineCountExpert', v)}
          min={0} max={10}
        />
        <NumberInput
          label="Range clues"
          value={cfg.rangeCount}
          onChange={(v) => update('rangeCount', v)}
          min={0} max={10}
        />
        <NumberInput
          label="Question marks"
          value={cfg.questionMarkCount}
          onChange={(v) => update('questionMarkCount', v)}
          min={0} max={10}
        />
        <NumberInput
          label="Edge headers"
          value={cfg.edgeHeaderCount}
          onChange={(v) => update('edgeHeaderCount', v)}
          min={0} max={10}
        />
      </div>

      <div className="px-3 py-2 border-t border-grid-line">
        <p className="text-[10px] text-text-tertiary">
          Changes apply on next New Game. Clue types only appear at medium+ difficulty.
        </p>
      </div>
    </div>
  );
}
