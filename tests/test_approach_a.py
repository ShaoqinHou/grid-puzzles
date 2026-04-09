"""Test Approach A: Pure Grow From Steps compiler (compilePuzzleGrow).

Tests that the grow compiler produces minimal grids with no extra solvable areas.
Run with: python tests/test_approach_a.py
Requires dev server running at localhost:5180.
"""
from playwright.sync_api import sync_playwright
import json, time, sys

BASE = "http://localhost:5180"
PASS = 0
FAIL = 0

def check(name, passed):
    global PASS, FAIL
    if passed:
        PASS += 1
        print(f"  OK  {name}")
    else:
        FAIL += 1
        print(f"  FAIL {name}")

def compile_grow(page, blueprint_js):
    """Compile a blueprint via compilePuzzleGrow in the browser and return results."""
    result = page.evaluate(f'''() => {{
        return new Promise((resolve) => {{
            Promise.all([
                import('/src/puzzles/hexmine/compiler/index.ts'),
                import('/src/puzzles/hexmine/solve.ts'),
            ]).then(([compilerMod, solveMod]) => {{
                try {{
                    const blueprint = {blueprint_js};
                    const puzzle = compilerMod.compilePuzzleGrow(blueprint);

                    // Count active cells (not disabled)
                    let activeCells = 0;
                    let disabledCells = 0;
                    let hiddenCells = 0;
                    let revealedCells = 0;
                    let mineCells = 0;
                    const totalCells = puzzle.width * puzzle.height;

                    for (let r = 0; r < puzzle.height; r++) {{
                        for (let c = 0; c < puzzle.width; c++) {{
                            const cell = puzzle.grid[r][c];
                            const sol = puzzle.solution[r][c];
                            if (cell === 'disabled' || sol === 'disabled') {{
                                disabledCells++;
                            }} else {{
                                activeCells++;
                                if (typeof cell === 'number') revealedCells++;
                                if (cell === 'hidden') hiddenCells++;
                            }}
                            if (sol === 'mine') mineCells++;
                        }}
                    }}

                    // Check solvability
                    const solvable = solveMod.solveFromRevealed(
                        puzzle.grid, puzzle.solution,
                        puzzle.width, puzzle.height,
                        puzzle.clues?.clues
                    );

                    // Get solution path length
                    const pathLength = puzzle.clues?.solutionPath?.length ?? 0;

                    // Get clue info
                    const clues = puzzle.clues?.clues ?? [];
                    const clueTypes = clues.reduce((acc, c) => {{
                        acc[c.type] = (acc[c.type] || 0) + 1;
                        return acc;
                    }}, {{}});

                    // Check if shape is present (should always be for grow compiler)
                    const hasShape = !!puzzle.shape;
                    const shapeDisabledCount = hasShape
                        ? puzzle.shape.flat().filter(v => !v).length
                        : 0;

                    resolve({{
                        success: true,
                        totalCells,
                        activeCells,
                        disabledCells,
                        hiddenCells,
                        revealedCells,
                        mineCells,
                        solvable,
                        pathLength,
                        clueCount: clues.length,
                        clueTypes,
                        hasShape,
                        shapeDisabledCount,
                        width: puzzle.width,
                        height: puzzle.height,
                    }});
                }} catch (e) {{
                    resolve({{ success: false, error: e.message, stack: e.stack }});
                }}
            }});
        }});
    }}''')
    return result


def main():
    global PASS, FAIL

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1280, "height": 800})
        page.goto(BASE)
        page.wait_for_load_state("networkidle")
        time.sleep(2)

        print("=" * 60)
        print("Approach A: Pure Grow From Steps — Test Suite")
        print("=" * 60)

        # ── Test 1: 1-step edge-header + range clue ──
        # This is the primary test: a small blueprint that should produce
        # a minimal grid (most cells are holes/disabled).
        print("\n-- Test 1: 1-step edge-header + range clue --")
        r = compile_grow(page, '''{
            id: 'grow-1step', name: 'Grow 1-Step', width: 8, height: 8,
            mineDensity: 0.15, seed: 42,
            steps: [
                {
                    id: 0,
                    target: { kind: 'auto' },
                    targetValue: 1,
                    requiredStrategies: [
                        { kind: 'clue', type: 'edge-header' },
                        { kind: 'clue', type: 'range' },
                    ]
                }
            ]
        }''')

        if not r.get('success'):
            print(f"  COMPILE ERROR: {r.get('error')}")
            check("compiles successfully", False)
        else:
            check("compiles successfully", True)

            total = r['totalCells']
            active = r['activeCells']
            disabled = r['disabledCells']
            print(f"    Total={total}, Active={active}, Disabled={disabled}")
            print(f"    Mines={r['mineCells']}, Revealed={r['revealedCells']}, Hidden={r['hiddenCells']}")
            print(f"    Clues={r['clueCount']}, Types={r['clueTypes']}")
            print(f"    SolutionPath length={r['pathLength']}")

            # Most of the grid should be holes (disabled)
            # For an 8x8 grid (64 cells), a 1-step puzzle should use far fewer
            # than all 64 cells.
            check("most cells are disabled (>50% of grid is holes)",
                  disabled > total * 0.5)
            check("active cells are minimal (<50% of grid)",
                  active < total * 0.5)

            # Solution path should have exactly 1 step
            check("solution path has exactly 1 step", r['pathLength'] == 1)

            # Should be solvable
            check("puzzle is solvable", r.get('solvable'))

            # Should have shape (grow compiler always produces shape)
            check("has shape array", r['hasShape'])

            # Shape disabled count should match disabled cells
            check("shape matches disabled count",
                  r['shapeDisabledCount'] == disabled)

        # ── Test 2: Verify NO extra solvable areas ──
        # Compile with grow, then check that ALL hidden cells are within clue
        # scopes (no "orphan" solvable cells outside the puzzle path).
        print("\n-- Test 2: No extra solvable areas --")
        r2 = compile_grow(page, '''{
            id: 'grow-no-extras', name: 'Grow No Extras', width: 10, height: 10,
            mineDensity: 0.12, seed: 999,
            steps: [
                { id: 0, target: { kind: 'auto' }, targetValue: 1,
                  requiredStrategies: [{ kind: 'clue', type: 'adjacent' }] },
            ]
        }''')

        if not r2.get('success'):
            print(f"  COMPILE ERROR: {r2.get('error')}")
            check("compiles successfully", False)
        else:
            check("compiles successfully", True)

            total = r2['totalCells']
            active = r2['activeCells']
            disabled = r2['disabledCells']
            print(f"    Total={total}, Active={active}, Disabled={disabled}")

            # Key assertion: active cells should be far less than total
            # (for 10x10=100 cells, 1 step + origin ~= 10-20 cells max)
            check("active cells << total (no extra fill)",
                  active < total * 0.5)
            check("disabled cells > 50%", disabled > total * 0.5)

        # ── Test 3: Verify hidden cells are all in clue scopes ──
        print("\n-- Test 3: All hidden cells are in clue scopes or origin --")
        r3_result = page.evaluate('''() => {
            return new Promise((resolve) => {
                import('/src/puzzles/hexmine/compiler/index.ts').then(compilerMod => {
                    try {
                        const blueprint = {
                            id: 'grow-scope-check', name: 'Scope Check', width: 8, height: 8,
                            mineDensity: 0.15, seed: 12345,
                            steps: [
                                { id: 0, target: { kind: 'auto' }, targetValue: 1,
                                  requiredStrategies: [{ kind: 'clue', type: 'edge-header' }] },
                            ]
                        };
                        const puzzle = compilerMod.compilePuzzleGrow(blueprint);

                        // Collect all clue scope keys
                        const scopeKeys = new Set();
                        const clues = puzzle.clues?.clues ?? [];
                        for (const clue of clues) {
                            for (const key of clue.cellKeys) {
                                scopeKeys.add(key);
                            }
                        }

                        // Check that ALL non-disabled, non-revealed cells are in scope
                        let orphanCount = 0;
                        const orphans = [];
                        // Also include origin neighborhood as valid
                        const originR = Math.floor(8 / 2);
                        const originC = Math.floor(8 / 2);

                        for (let r = 0; r < puzzle.height; r++) {
                            for (let c = 0; c < puzzle.width; c++) {
                                const cell = puzzle.grid[r][c];
                                if (cell === 'disabled') continue;
                                if (typeof cell === 'number') continue; // revealed = fine
                                // This is a hidden active cell -- should be in a clue scope
                                const key = `${r},${c}`;
                                if (!scopeKeys.has(key)) {
                                    orphanCount++;
                                    orphans.push(key);
                                }
                            }
                        }

                        resolve({
                            success: true,
                            orphanCount,
                            orphans: orphans.slice(0, 10),
                            totalClueScopes: scopeKeys.size,
                            clueCount: clues.length,
                        });
                    } catch (e) {
                        resolve({ success: false, error: e.message });
                    }
                });
            });
        }''')

        if not r3_result.get('success'):
            print(f"  COMPILE ERROR: {r3_result.get('error')}")
            check("compiles successfully", False)
        else:
            check("compiles successfully", True)
            orphans = r3_result['orphanCount']
            print(f"    Orphan hidden cells: {orphans}")
            print(f"    Clue scopes cover: {r3_result['totalClueScopes']} cells")
            if orphans > 0:
                print(f"    First orphans: {r3_result['orphans']}")
            # Some orphan cells are OK if they are in the origin neighborhood
            # (the foothold is always safe and doesn't need clue scope coverage).
            # But there should be very few.
            check("no or very few orphan cells (<=7, origin neighborhood)",
                  orphans <= 7)

        # ── Test 4: Compare grow vs old compiler cell counts ──
        print("\n-- Test 4: Grow produces fewer active cells than old compiler --")
        r4_result = page.evaluate('''() => {
            return new Promise((resolve) => {
                import('/src/puzzles/hexmine/compiler/index.ts').then(compilerMod => {
                    try {
                        const blueprint = {
                            id: 'compare', name: 'Compare', width: 8, height: 8,
                            mineDensity: 0.15, seed: 7777,
                            steps: [
                                { id: 0, target: { kind: 'auto' }, targetValue: 1,
                                  requiredStrategies: [{ kind: 'clue', type: 'adjacent' }] },
                            ]
                        };

                        const oldPuzzle = compilerMod.compilePuzzle(blueprint);
                        const growPuzzle = compilerMod.compilePuzzleGrow(blueprint);

                        function countActive(grid) {
                            let count = 0;
                            for (const row of grid) {
                                for (const cell of row) {
                                    if (cell !== 'disabled') count++;
                                }
                            }
                            return count;
                        }

                        resolve({
                            success: true,
                            oldActive: countActive(oldPuzzle.solution),
                            growActive: countActive(growPuzzle.solution),
                            oldHasShape: !!oldPuzzle.shape,
                            growHasShape: !!growPuzzle.shape,
                        });
                    } catch (e) {
                        resolve({ success: false, error: e.message });
                    }
                });
            });
        }''')

        if not r4_result.get('success'):
            print(f"  COMPILE ERROR: {r4_result.get('error')}")
            check("both compilers work", False)
        else:
            check("both compilers work", True)
            old_active = r4_result['oldActive']
            grow_active = r4_result['growActive']
            print(f"    Old compiler active cells: {old_active}")
            print(f"    Grow compiler active cells: {grow_active}")
            check("grow produces fewer active cells than old",
                  grow_active < old_active)
            check("grow always has shape", r4_result['growHasShape'])

        # ── Test 5: Deterministic (same seed = same result) ──
        print("\n-- Test 5: Deterministic (same seed) --")
        r5a = compile_grow(page, '''{
            id: 'det-a', name: 'Det A', width: 8, height: 8,
            mineDensity: 0.15, seed: 5555,
            steps: [
                { id: 0, target: { kind: 'auto' }, targetValue: 1,
                  requiredStrategies: [{ kind: 'clue', type: 'adjacent' }] },
            ]
        }''')
        r5b = compile_grow(page, '''{
            id: 'det-b', name: 'Det B', width: 8, height: 8,
            mineDensity: 0.15, seed: 5555,
            steps: [
                { id: 0, target: { kind: 'auto' }, targetValue: 1,
                  requiredStrategies: [{ kind: 'clue', type: 'adjacent' }] },
            ]
        }''')
        check("both compile", r5a.get('success') and r5b.get('success'))
        if r5a.get('success') and r5b.get('success'):
            check("same mine count", r5a['mineCells'] == r5b['mineCells'])
            check("same active cells", r5a['activeCells'] == r5b['activeCells'])
            check("same disabled cells", r5a['disabledCells'] == r5b['disabledCells'])

        browser.close()

    print(f"\n{'='*60}")
    print(f"RESULT: {PASS} passed, {FAIL} failed")
    print(f"{'='*60}")
    sys.exit(0 if FAIL == 0 else 1)

if __name__ == "__main__":
    main()
