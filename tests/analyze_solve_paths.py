"""Analyze solving paths across difficulties using the recorder."""
from playwright.sync_api import sync_playwright
import json, time, sys

BASE = "http://localhost:5180"
GAME_KEY = "grid-puzzles:game"
TRIALS = 25

def get_state(page):
    raw = page.evaluate(f'localStorage.getItem("{GAME_KEY}")')
    return json.loads(raw) if raw else {}

def start_hexmine(page, difficulty):
    page.click('button:has-text("New Game")')
    time.sleep(0.3)
    diff_btn = page.locator(f'button:has-text("{difficulty}")')
    if diff_btn.count() > 0:
        diff_btn.first.click()
        time.sleep(0.2)
    page.locator('button:has-text("Hex Minesweeper")').click()
    time.sleep(1.5)

def analyze_via_recorder(page):
    """Call solveWithRecording via browser JS and return the result."""
    result = page.evaluate('''() => {
        // Access the recorder through the module system
        // This works because Vite exposes modules in dev
        return new Promise((resolve) => {
            import('/src/puzzles/hexmine/solver/recorder.ts').then(mod => {
                const state = JSON.parse(localStorage.getItem("grid-puzzles:game") || "{}");
                const grid = state.grid;
                const solution = state.solution;
                const clueData = state.clues;
                const clues = clueData ? clueData.clues : undefined;
                const result = mod.solveWithRecording(grid, solution, state.width, state.height, clues);
                resolve({
                    solvable: result.solvable,
                    totalSteps: result.records.length,
                    totalRounds: result.totalRounds,
                    cellsRemaining: result.cellsRemaining,
                    techniques: result.records.reduce((acc, r) => {
                        acc[r.technique] = (acc[r.technique] || 0) + 1;
                        return acc;
                    }, {}),
                });
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
        time.sleep(1)
        page.evaluate("localStorage.clear()")
        page.reload()
        page.wait_for_load_state("networkidle")
        time.sleep(0.5)

        # Need initial game
        page.locator('button:has-text("Start a Puzzle")').click()
        time.sleep(0.3)
        page.locator('button:has-text("Hex Minesweeper")').click()
        time.sleep(1)

        for diff in ['Easy', 'Medium', 'Hard', 'Expert']:
            stats = {
                'solvable': 0,
                'total_steps': [],
                'total_rounds': [],
                'cells_remaining': [],
                'propagation': [],
                'backtrack': [],
            }

            for trial in range(TRIALS):
                start_hexmine(page, diff)
                try:
                    result = analyze_via_recorder(page)
                    if result['solvable']:
                        stats['solvable'] += 1
                    stats['total_steps'].append(result['totalSteps'])
                    stats['total_rounds'].append(result['totalRounds'])
                    stats['cells_remaining'].append(result['cellsRemaining'])
                    techs = result.get('techniques', {})
                    stats['propagation'].append(techs.get('propagation', 0))
                    stats['backtrack'].append(techs.get('backtrack-probe', 0))
                except Exception as e:
                    print(f"  Trial {trial} failed: {e}")

            avg = lambda lst: sum(lst) / len(lst) if lst else 0
            print(f"\n{'='*50}")
            print(f"{diff} ({TRIALS} trials)")
            print(f"  Solvable: {stats['solvable']}/{TRIALS}")
            print(f"  Avg steps: {avg(stats['total_steps']):.1f}")
            print(f"  Avg rounds: {avg(stats['total_rounds']):.1f}")
            print(f"  Avg remaining: {avg(stats['cells_remaining']):.1f}")
            print(f"  Avg propagation deductions: {avg(stats['propagation']):.1f}")
            print(f"  Avg backtrack deductions: {avg(stats['backtrack']):.1f}")
            prop_pct = avg(stats['propagation']) / max(avg(stats['total_steps']), 1) * 100
            print(f"  Propagation %: {prop_pct:.0f}%")

        browser.close()

if __name__ == "__main__":
    main()
