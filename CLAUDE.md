# grid-puzzles

Grid-based logic puzzle game webapp, starting with Nonograms (Picross).

## Stack

React + Vite + Tailwind (same as other monoWeb apps).

## Deployment

Submodule of monoWeb. Will be deployed at `cv.rehou.games/grid-puzzles/`.

Build command:
```bash
MSYS_NO_PATHCONV=1 npx vite build --base /grid-puzzles/
```

## Platform Notes

- Use `python` not `python3` on Windows/MINGW
- Always prefix `MSYS_NO_PATHCONV=1` for `--base /path/` on Git Bash
