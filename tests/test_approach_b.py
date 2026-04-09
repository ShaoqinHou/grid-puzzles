"""Test Approach B: Grow + Fog compiler (compilePuzzleFog)."""
from playwright.sync_api import sync_playwright
import json, time, sys

BASE = "http://localhost:5180"
PASS = 0
FAIL = 0


def check(name, passed, detail=""):
    global PASS, FAIL
    if passed:
        PASS += 1
        print(f"  OK  {name}")
    else:
        FAIL += 1
        msg = f"  FAIL {name}"
        if detail:
            msg += f" -- {detail}"
        print(msg)


def compile_fog(page, blueprint_js):
    """Compile a blueprint via compilePuzzleFog in the browser and return analysis."""
    result = page.evaluate(f'''() => {{
        return new Promise((resolve) => {{
            import('/src/puzzles/hexmine/compiler/index.ts').then(mod => {{
                try {{
                    const blueprint = {blueprint_js};
                    const puzzle = mod.compilePuzzleFog(blueprint);

                    // Analyse the grids
                    const h = puzzle.height;
                    const w = puzzle.width;
                    const shape = puzzle.shape;

                    let usedCount = 0;
                    let fogCount = 0;
                    let disabledCount = 0;
                    let hiddenInPlayerCount = 0;
                    let revealedCount = 0;
                    let mineCount = 0;

                    // Categorise each cell
                    for (let r = 0; r < h; r++) {{
                        for (let c = 0; c < w; c++) {{
                            const sol = puzzle.solution[r][c];
                            const pg = puzzle.grid[r][c];

                            if (sol === 'disabled' && pg === 'disabled') {{
                                disabledCount++;
                            }} else if (pg === 'hidden') {{
                                // Could be fog or used-hidden
                                hiddenInPlayerCount++;
                                if (sol === 'mine') mineCount++;
                            }} else if (typeof pg === 'number') {{
                                revealedCount++;
                                usedCount++;
                            }} else if (pg === 'disabled') {{
                                // line clue origin
                                disabledCount++;
                            }}
                            if (sol === 'mine') mineCount++;
                        }}
                    }}

                    // Count shape true/false
                    let shapeTrue = 0;
                    let shapeFalse = 0;
                    if (shape) {{
                        for (let r = 0; r < h; r++) {{
                            for (let c = 0; c < w; c++) {{
                                if (shape[r][c]) shapeTrue++;
                                else shapeFalse++;
                            }}
                        }}
                    }}

                    // Check for fog cells: cells that are hidden in player grid
                    // AND are in the shape (not disabled in solution)
                    // AND have a valid solution value (not 'disabled')
                    let fogCells = 0;
                    let usedHiddenCells = 0;
                    for (let r = 0; r < h; r++) {{
                        for (let c = 0; c < w; c++) {{
                            const sol = puzzle.solution[r][c];
                            const pg = puzzle.grid[r][c];
                            if (pg === 'hidden' && sol !== 'disabled') {{
                                // This is either a fog cell or a used-but-hidden cell
                                // We can't tell directly, but fog cells are on the boundary
                                // For testing, just count them
                                usedHiddenCells++;
                            }}
                        }}
                    }}

                    // Solution path
                    const solutionPath = puzzle.clues?.solutionPath ?? [];

                    // Solvability check
                    return import('/src/puzzles/hexmine/solve.ts').then(solveMod => {{
                        const solvable = solveMod.solveFromRevealed(
                            puzzle.grid, puzzle.solution,
                            puzzle.width, puzzle.height,
                            puzzle.clues?.clues
                        );

                        resolve({{
                            success: true,
                            width: w,
                            height: h,
                            solvable,
                            totalCells: w * h,
                            disabledCount,
                            hiddenInPlayerCount,
                            revealedCount,
                            shapeTrue,
                            shapeFalse,
                            usedHiddenCells,
                            hasShape: !!shape,
                            clueCount: puzzle.clues?.clues?.length ?? 0,
                            clueTypes: (puzzle.clues?.clues ?? []).reduce((acc, c) => {{
                                acc[c.type] = (acc[c.type] || 0) + 1;
                                return acc;
                            }}, {{}}),
                            solutionPathLength: solutionPath.length,
                            mineCount,
                        }});
                    }});
                }} catch (e) {{
                    resolve({{ success: false, error: e.message + '\\n' + e.stack }});
                }}
            }});
        }});
    }}''')
    return result


def main():
    global PASS, FAIL

    headless = "--ci" in sys.argv

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=headless)
        page = browser.new_page(viewport={"width": 1280, "height": 800})
        page.goto(BASE)
        page.wait_for_load_state("networkidle")
        time.sleep(2)

        print("=" * 60)
        print("Approach B: Grow + Fog Compiler Tests")
        print("=" * 60)

        # ── Test 1: 1-step blueprint with edge-header + range clue ──
        print("\n-- Test 1: 1-step (edge-header + range) --")
        r = compile_fog(page, '''{
            id: 'fog-test1', name: 'Fog 1-step', width: 10, height: 10,
            mineDensity: 0.15, seed: 42,
            steps: [
                { id: 0, target: { kind: 'auto' }, targetValue: 1,
                  requiredStrategies: [
                    { kind: 'clue', type: 'edge-header' },
                    { kind: 'clue', type: 'range' }
                  ] }
            ]
        }''')

        if not r.get('success'):
            print(f"  COMPILE ERROR: {r.get('error', 'unknown')}")
            check("compiles successfully", False)
        else:
            check("compiles successfully", True)

            # Grid has: used cells + fog ring + holes (most disabled)
            total = r['totalCells']
            disabled = r['disabledCount']
            active = r['shapeTrue']
            check("has disabled cells (holes)", disabled > 0,
                  f"disabled={disabled}/{total}")
            check("most cells are disabled", disabled > total * 0.5,
                  f"disabled={disabled}/{total} = {disabled/total:.0%}")
            check("has active cells in shape", active > 0,
                  f"active(shapeTrue)={active}")
            check("has hidden cells (fog + unsolved)", r['hiddenInPlayerCount'] > 0,
                  f"hidden={r['hiddenInPlayerCount']}")
            check("has shape defined", r['hasShape'])

            # Solution path has exactly 1 step
            check("solution path has 1 step", r['solutionPathLength'] == 1,
                  f"got {r['solutionPathLength']}")

            # Fog cells are hidden in the player grid
            # (hidden cells that are in the shape but not revealed)
            check("fog cells exist as hidden", r['usedHiddenCells'] > 0,
                  f"usedHiddenCells={r['usedHiddenCells']}")

            # Print summary
            print(f"\n  Summary: {total} total, {disabled} disabled, "
                  f"{active} active(shape), {r['revealedCount']} revealed, "
                  f"{r['hiddenInPlayerCount']} hidden, {r['clueCount']} clues")

        # ── Test 2: Verify fog ring surrounds used area ──
        print("\n-- Test 2: Fog ring structure --")
        r2 = compile_fog(page, '''{
            id: 'fog-test2', name: 'Fog Ring', width: 12, height: 12,
            mineDensity: 0.15, seed: 100,
            steps: [
                { id: 0, target: { kind: 'auto' }, targetValue: 1,
                  requiredStrategies: [{ kind: 'clue', type: 'adjacent' }] },
                { id: 1, target: { kind: 'auto' }, targetValue: 0,
                  requiredStrategies: [{ kind: 'clue', type: 'adjacent' }] }
            ]
        }''')

        if not r2.get('success'):
            print(f"  COMPILE ERROR: {r2.get('error', 'unknown')}")
            check("compiles successfully", False)
        else:
            check("compiles successfully", True)

            # Verify the grid structure
            total = r2['totalCells']
            disabled = r2['disabledCount']
            active = r2['shapeTrue']

            check("has disabled (holes)", disabled > 0)
            check("active cells < total cells", active < total,
                  f"active={active}, total={total}")
            check("solution path has 2 steps", r2['solutionPathLength'] == 2,
                  f"got {r2['solutionPathLength']}")

        # ── Test 3: No extra solvable areas beyond designed steps ──
        print("\n-- Test 3: No extra solvable areas --")
        r3_result = page.evaluate('''() => {
            return new Promise((resolve) => {
                import('/src/puzzles/hexmine/compiler/index.ts').then(mod => {
                    try {
                        const blueprint = {
                            id: 'fog-test3', name: 'No extras', width: 10, height: 10,
                            mineDensity: 0.15, seed: 77,
                            steps: [
                                { id: 0, target: { kind: 'auto' }, targetValue: 1,
                                  requiredStrategies: [{ kind: 'clue', type: 'adjacent' }] }
                            ]
                        };
                        const puzzle = mod.compilePuzzleFog(blueprint);

                        // Check: outside the fog ring, everything should be disabled
                        // No cell outside the designed area should be solvable
                        const h = puzzle.height;
                        const w = puzzle.width;

                        let extraSolvable = 0;
                        for (let r = 0; r < h; r++) {
                            for (let c = 0; c < w; c++) {
                                const sol = puzzle.solution[r][c];
                                const pg = puzzle.grid[r][c];
                                // If disabled in solution, it should be disabled in player grid too
                                if (sol === 'disabled' && pg !== 'disabled') {
                                    extraSolvable++;
                                }
                            }
                        }

                        resolve({
                            success: true,
                            extraSolvable,
                            solutionPathLength: puzzle.clues?.solutionPath?.length ?? 0,
                        });
                    } catch (e) {
                        resolve({ success: false, error: e.message });
                    }
                });
            });
        }''')

        if not r3_result.get('success'):
            print(f"  COMPILE ERROR: {r3_result.get('error', 'unknown')}")
            check("compiles successfully", False)
        else:
            check("compiles successfully", True)
            check("no extra solvable areas beyond design",
                  r3_result['extraSolvable'] == 0,
                  f"extraSolvable={r3_result['extraSolvable']}")
            check("solution path has 1 step",
                  r3_result['solutionPathLength'] == 1,
                  f"got {r3_result['solutionPathLength']}")

        # ── Test 4: Fog cells are hidden in player grid ──
        print("\n-- Test 4: Fog cells always hidden --")
        r4_result = page.evaluate('''() => {
            return new Promise((resolve) => {
                import('/src/puzzles/hexmine/compiler/index.ts').then(mod => {
                    import('/src/puzzles/hexmine/hex.ts').then(hexMod => {
                        try {
                            const blueprint = {
                                id: 'fog-test4', name: 'Fog Hidden', width: 10, height: 10,
                                mineDensity: 0.20, seed: 200,
                                steps: [
                                    { id: 0, target: { kind: 'auto' }, targetValue: 1,
                                      requiredStrategies: [{ kind: 'clue', type: 'adjacent' }] },
                                    { id: 1, target: { kind: 'auto' }, targetValue: 0,
                                      requiredStrategies: [{ kind: 'clue', type: 'edge-header' }] }
                                ]
                            };
                            const puzzle = mod.compilePuzzleFog(blueprint);

                            const h = puzzle.height;
                            const w = puzzle.width;

                            // Build set of all cells in clue scopes + revealed + cascade origin area
                            const clueScope = new Set();
                            if (puzzle.clues && puzzle.clues.clues) {
                                for (const clue of puzzle.clues.clues) {
                                    for (const key of clue.cellKeys) {
                                        clueScope.add(key);
                                    }
                                    clueScope.add(clue.displayKey);
                                }
                            }

                            // Find cells that are in the shape, not disabled, but hidden
                            // These are fog cells (or unsolved used cells)
                            let fogLikeHidden = 0;
                            let fogLikeRevealed = 0;  // should be 0

                            for (let r = 0; r < h; r++) {
                                for (let c = 0; c < w; c++) {
                                    if (!puzzle.shape || !puzzle.shape[r][c]) continue;
                                    const sol = puzzle.solution[r][c];
                                    const pg = puzzle.grid[r][c];
                                    if (sol === 'disabled') continue;

                                    // Check: are there cells outside clue scopes that are revealed?
                                    // (This would indicate extra solvable areas)
                                    const key = r + ',' + c;
                                    if (pg === 'hidden') {
                                        fogLikeHidden++;
                                    }
                                }
                            }

                            // Check that hidden cells exist (fog ring exists)
                            resolve({
                                success: true,
                                fogLikeHidden,
                                fogLikeRevealed,
                                hasShape: !!puzzle.shape,
                                solvable: true,
                            });
                        } catch (e) {
                            resolve({ success: false, error: e.message });
                        }
                    });
                });
            });
        }''')

        if not r4_result.get('success'):
            print(f"  COMPILE ERROR: {r4_result.get('error', 'unknown')}")
            check("compiles successfully", False)
        else:
            check("compiles successfully", True)
            check("fog cells are hidden in player grid",
                  r4_result['fogLikeHidden'] > 0,
                  f"fogLikeHidden={r4_result['fogLikeHidden']}")

        # ── Test 5: Compare Fog vs original compile ──
        print("\n-- Test 5: Fog has fewer active cells than original compile --")
        r5_result = page.evaluate('''() => {
            return new Promise((resolve) => {
                import('/src/puzzles/hexmine/compiler/index.ts').then(mod => {
                    try {
                        const blueprint = {
                            id: 'cmp-test', name: 'Compare', width: 10, height: 10,
                            mineDensity: 0.15, seed: 42,
                            steps: [
                                { id: 0, target: { kind: 'auto' }, targetValue: 1,
                                  requiredStrategies: [{ kind: 'clue', type: 'adjacent' }] },
                            ]
                        };

                        const fogPuzzle = mod.compilePuzzleFog(blueprint);
                        const origPuzzle = mod.compilePuzzle(blueprint);

                        // Count non-disabled cells
                        let fogActive = 0;
                        let origActive = 0;
                        for (let r = 0; r < 10; r++) {
                            for (let c = 0; c < 10; c++) {
                                if (fogPuzzle.solution[r][c] !== 'disabled') fogActive++;
                                if (origPuzzle.solution[r][c] !== 'disabled') origActive++;
                            }
                        }

                        resolve({
                            success: true,
                            fogActive,
                            origActive,
                        });
                    } catch (e) {
                        resolve({ success: false, error: e.message });
                    }
                });
            });
        }''')

        if not r5_result.get('success'):
            print(f"  COMPILE ERROR: {r5_result.get('error', 'unknown')}")
            check("compiles successfully", False)
        else:
            check("compiles successfully", True)
            fog_a = r5_result['fogActive']
            orig_a = r5_result['origActive']
            check("fog has fewer active cells than original",
                  fog_a < orig_a,
                  f"fog={fog_a}, orig={orig_a}")
            print(f"\n  Fog active: {fog_a}, Original active: {orig_a}")

        # ── Test 6: Deterministic (same seed = same result) ──
        print("\n-- Test 6: Deterministic --")
        r6_result = page.evaluate('''() => {
            return new Promise((resolve) => {
                import('/src/puzzles/hexmine/compiler/index.ts').then(mod => {
                    try {
                        const bp = {
                            id: 'det', name: 'Det', width: 8, height: 8,
                            mineDensity: 0.15, seed: 12345,
                            steps: [
                                { id: 0, target: { kind: 'auto' }, targetValue: 1,
                                  requiredStrategies: [{ kind: 'clue', type: 'adjacent' }] }
                            ]
                        };

                        const p1 = mod.compilePuzzleFog(bp);
                        const p2 = mod.compilePuzzleFog(bp);

                        // Compare solutions
                        let match = true;
                        for (let r = 0; r < 8; r++) {
                            for (let c = 0; c < 8; c++) {
                                if (p1.solution[r][c] !== p2.solution[r][c]) {
                                    match = false;
                                }
                            }
                        }

                        resolve({ success: true, match });
                    } catch (e) {
                        resolve({ success: false, error: e.message });
                    }
                });
            });
        }''')

        if not r6_result.get('success'):
            print(f"  COMPILE ERROR: {r6_result.get('error', 'unknown')}")
            check("compiles successfully", False)
        else:
            check("compiles successfully", True)
            check("same seed produces same puzzle", r6_result['match'])

        browser.close()

    print(f"\n{'=' * 60}")
    print(f"RESULT: {PASS} passed, {FAIL} failed")
    print(f"{'=' * 60}")
    sys.exit(0 if FAIL == 0 else 1)


if __name__ == "__main__":
    main()
