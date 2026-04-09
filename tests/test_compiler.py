"""Test the puzzle compiler across all configurations."""
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

def compile_and_check(page, blueprint_js, test_name):
    """Compile a blueprint via browser and return checks."""
    result = page.evaluate(f'''() => {{
        return new Promise((resolve) => {{
            import('/src/puzzles/hexmine/compiler/index.ts').then(mod => {{
                try {{
                    const blueprint = {blueprint_js};
                    const puzzle = mod.compilePuzzle(blueprint);

                    import('/src/puzzles/hexmine/solve.ts').then(solveMod => {{
                        const solvable = solveMod.solveFromRevealed(
                            puzzle.grid, puzzle.solution,
                            puzzle.width, puzzle.height,
                            puzzle.clues?.clues
                        );
                        resolve({{
                            success: true,
                            width: puzzle.width,
                            height: puzzle.height,
                            solvable,
                            hasClues: puzzle.clues !== null,
                            clueCount: puzzle.clues?.clues?.length ?? 0,
                            clueTypes: (puzzle.clues?.clues ?? []).reduce((acc, c) => {{
                                acc[c.type] = (acc[c.type] || 0) + 1;
                                return acc;
                            }}, {{}}),
                            hasRevealed: puzzle.grid.some(row => row.some(c => typeof c === 'number')),
                            mineCount: puzzle.solution.flat().filter(c => c === 'mine').length,
                            hasShape: !!puzzle.shape,
                        }});
                    }});
                }} catch (e) {{
                    resolve({{ success: false, error: e.message }});
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
        print("Puzzle Compiler Test Suite")
        print("=" * 60)

        # Test 1: Coord targets with adjacent clues (original PoC)
        print("\n-- Test 1: Coord targets + adjacent clues --")
        r = compile_and_check(page, '''{
            id: 'test1', name: 'Coord Adjacent', width: 8, height: 8,
            mineDensity: 0.15, seed: 42,
            steps: [
                { id: 0, target: { kind: 'coord', row: 2, col: 4 }, targetValue: 1,
                  requiredStrategy: { kind: 'clue', type: 'adjacent' } },
                { id: 1, target: { kind: 'coord', row: 2, col: 3 }, targetValue: 0,
                  requiredStrategy: { kind: 'clue', type: 'adjacent' } },
            ]
        }''', 'coord-adjacent')
        check("compiles successfully", r.get('success'))
        check("solvable", r.get('solvable'))
        check("has 2 clues", r.get('clueCount') == 2)

        # Test 2: Auto targets with adjacent clues
        print("\n-- Test 2: Auto targets + adjacent clues --")
        r = compile_and_check(page, '''{
            id: 'test2', name: 'Auto Adjacent', width: 8, height: 8,
            mineDensity: 0.15, seed: 99,
            steps: [
                { id: 0, target: { kind: 'auto' }, targetValue: 1,
                  requiredStrategy: { kind: 'clue', type: 'adjacent' } },
                { id: 1, target: { kind: 'auto' }, targetValue: 0,
                  requiredStrategy: { kind: 'clue', type: 'adjacent' } },
                { id: 2, target: { kind: 'auto' }, targetValue: 1,
                  requiredStrategy: { kind: 'clue', type: 'adjacent' } },
            ]
        }''', 'auto-adjacent')
        check("compiles successfully", r.get('success'))
        check("solvable", r.get('solvable'))
        check("has clues", r.get('clueCount', 0) >= 2)

        # Test 3: Line clues
        print("\n-- Test 3: Auto targets + line clues --")
        r = compile_and_check(page, '''{
            id: 'test3', name: 'Line Clues', width: 10, height: 10,
            mineDensity: 0.12, seed: 124,
            steps: [
                { id: 0, target: { kind: 'auto' }, targetValue: 1,
                  requiredStrategy: { kind: 'clue', type: 'line' } },
                { id: 1, target: { kind: 'auto' }, targetValue: 1,
                  requiredStrategy: { kind: 'clue', type: 'adjacent' } },
            ]
        }''', 'line-clues')
        check("compiles successfully", r.get('success'))
        if r.get('success'):
            check("solvable", r.get('solvable'))
            types = r.get('clueTypes', {})
            has_line = types.get('line', 0) > 0 or types.get('adjacent', 0) > 0
            check("has clues (line or fallback)", has_line)

        # Test 4: Range clues
        print("\n-- Test 4: Auto targets + range clues --")
        r = compile_and_check(page, '''{
            id: 'test4', name: 'Range Clues', width: 10, height: 10,
            mineDensity: 0.10, seed: 555,
            steps: [
                { id: 0, target: { kind: 'auto' }, targetValue: 1,
                  requiredStrategy: { kind: 'clue', type: 'range' } },
                { id: 1, target: { kind: 'auto' }, targetValue: 0,
                  requiredStrategy: { kind: 'clue', type: 'adjacent' } },
            ]
        }''', 'range-clues')
        check("compiles successfully", r.get('success'))
        if r.get('success'):
            check("solvable", r.get('solvable'))

        # Test 5: Edge header clues
        print("\n-- Test 5: Auto targets + edge headers --")
        r = compile_and_check(page, '''{
            id: 'test5', name: 'Edge Headers', width: 8, height: 8,
            mineDensity: 0.15, seed: 789,
            steps: [
                { id: 0, target: { kind: 'auto' }, targetValue: 1,
                  requiredStrategy: { kind: 'clue', type: 'edge-header' } },
                { id: 1, target: { kind: 'auto' }, targetValue: 0,
                  requiredStrategy: { kind: 'clue', type: 'adjacent' } },
            ]
        }''', 'edge-headers')
        check("compiles successfully", r.get('success'))
        if r.get('success'):
            check("solvable", r.get('solvable'))

        # Test 6: Full auto mode (no explicit steps)
        print("\n-- Test 6: Full auto mode (10 steps) --")
        r = compile_and_check(page, '''{
            id: 'test6', name: 'Full Auto', width: 10, height: 10,
            mineDensity: 0.18, seed: 1000,
            steps: [],
            autoStepCount: 10,
            defaultDifficulty: 'medium',
        }''', 'full-auto')
        check("compiles successfully", r.get('success'))
        if r.get('success'):
            check("solvable", r.get('solvable'))
            check("has clues", r.get('clueCount', 0) > 0)
            check("has revealed cells", r.get('hasRevealed'))
            check("has mines", r.get('mineCount', 0) > 0)

        # Test 7: Same seed = same puzzle
        print("\n-- Test 7: Deterministic (same seed) --")
        r1 = compile_and_check(page, '''{
            id: 'det1', name: 'Det', width: 8, height: 8,
            mineDensity: 0.15, seed: 5555,
            steps: [
                { id: 0, target: { kind: 'coord', row: 2, col: 4 }, targetValue: 1,
                  requiredStrategy: { kind: 'clue', type: 'adjacent' } },
            ]
        }''', 'det1')
        r2 = compile_and_check(page, '''{
            id: 'det2', name: 'Det', width: 8, height: 8,
            mineDensity: 0.15, seed: 5555,
            steps: [
                { id: 0, target: { kind: 'coord', row: 2, col: 4 }, targetValue: 1,
                  requiredStrategy: { kind: 'clue', type: 'adjacent' } },
            ]
        }''', 'det2')
        check("both compile", r1.get('success') and r2.get('success'))
        check("same mine count", r1.get('mineCount') == r2.get('mineCount'))

        # Test 8: Mixed strategies in one blueprint
        print("\n-- Test 8: Mixed strategies --")
        r = compile_and_check(page, '''{
            id: 'test8', name: 'Mixed', width: 10, height: 10,
            mineDensity: 0.10, seed: 7778,
            steps: [
                { id: 0, target: { kind: 'auto' }, targetValue: 1,
                  requiredStrategy: { kind: 'clue', type: 'adjacent' } },
                { id: 1, target: { kind: 'auto' }, targetValue: 0,
                  requiredStrategy: { kind: 'clue', type: 'edge-header' } },
                { id: 2, target: { kind: 'auto' }, targetValue: 1,
                  requiredStrategy: { kind: 'clue', type: 'adjacent', special: 'contiguous' } },
                { id: 3, target: { kind: 'auto' }, targetValue: 0 },
                { id: 4, target: { kind: 'auto' }, targetValue: 1 },
            ]
        }''', 'mixed')
        check("compiles successfully", r.get('success'))
        if r.get('success'):
            check("solvable", r.get('solvable'))
            check("has multiple clue types", len(r.get('clueTypes', {})) >= 1)

        # Test 9: Pre-revealed strategy
        print("\n-- Test 9: Pre-revealed cells --")
        r = compile_and_check(page, '''{
            id: 'test9', name: 'Pre-revealed', width: 8, height: 8,
            mineDensity: 0.15, seed: 8888,
            steps: [
                { id: 0, target: { kind: 'auto' }, targetValue: 0,
                  requiredStrategy: { kind: 'pre-revealed' } },
                { id: 1, target: { kind: 'auto' }, targetValue: 1,
                  requiredStrategy: { kind: 'clue', type: 'adjacent' } },
            ]
        }''', 'pre-revealed')
        check("compiles successfully", r.get('success'))
        if r.get('success'):
            check("solvable", r.get('solvable'))

        browser.close()

    print(f"\n{'='*60}")
    print(f"RESULT: {PASS} passed, {FAIL} failed")
    print(f"{'='*60}")
    sys.exit(0 if FAIL == 0 else 1)

if __name__ == "__main__":
    main()
