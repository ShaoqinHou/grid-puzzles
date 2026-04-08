"""Mass-validate hexmine clue correctness across all difficulties."""
from playwright.sync_api import sync_playwright
import json, time, sys

BASE = "http://localhost:5180"
GAME_KEY = "grid-puzzles:game"

def get_state(page):
    raw = page.evaluate(f'localStorage.getItem("{GAME_KEY}")')
    return json.loads(raw) if raw else {}

def start_hexmine(page, difficulty):
    page.click('button:has-text("New Game")')
    time.sleep(0.3)
    # Difficulty buttons have text like "Easy (5×5)" - use case-insensitive match
    diff_btn = page.locator(f'button:has-text("{difficulty}")')
    if diff_btn.count() > 0:
        diff_btn.first.click()
        time.sleep(0.2)
    page.locator('button:has-text("Hex Minesweeper")').click()
    time.sleep(0.8)

def validate_clues(state):
    """Validate all clues against the solution. Returns (errors, stats)."""
    clue_data = state.get('clues')
    clues = clue_data.get('clues', []) if isinstance(clue_data, dict) else clue_data
    solution = state.get('solution', [])
    errors = []
    stats = {'adjacent': 0, 'line': 0, 'range': 0, 'contiguous': 0, 'nonContiguous': 0, 'none': 0}

    if not clues:
        return errors, stats

    for clue in clues:
        ctype = clue.get('type', '')
        special = clue.get('special', 'none')
        cell_keys = clue.get('cellKeys', [])
        expected_mines = clue.get('mineCount', -1)
        display_key = clue.get('displayKey', '')

        stats[ctype] = stats.get(ctype, 0) + 1
        stats[special] = stats.get(special, 0) + 1

        # Count actual mines in scope
        actual_mines = 0
        mine_positions = []
        for i, key in enumerate(cell_keys):
            parts = key.split(',')
            r, c = int(parts[0]), int(parts[1])
            if solution[r][c] == 'mine':
                actual_mines += 1
                mine_positions.append(i)

        if actual_mines != expected_mines:
            errors.append(f"Clue {clue['id']}: expected {expected_mines} mines, got {actual_mines}")

        # Validate special conditions
        if special == 'contiguous' and len(mine_positions) >= 2:
            if ctype == 'adjacent':
                ring = [1 if i in mine_positions else 0 for i in range(len(cell_keys))]
                n = len(ring)
                first_false = next((i for i in range(n) if ring[i] == 0), -1)
                if first_false >= 0:
                    groups = 0
                    in_group = False
                    for j in range(n):
                        idx = (first_false + j) % n
                        if ring[idx] == 1 and not in_group:
                            groups += 1
                            in_group = True
                        if ring[idx] == 0:
                            in_group = False
                    if groups > 1:
                        errors.append(f"Clue {clue['id']}: marked contiguous but mines in {groups} groups (circular)")
            else:
                vals = [1 if i in mine_positions else 0 for i in range(len(cell_keys))]
                in_group = False
                groups = 0
                for v in vals:
                    if v == 1 and not in_group:
                        groups += 1
                        in_group = True
                    if v == 0:
                        in_group = False
                if groups > 1:
                    errors.append(f"Clue {clue['id']}: marked contiguous but mines in {groups} groups (linear)")

        elif special == 'nonContiguous' and len(mine_positions) >= 2:
            if ctype == 'adjacent':
                ring = [1 if i in mine_positions else 0 for i in range(len(cell_keys))]
                n = len(ring)
                first_false = next((i for i in range(n) if ring[i] == 0), -1)
                if first_false >= 0:
                    groups = 0
                    in_group = False
                    for j in range(n):
                        idx = (first_false + j) % n
                        if ring[idx] == 1 and not in_group:
                            groups += 1
                            in_group = True
                        if ring[idx] == 0:
                            in_group = False
                    if groups <= 1:
                        errors.append(f"Clue {clue['id']}: marked nonContiguous but mines ARE contiguous (circular)")
            else:
                vals = [1 if i in mine_positions else 0 for i in range(len(cell_keys))]
                in_group = False
                groups = 0
                for v in vals:
                    if v == 1 and not in_group:
                        groups += 1
                        in_group = True
                    if v == 0:
                        in_group = False
                if groups <= 1:
                    errors.append(f"Clue {clue['id']}: marked nonContiguous but mines ARE contiguous (linear)")

        # Line clue origin must be disabled
        if ctype == 'line':
            parts = display_key.split(',')
            dr, dc = int(parts[0]), int(parts[1])
            if solution[dr][dc] != 'disabled':
                errors.append(f"Clue {clue['id']}: line origin not disabled")

        # Range clues must have special=none
        if ctype == 'range' and special != 'none':
            errors.append(f"Clue {clue['id']}: range has special={special}")

    return errors, stats

def main():
    TRIALS = 30
    total_errors = []

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1280, "height": 800})
        page.goto(BASE)
        page.wait_for_load_state("networkidle")
        time.sleep(1)

        # Clear state and start fresh
        page.evaluate("localStorage.clear()")
        page.reload()
        page.wait_for_load_state("networkidle")
        time.sleep(0.5)

        # First game needs "Start a Puzzle" click
        btn = page.locator('button:has-text("Start a Puzzle")')
        if btn.count() > 0:
            btn.click()
            time.sleep(0.3)
            page.locator('button:has-text("Hex Minesweeper")').click()
            time.sleep(0.8)

        for diff in ['Easy', 'Medium', 'Hard', 'Expert']:
            diff_errors = 0
            diff_stats = {'adjacent': 0, 'line': 0, 'range': 0, 'contiguous': 0, 'nonContiguous': 0, 'none': 0}
            diff_clue_total = 0

            for trial in range(TRIALS):
                start_hexmine(page, diff)
                state = get_state(page)
                errors, stats = validate_clues(state)

                for k in diff_stats:
                    diff_stats[k] += stats.get(k, 0)
                diff_clue_total += sum(stats.get(t, 0) for t in ['adjacent', 'line', 'range'])

                if errors:
                    diff_errors += len(errors)
                    total_errors.extend(errors)

            print(f"\n{'='*50}")
            print(f"{diff} ({TRIALS} trials)")
            print(f"  Clues total: {diff_clue_total}")
            print(f"  Adjacent: {diff_stats['adjacent']}, Line: {diff_stats['line']}, Range: {diff_stats['range']}")
            print(f"  Contiguous: {diff_stats['contiguous']}, NonContiguous: {diff_stats['nonContiguous']}, None: {diff_stats['none']}")
            print(f"  Errors: {diff_errors}")

        browser.close()

    print(f"\n{'='*50}")
    print(f"TOTAL ERRORS: {len(total_errors)}")
    if total_errors:
        for e in total_errors[:20]:
            print(f"  x {e}")
    else:
        print("  All clues validated correctly!")

    sys.exit(0 if len(total_errors) == 0 else 1)

if __name__ == "__main__":
    main()
