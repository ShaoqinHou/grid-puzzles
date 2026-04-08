# Puzzle Compiler Vision

## Author's Design Goals

### Core Concept: Backwards Generation
Instead of placing mines randomly then checking solvability, **design the solving experience first and derive the mine layout from it.** The puzzle is defined as a sequence of deduction steps, and the generator builds a board that implements those steps.

### Step-Based Puzzle Design
Each step in the solving sequence is a "deduction unit" with:
- **Target cell(s)**: what the player figures out
- **Required clue types**: which clue(s) the player must use (line, contiguous, range, adjacent, etc.)
- **Difficulty**: how many clues must be combined (1=trivial, 2=medium, 3+=hard)
- **Unlock behavior**: what happens after solving (cascade some easy cells, or nothing)

### Control Spectrum
The author can specify as much or as little as they want per step:

| Level | What author specifies | Generator handles |
|-------|----------------------|-------------------|
| Full auto | "20 steps, medium difficulty" | Everything |
| Difficulty per step | "Step 1: easy, Step 5: hard (3 clues)" | Location + clue types |
| Clue types per step | "Step 3: needs line + contiguous" | Location |
| Location + difficulty | "Step at (3,7): hard" | Clue types |
| Location + clue types | "Step at (3,7): line + contiguous" | Only mine layout |
| Everything fixed | All specified | Nothing — may be impossible |

More constraints = higher chance of impossibility. The system should detect and report conflicts.

### Difficulty Control Per Step
Difficulty is NOT just "how many mines." It's **how many clues must be combined to make each deduction:**
- 1-clue deduction = easy (a single number tells you the answer)
- 2-clue intersection = medium (need info from two sources)
- 3+ clue chain = hard (multi-step reasoning)

### Grid Shape as Design Tool
The grid does NOT have to be a full rectangle. Holes and irregular boundaries are **design tools**:
- A hole next to a line clue forces the player to use that line clue
- Isolated regions can only be solved via specific clue paths
- The shape emerges from the solving path — only cells needed for the puzzle exist

### Strategies for Difficulty Management
1. **Pre-revealed cells**: give partial information (cell is safe but number hidden — "blue cells" in Hexcells)
2. **Holes**: block easy deduction paths, force use of specific clues
3. **Question marks**: revealed cells that hide their number
4. **Noise cells**: nearby undecided cells that create ambiguity/misdirection
5. **Cascade control**: 0-cells can reveal easy neighbors after a hard step (reward)
6. **Single entry points**: only one cell is solvable at a time (linear, hard)
7. **Multiple entry points**: several cells solvable simultaneously (branching, easier)

### The Math
The puzzle IS a constraint satisfaction problem:
- Each cell is a variable: 0 (safe) or 1 (mine)
- Each clue is an equation: `clue_value = sum(cells in scope that are mines)`
- Contiguous/nonContiguous are logical (AND/OR) constraints on arrangement
- Working backwards: choose cell values → derive clue values → constrain neighbors
- Each step ADDS equations to the system. The system must remain consistent.
- The solving path is literally a sequence of equations being added, each making one more variable determinable.

### Single vs Multiple Routes
- Single route (linear): every step has exactly one solvable cell. Harder to generate, creates focused puzzles.
- Multiple routes (branching): after some steps, multiple cells become solvable. Easier to generate, more open puzzles.
- The system should support BOTH, controlled by the author.

### The key insight
If the system works correctly, the author can:
1. Start with a large board (e.g., 20×18)
2. Place steps at specific or auto-chosen coordinates
3. Specify difficulty and clue types per step
4. The generator grows the puzzle outward from the steps
5. Trims unused board area (creating irregular shapes)
6. Every clue in the final puzzle is necessary — remove any one and the solving path breaks

### Constraints Can Be Impossible
When the author specifies both precise locations AND precise clue types, the constraints may be unsatisfiable. This is mathematically inherent, not a system limitation. The system must detect this and report which step(s) are problematic, suggesting relaxations (e.g., "try auto location instead of (3,7)").
