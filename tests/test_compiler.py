"""Test the puzzle compiler PoC."""
from playwright.sync_api import sync_playwright
import json, time, sys

BASE = "http://localhost:5180"
GAME_KEY = "grid-puzzles:game"

def test_compiler(page):
    """Compile a 3-step blueprint and verify the result."""
    result = page.evaluate('''() => {
        return new Promise((resolve, reject) => {
            import('/src/puzzles/hexmine/compiler/index.ts').then(mod => {
                try {
                    // Targets must be adjacent to the cascade zone (center 4,4 + neighbors)
                    // Cascade zone: (4,4), (3,4), (3,3), (4,3), (4,5), (5,4), (5,3)
                    // Pick targets just outside this zone
                    const blueprint = {
                        id: 'test-3step',
                        name: 'Test 3-Step',
                        width: 8,
                        height: 8,
                        mineDensity: 0.15,
                        seed: 42,
                        steps: [
                            {
                                id: 0,
                                label: 'First mine',
                                target: { row: 2, col: 4 },
                                targetValue: 1,
                                requiredStrategy: { kind: 'clue', type: 'adjacent' },
                            },
                            {
                                id: 1,
                                label: 'Safe cell',
                                target: { row: 2, col: 3 },
                                targetValue: 0,
                                requiredStrategy: { kind: 'clue', type: 'adjacent' },
                            },
                            {
                                id: 2,
                                label: 'Second mine',
                                target: { row: 5, col: 5 },
                                targetValue: 1,
                                requiredStrategy: { kind: 'clue', type: 'adjacent' },
                            },
                        ],
                    };

                    const puzzle = mod.compilePuzzle(blueprint);

                    // Check basic properties
                    const checks = {
                        hasGrid: Array.isArray(puzzle.grid) && puzzle.grid.length === 8,
                        hasSolution: Array.isArray(puzzle.solution) && puzzle.solution.length === 8,
                        gridWidth: puzzle.grid[0]?.length === 8,
                        solutionWidth: puzzle.solution[0]?.length === 8,
                        emptyCell: puzzle.emptyCell === 'hidden',
                        width: puzzle.width === 8,
                        height: puzzle.height === 8,
                        // Check target values in solution
                        target0IsMine: puzzle.solution[2][4] === 'mine',
                        target1IsSafe: typeof puzzle.solution[2][3] === 'number',
                        target2IsMine: puzzle.solution[5][5] === 'mine',
                        // Check has clues
                        hasClues: puzzle.clues !== null,
                        clueCount: puzzle.clues?.clues?.length ?? 0,
                        // Check has pre-revealed cells
                        hasRevealed: puzzle.grid.some(row => row.some(c => typeof c === 'number')),
                        // Check solvability
                        hasMines: puzzle.solution.some(row => row.some(c => c === 'mine')),
                    };

                    // Also try to solve it
                    import('/src/puzzles/hexmine/solve.ts').then(solveMod => {
                        const solvable = solveMod.solveFromRevealed(
                            puzzle.grid, puzzle.solution,
                            puzzle.width, puzzle.height,
                            puzzle.clues?.clues
                        );
                        checks.solvable = solvable;
                        resolve(checks);
                    });
                } catch (e) {
                    resolve({ error: e.message, stack: e.stack?.substring(0, 500) });
                }
            });
        });
    }''')
    return result

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1280, "height": 800})
        page.goto(BASE)
        page.wait_for_load_state("networkidle")
        time.sleep(2)

        print("Testing Puzzle Compiler PoC...")
        result = test_compiler(page)

        if 'error' in result:
            print(f"  COMPILATION ERROR: {result['error']}")
            if 'stack' in result:
                print(f"  Stack: {result['stack']}")
            browser.close()
            sys.exit(1)

        all_pass = True
        for key, value in result.items():
            status = 'PASS' if value else 'FAIL'
            if not value:
                all_pass = False
            print(f"  {status}: {key} = {value}")

        browser.close()

        if all_pass:
            print("\nAll compiler checks PASSED!")
        else:
            print("\nSome checks FAILED!")
        sys.exit(0 if all_pass else 1)

if __name__ == "__main__":
    main()
