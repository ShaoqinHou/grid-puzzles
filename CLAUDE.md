# grid-puzzles

Grid-based logic puzzle game webapp. First puzzle: Nonograms (Picross). Extensible to other types.

## Quick Start

1. `npm install && npm run dev` — start at http://localhost:5173
2. `/add-puzzle <name>` to scaffold a new puzzle type
3. Read Architecture below, then `.claude/rules/` for detailed rules
4. See `src/puzzles/nonogram/` as reference implementation

## Architecture

Every puzzle type implements `PuzzleDefinition<TGrid, TClues, TCell>`. The engine is puzzle-agnostic — components read from providers and dispatch actions. No direct mutations.

### Providers (nested in this order)

| Provider | Responsibility |
|----------|---------------|
| `PreferencesProvider` | Theme, sound, cell size, show-timer toggle |
| `PuzzleRegistryProvider` | Holds all registered `PuzzleDefinition` instances. Read-only after boot |
| `GameStateProvider` | `useReducer` for active puzzle: grid, undo/redo, new game, reset. Persists to localStorage |
| `TimerProvider` | Elapsed time, 1s interval, pause on tab hidden |
| `GameEvaluatorProvider` | Pure derived state via `evaluateGrid()`. Never stored — recomputed every render |
| `PanelManagerProvider` | Mutually exclusive panel state (settings, stats, puzzle select) |

### PuzzleDefinition Interface

```typescript
interface PuzzleDefinition<TGrid, TClues, TCell> {
  readonly typeId: PuzzleTypeId;
  readonly label: string;
  readonly icon: string;
  readonly description: string;
  generate(width: number, height: number, difficulty: Difficulty): PuzzleInstance<TGrid, TClues, TCell>;
  computeClues(solution: TGrid): TClues;
  validateGrid(grid: TGrid, solution: TGrid): ValidationResult;
  validateCell(coord: CellCoord, grid: TGrid, solution: TGrid): CellValidation;
  nextCellValue(current: TCell, interaction: CellInteraction): TCell;
  cellValues: TCell[];
  emptyCell: TCell;
  clueLayout: ClueLayout;
  CellRenderer?: React.ComponentType<CellRendererProps<TCell>>;
  ClueRenderer?: React.ComponentType<ClueRendererProps<TClues>>;
  solve?(clues: TClues, width: number, height: number): TGrid | null;
  getHint?(grid: TGrid, solution: TGrid): CellCoord | null;
}
```

### GameAction Union

`NEW_GAME` | `CELL_INTERACT` | `UNDO` | `REDO` | `CHECK` | `HINT` | `RESET` | `PAUSE` | `RESUME` | `TICK` | `LOAD_GAME` | `MARK_SOLVED`

### Pure Evaluation

`evaluateGrid(grid, solution, clues, definition, checkMode)` → `{ progress, lineStatus, errors, solved }`

### Data Flow

1. User clicks cell → `GridCell.tsx` dispatches `CELL_INTERACT`
2. `GameStateProvider` reducer updates grid + undo stack
3. `GameEvaluatorProvider` recomputes derived state (progress, errors, solved)
4. Components re-render from evaluation context

## When Adding a Feature

### New puzzle type
1. Create `src/puzzles/{type}/` with: `index.ts`, `types.ts`, `generate.ts`, `validate.ts`, renderers
2. Implement `PuzzleDefinition<TGrid, TClues, TCell>` in `index.ts`
3. Add to `ALL_PUZZLE_DEFINITIONS` in `src/puzzles/index.ts`
4. Done — no engine or provider changes needed. Or use `/add-puzzle {name}`

### New panel or modal
- Side panels: use `<SlidePanel>` from `components/ui/SlidePanel.tsx`
- Centered dialogs: use `<Modal>` from `components/ui/Modal.tsx`
- Register in `PanelManager.tsx` — add to `PanelId` type
- Panels are mutually exclusive (one open at a time)

### New toggle or switch
- Use `<Toggle>` from `components/ui/Toggle.tsx`. Never inline a custom toggle.

### Destructive action (reset, clear)
- Two-click confirmation with 3-second auto-reset timeout

### Persist data
- Use the appropriate provider or `services/storage.ts`. Never raw `localStorage`.

### Grid interaction
- All cell mutations go through `GameStateProvider` dispatch (`CELL_INTERACT` action)
- Hooks translate raw events → dispatched actions
- Never mutate grid state outside the reducer

### New preference or setting
1. Add field to `Preferences` interface in `PreferencesProvider.tsx`
2. Add setter method (e.g., `setMyPref`) with useCallback
3. Add UI control in `SettingsPanel.tsx` using `<Toggle>` or input
4. Persistence is automatic — PreferencesProvider saves to localStorage

### New keyboard shortcut
1. Add case in `hooks/useKeyboardShortcuts.ts` inside the switch
2. Dispatch the corresponding GameAction
3. Avoid conflicts with existing shortcuts (Ctrl+Z, Ctrl+Y, C, H, Escape)

### Common code patterns

**Dispatch a game action:**
```typescript
const { dispatch } = useGameState();
dispatch({ type: 'CELL_INTERACT', payload: { coord, interaction, nextValue } });
```

**Read derived state:**
```typescript
const { progress, solved, errorKeys } = useGameEvaluation();
```

**Access puzzle definition:**
```typescript
const { getDefinition } = usePuzzleRegistry();
const def = getDefinition(state.puzzleType);
```

**Read/write preferences:**
```typescript
const { preferences, setCellSize, setShowTimer } = usePreferences();
```

## File Structure

```
src/
  main.tsx, App.tsx, index.css, types.ts, constants.ts
  engine/                          -- providers + core logic
    puzzleTypes.ts                 -- PuzzleDefinition interface
    gameTypes.ts                   -- GameState, GameAction
    PuzzleRegistry.tsx             -- PuzzleRegistryProvider
    GameStateProvider.tsx          -- useReducer + localStorage
    TimerProvider.tsx              -- timer context
    GameEvaluatorProvider.tsx      -- pure evaluation wrapper
    evaluateGrid.ts                -- pure function
    PanelManager.tsx               -- mutually exclusive panels
    PreferencesProvider.tsx        -- theme, settings
  puzzles/
    index.ts                       -- ALL_PUZZLE_DEFINITIONS manifest
    nonogram/                      -- first puzzle implementation
      index.ts, types.ts, generate.ts, solve.ts, validate.ts
      NonogramCellRenderer.tsx, NonogramClueRenderer.tsx
  components/
    ui/                            -- SlidePanel, Modal, Toggle, ConfirmButton, IconButton
    Grid.tsx, GridCell.tsx          -- generic grid renderer
    CluePanel.tsx                  -- row/col clues
    PuzzleSelector.tsx, GameToolbar.tsx, TimerDisplay.tsx
    CompletionOverlay.tsx, StatsPanel.tsx, SettingsPanel.tsx, AppHeader.tsx
  hooks/                           -- useKeyboardShortcuts, useDragFill, useVisibilityPause
  services/                        -- storage.ts (localStorage abstraction)
  utils/                           -- formatters.ts, grid.ts
```

## App States

1. **Empty** — No puzzle loaded. Header visible, "Start a Puzzle" button centered. No toolbar.
2. **Active** — Puzzle in progress. Grid + clues + toolbar (undo/redo/check/hint) visible. Timer running.
3. **Completed** — Puzzle solved. Grid locked. CompletionOverlay with time and "New Game" button.

Panels (Settings, Stats, PuzzleSelector) overlay on top of any state.

### Transitions
- Empty → Active: user starts a new game via PuzzleSelector
- Active → Completed: last correct cell filled (MARK_SOLVED dispatched automatically)
- Completed → Active: user clicks "New Game" in header
- Active → Active: user starts new game while one is in progress (old state replaced)

## Skills

| Command | Purpose |
|---------|---------|
| `/build` | Dev server, production build, E2E tests, type check |
| `/verify` | 8-step browser verification checklist (manual trigger) |
| `/add-puzzle <name>` | Scaffold a new puzzle type folder with all required files |

## Testing

- E2E: `python tests/e2e.py` (97 tests across 12 groups, Playwright)
- Dev server must be running at localhost:5173
- Default `headless=False` for debugging. `python tests/e2e.py --ci` for headless.
- For manual browser verification, use `/verify` skill (8-step checklist)

## Design Notes

- `CellInteraction` is currently `'primary' | 'secondary' | 'clear'`. This covers Nonograms (fill/mark/erase). When adding puzzle types with richer input (Sudoku number entry), extend the type.
- `ClueLayout` is currently `'top-left' | 'borders' | 'inside-cells' | 'none'`. Extend when a new layout is needed.
- `GameEvaluatorProvider` should wrap `evaluateGrid()` in `useMemo` keyed on `[grid, solution, checkMode]` to avoid recomputing on unrelated re-renders.
