import { useState } from 'react';

type LegendSection = 'basics' | 'contiguous' | 'nonContiguous' | 'line' | 'range' | 'questionMark' | 'edgeHeader' | null;

const HEX_MINI = 'M 13,0 L 26,7.5 L 26,22.5 L 13,30 L 0,22.5 L 0,7.5 Z';

function MiniHex({ fill, text, textColor, fontSize = 11 }: {
  fill: string; text?: string; textColor?: string; fontSize?: number;
}) {
  return (
    <svg width="28" height="32" viewBox="-1 -1 28 32" className="inline-block">
      <path d={HEX_MINI} fill={fill} stroke="var(--color-grid-line)" strokeWidth="1" />
      {text && (
        <text
          x="13" y="16"
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={fontSize}
          fontWeight="bold"
          fill={textColor ?? 'var(--color-text-primary)'}
        >
          {text}
        </text>
      )}
    </svg>
  );
}

function Section({ title, expanded, onToggle, children }: {
  title: string; expanded: boolean; onToggle: () => void; children: React.ReactNode;
}) {
  return (
    <div className="border-b border-grid-line last:border-b-0">
      <button
        type="button"
        onClick={onToggle}
        className="w-full flex items-center justify-between px-3 py-2 text-sm text-text-primary hover:bg-bg-tertiary transition-colors"
      >
        <span className="font-medium">{title}</span>
        <span className="text-text-tertiary text-xs">{expanded ? '▾' : '▸'}</span>
      </button>
      {expanded && (
        <div className="px-3 pb-3 text-xs text-text-secondary leading-relaxed space-y-2">
          {children}
        </div>
      )}
    </div>
  );
}

export function HexMineLegend({ onClose }: { onClose: () => void }) {
  const [expanded, setExpanded] = useState<LegendSection>('basics');

  const toggle = (s: LegendSection) => setExpanded(expanded === s ? null : s);

  return (
    <div className="bg-bg-secondary rounded-lg border border-grid-line overflow-hidden max-w-sm">
      <div className="flex items-center justify-between px-3 py-2 bg-bg-tertiary">
        <h3 className="text-sm font-bold text-text-primary">How to Play</h3>
        <button
          type="button"
          onClick={onClose}
          className="text-text-tertiary hover:text-text-primary text-xs"
        >
          ✕
        </button>
      </div>

      <Section title="Basics" expanded={expanded === 'basics'} onToggle={() => toggle('basics')}>
        <div className="flex items-start gap-2">
          <MiniHex fill="var(--color-hex-hidden)" />
          <p><strong>Left-click</strong> to reveal. <strong>Right-click</strong> to flag a mine.</p>
        </div>
        <div className="flex items-start gap-2">
          <MiniHex fill="var(--color-hex-revealed)" text="2" textColor="var(--color-hex-num-2)" />
          <p>Numbers show how many adjacent mines surround this cell (out of 6 neighbors).</p>
        </div>
        <div className="flex items-start gap-2">
          <MiniHex fill="var(--color-hex-revealed-0)" />
          <p>Empty cells (0 mines nearby) auto-reveal their neighbors.</p>
        </div>
        <p className="text-warning">Flagging a safe cell = instant loss!</p>
      </Section>

      <Section title="Contiguous {N}" expanded={expanded === 'contiguous'} onToggle={() => toggle('contiguous')}>
        <div className="flex items-start gap-2">
          <MiniHex fill="var(--color-hex-revealed)" text="{3}" textColor="var(--color-hex-bracket-contiguous)" fontSize={9} />
          <p>Mines around this cell form <strong>one connected group</strong> — no gaps between them.</p>
        </div>
        <div className="mt-1 p-2 bg-bg-primary rounded text-[10px]">
          <p className="text-text-tertiary mb-1">Example: 3 neighbors are mines</p>
          <div className="flex gap-1 items-center">
            <span className="text-success">Valid:</span>
            <span>●●●○○○</span>
            <span className="ml-2 text-error">Invalid:</span>
            <span>●○●●○○</span>
          </div>
        </div>
        <p className="text-text-tertiary">Neighbors wrap around — mines at positions 1 and 6 are adjacent.</p>
      </Section>

      <Section title="Non-Contiguous -N-" expanded={expanded === 'nonContiguous'} onToggle={() => toggle('nonContiguous')}>
        <div className="flex items-start gap-2">
          <MiniHex fill="var(--color-hex-revealed)" text="-3-" textColor="var(--color-hex-bracket-noncontiguous)" fontSize={9} />
          <p>Mines around this cell are <strong>split into separate groups</strong> — at least one gap.</p>
        </div>
        <div className="mt-1 p-2 bg-bg-primary rounded text-[10px]">
          <p className="text-text-tertiary mb-1">Example: 3 neighbors are mines</p>
          <div className="flex gap-1 items-center">
            <span className="text-success">Valid:</span>
            <span>●○●●○○</span>
            <span className="ml-2 text-error">Invalid:</span>
            <span>●●●○○○</span>
          </div>
        </div>
      </Section>

      <Section title="Line Clues" expanded={expanded === 'line'} onToggle={() => toggle('line')}>
        <div className="flex items-start gap-2">
          <MiniHex fill="var(--color-hex-disabled)" text="2" textColor="var(--color-hex-clue-line)" />
          <p>Dark cells show mine count along a <strong>straight line</strong> in one direction.</p>
        </div>
        <p>The number is rotated to show which direction the line goes. Look along that direction to find the mines.</p>
        <p className="text-text-tertiary">These cells are disabled — you cannot click them.</p>
      </Section>

      <Section title="Range Clues (N)" expanded={expanded === 'range'} onToggle={() => toggle('range')}>
        <div className="flex items-start gap-2">
          <MiniHex fill="var(--color-hex-revealed)" text="(4)" textColor="var(--color-hex-clue-range)" fontSize={9} />
          <p>Count of mines within <strong>2 hex steps</strong> of this cell — a larger area than normal.</p>
        </div>
        <p className="text-text-tertiary">Covers up to 18 surrounding cells instead of the usual 6.</p>
      </Section>

      <Section title="Question Marks ?" expanded={expanded === 'questionMark'} onToggle={() => toggle('questionMark')}>
        <div className="flex items-start gap-2">
          <MiniHex fill="var(--color-hex-revealed)" text="?" textColor="var(--color-text-tertiary)" />
          <p>A revealed cell that <strong>hides its number</strong>. You know it's safe, but not how many mines surround it.</p>
        </div>
        <p className="text-text-tertiary">Forces you to deduce from surrounding clues instead.</p>
      </Section>

      <Section title="Edge Headers" expanded={expanded === 'edgeHeader'} onToggle={() => toggle('edgeHeader')}>
        <p>Numbers shown at the <strong>edge of the grid</strong> indicate the total mine count in that entire row or column.</p>
        <p className="text-text-tertiary">Like nonogram clues — they tell you how many mines are in the whole line.</p>
      </Section>
    </div>
  );
}
