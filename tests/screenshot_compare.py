"""Screenshot all 3 compiler approaches for visual comparison."""
from playwright.sync_api import sync_playwright
import json, time

BASE = "http://localhost:5180"

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1400, "height": 900}, color_scheme="dark")

        for name, fn in [("original", "compilePuzzle"), ("grow", "compilePuzzleGrow"), ("fog", "compilePuzzleFog")]:
            page.goto(BASE)
            page.wait_for_load_state("networkidle")
            time.sleep(1)
            page.evaluate("localStorage.clear()")
            page.reload()
            page.wait_for_load_state("networkidle")
            time.sleep(0.5)

            ok = page.evaluate("""([fn]) => {
                return new Promise(resolve => {
                    import('/src/puzzles/hexmine/compiler/index.ts').then(mod => {
                        try {
                            const bp = {
                                id: 'compare', name: 'Compare', width: 10, height: 10,
                                mineDensity: 0.15, seed: 42,
                                steps: [{
                                    id: 0,
                                    target: { kind: 'auto' },
                                    targetValue: 1,
                                    requiredStrategies: [
                                        { kind: 'clue', type: 'edge-header' },
                                        { kind: 'clue', type: 'range' },
                                    ],
                                }],
                            };
                            const puzzle = mod[fn](bp);
                            const state = {
                                id: 'compare',
                                puzzleType: 'hexmine',
                                difficulty: 'medium',
                                width: puzzle.width,
                                height: puzzle.height,
                                grid: puzzle.grid,
                                solution: puzzle.solution,
                                clues: puzzle.clues,
                                emptyCell: 'hidden',
                                shape: puzzle.shape || null,
                                undoStack: [],
                                redoStack: [],
                                paused: false,
                                checkMode: false,
                                elapsedMs: 0,
                                solved: false,
                                hintCell: null,
                            };
                            localStorage.setItem('grid-puzzles:game', JSON.stringify(state));
                            resolve(true);
                        } catch(e) {
                            resolve(e.message);
                        }
                    });
                });
            }""", [fn])

            if ok is not True:
                print(f"{name}: FAILED — {ok}")
                continue

            page.reload()
            page.wait_for_load_state("networkidle")
            time.sleep(1)
            page.screenshot(path=f"tests/approach-{name}.png")
            print(f"{name}: screenshot saved")

        browser.close()

if __name__ == "__main__":
    main()
