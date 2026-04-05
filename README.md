# grid-puzzles

A collection of grid-based logic puzzle games, starting with **Nonograms** (also known as Picross / Griddlers / Hanjie).

## Nonogram Rules

- The grid is made up of cells that are either **filled** (1) or **empty** (0). All cells start hidden.
- **Row and column clues** tell you how many consecutive filled cells exist in that line.
- Multiple numbers (e.g. `2 3`) mean multiple groups of consecutive filled cells, separated by at least one empty cell.
- The order of the numbers matches the order of the groups from left-to-right (rows) or top-to-bottom (columns).
- The goal is to determine every cell's state using only the clues.

## Goals

- Build an interactive Nonogram player (React/Vite/Tailwind).
- Implement a solver that demonstrates the mathematical/logical techniques for solving Nonograms (constraint propagation, line solving, backtracking).
- Potentially expand to other grid logic puzzles in the future.

## Part of monoWeb

This repo is a submodule of [monoWeb](https://github.com/ShaoqinHou/monoWeb). Deployed at `cv.rehou.games/grid-puzzles/`.
