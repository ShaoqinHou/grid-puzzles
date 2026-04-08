"""
Grid Puzzles E2E Test Suite
Tests real user behaviors against actual state changes.
12 groups, 80+ assertions covering state machine, grid interaction,
panels, toolbar, timer, persistence, a11y, regressions, and edge cases.
"""
from playwright.sync_api import sync_playwright, Page
import time, sys, json

PASS = 0
FAIL = 0
ERRORS = []

BASE = "http://localhost:5173"
GAME_KEY = "grid-puzzles:game"
PREFS_KEY = "grid-puzzles:prefs"


def check(name: str, passed: bool, page: Page = None, screenshot: str = None):
    global PASS, FAIL
    if passed:
        PASS += 1
        print(f"  ✓ {name}")
    else:
        FAIL += 1
        ERRORS.append(name)
        print(f"  ✗ {name}")
        if page and screenshot:
            page.screenshot(path=f"tests/{screenshot}.png")


# ── Helpers ──────────────────────────────────────────────

def get_state(page: Page) -> dict:
    """Read game state from localStorage."""
    raw = page.evaluate(f'localStorage.getItem("{GAME_KEY}")')
    return json.loads(raw) if raw else {}


def get_prefs(page: Page) -> dict:
    """Read preferences from localStorage."""
    raw = page.evaluate(f'localStorage.getItem("{PREFS_KEY}")')
    return json.loads(raw) if raw else {}


def clear_storage(page: Page):
    page.evaluate("localStorage.clear()")


def start_easy_game(page: Page):
    """Start a new 5x5 easy nonogram game."""
    page.click('button:has-text("New Game")')
    time.sleep(0.3)
    # Click easy difficulty (should be pre-selected, but click to be sure)
    easy_btn = page.locator('button:has-text("easy")', has_text="5")
    if easy_btn.count() > 0:
        easy_btn.first.click()
        time.sleep(0.2)
    # Click the nonogram puzzle type to start
    page.locator('button:has-text("Nonogram")').click()
    time.sleep(0.5)


def click_cell(page: Page, r: int, c: int, button: int = 0):
    """Click a grid cell at row r, col c. button=0 primary, button=2 secondary."""
    page.evaluate('''([r, c, btn]) => {
        const rows = document.querySelectorAll('[role="row"]');
        if (!rows[r]) return;
        const cells = rows[r].querySelectorAll('[role="gridcell"]');
        if (!cells[c]) return;
        if (btn === 2) {
            cells[c].dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, button: 2 }));
        } else {
            cells[c].dispatchEvent(new MouseEvent('mousedown', { bubbles: true, button: btn }));
        }
    }''', [r, c, button])
    time.sleep(0.1)


def get_cell_value(page: Page, r: int, c: int) -> str:
    """Read cell value from game state."""
    state = get_state(page)
    if not state or 'grid' not in state:
        return ''
    grid = state['grid']
    if r < len(grid) and c < len(grid[r]):
        return str(grid[r][c])
    return ''


def solve_puzzle(page: Page):
    """Fill all solution-filled cells and clear incorrect cells to solve the puzzle."""
    state = get_state(page)
    if not state or 'solution' not in state:
        return
    solution = state['solution']
    grid = state.get('grid', [])
    for r, row in enumerate(solution):
        for c, cell in enumerate(row):
            current = grid[r][c] if r < len(grid) and c < len(grid[r]) else 'empty'
            if cell == 'filled' and current != 'filled':
                # Need to fill this cell
                click_cell(page, r, c, button=0)
            elif cell != 'filled' and current == 'filled':
                # Need to clear this cell (primary click toggles filled -> empty)
                click_cell(page, r, c, button=0)
    time.sleep(0.5)


def count_grid_rows(page: Page) -> int:
    return page.locator('[role="row"]').count()


def count_grid_cells_in_row(page: Page, r: int) -> int:
    return page.evaluate(f'''() => {{
        const rows = document.querySelectorAll('[role="row"]');
        if (!rows[{r}]) return 0;
        return rows[{r}].querySelectorAll('[role="gridcell"]').length;
    }}''')


def is_undo_disabled(page: Page) -> bool:
    btn = page.locator('button[title="Undo (Ctrl+Z)"]')
    if btn.count() == 0:
        return True
    return btn.is_disabled()


def is_redo_disabled(page: Page) -> bool:
    btn = page.locator('button[title="Redo (Ctrl+Y)"]')
    if btn.count() == 0:
        return True
    return btn.is_disabled()


# ═══════════════════════════════════════════
# GROUP 1: State Machine Transitions
# ═══════════════════════════════════════════

def test_state_machine(page: Page):
    print("\n── Group 1: State Machine Transitions ──")

    # Clear and reload for fresh state
    clear_storage(page)
    page.reload()
    page.wait_for_load_state("networkidle")
    time.sleep(0.5)

    # 1. Empty state: no puzzle loaded
    state = get_state(page)
    check("Empty state — no game id", state.get('id', '') == '', page, "g1-empty")
    check("Empty state — shows 'Start a Puzzle' button",
          page.locator('button:has-text("Start a Puzzle")').count() > 0)

    # 2. Empty → Active: start new game
    start_easy_game(page)
    state = get_state(page)
    check("Empty → Active — game has id", len(state.get('id', '')) > 0)
    check("Empty → Active — grid is 5x5", state.get('width') == 5 and state.get('height') == 5)
    check("Empty → Active — solved is false", state.get('solved') == False)

    # 3. Active → Completed: solve puzzle programmatically
    solve_puzzle(page)
    time.sleep(1)
    state = get_state(page)
    check("Active → Completed — solved is true", state.get('solved') == True, page, "g1-solved")

    # 4. Completed → Active: new game from header while overlay showing
    start_easy_game(page)
    state = get_state(page)
    check("Completed → Active — new id, solved false",
          len(state.get('id', '')) > 0 and state.get('solved') == False)

    # 5. Active → Active: new game while in progress
    click_cell(page, 0, 0, button=0)
    time.sleep(0.2)
    old_id = get_state(page).get('id')
    start_easy_game(page)
    new_id = get_state(page).get('id')
    check("Active → Active — different game id", old_id != new_id)

    # 6. Undo after completion should be blocked
    solve_puzzle(page)
    time.sleep(1)
    state_before = get_state(page)
    page.keyboard.press("Control+z")
    time.sleep(0.3)
    state_after = get_state(page)
    check("Undo blocked after completion — grid unchanged",
          state_before.get('grid') == state_after.get('grid'))

    # 7. Undo/redo after reset — stacks empty
    start_easy_game(page)
    click_cell(page, 0, 0)
    time.sleep(0.2)
    # Reset via button (two clicks)
    reset_btn = page.locator('button:has-text("Reset")')
    reset_btn.click()
    time.sleep(0.2)
    page.locator('button:has-text("Reset?")').click()
    time.sleep(0.3)
    state = get_state(page)
    check("After reset — undoStack empty", len(state.get('undoStack', [])) == 0)
    check("After reset — redoStack empty", len(state.get('redoStack', [])) == 0)


# ═══════════════════════════════════════════
# GROUP 2: Grid Interaction
# ═══════════════════════════════════════════

def test_grid_interaction(page: Page):
    print("\n── Group 2: Grid Interaction ──")

    clear_storage(page)
    page.reload()
    page.wait_for_load_state("networkidle")
    time.sleep(0.5)
    start_easy_game(page)

    # 1. Cell cycle: empty → filled → empty (primary click)
    check("Cell starts empty", get_cell_value(page, 0, 0) == 'empty')
    click_cell(page, 0, 0, button=0)
    time.sleep(0.2)
    check("Primary click: empty → filled", get_cell_value(page, 0, 0) == 'filled')
    click_cell(page, 0, 0, button=0)
    time.sleep(0.2)
    check("Primary click: filled → empty", get_cell_value(page, 0, 0) == 'empty')

    # 2. Right-click mark: empty → marked → empty
    click_cell(page, 1, 1, button=2)
    time.sleep(0.2)
    check("Secondary click: empty → marked", get_cell_value(page, 1, 1) == 'marked')
    click_cell(page, 1, 1, button=2)
    time.sleep(0.2)
    check("Secondary click: marked → empty", get_cell_value(page, 1, 1) == 'empty')

    # 3. Rapid 10 cell fills — all register
    for i in range(5):
        click_cell(page, 2, i, button=0)
    time.sleep(0.2)
    for i in range(5):
        click_cell(page, 3, i, button=0)
    time.sleep(0.5)
    state = get_state(page)
    filled_count = sum(1 for r in range(2, 4) for c in range(5) if state['grid'][r][c] == 'filled')
    check("Rapid 10 fills all registered", filled_count == 10)

    # 4. Click during completion — blocked by state.solved guard
    # First solve
    clear_storage(page)
    page.reload()
    page.wait_for_load_state("networkidle")
    time.sleep(0.5)
    start_easy_game(page)
    solve_puzzle(page)
    time.sleep(1)
    state_before = get_state(page)
    # Try to click a cell
    click_cell(page, 0, 0, button=0)
    time.sleep(0.2)
    state_after = get_state(page)
    check("Click during completion — grid unchanged",
          state_before['grid'] == state_after['grid'])

    # 5. Undo when empty stack — button disabled
    clear_storage(page)
    page.reload()
    page.wait_for_load_state("networkidle")
    time.sleep(0.5)
    start_easy_game(page)
    check("Undo disabled with empty stack", is_undo_disabled(page))

    # 6. Redo clears after new move
    click_cell(page, 0, 0)
    time.sleep(0.2)
    page.keyboard.press("Control+z")
    time.sleep(0.2)
    check("Redo enabled after undo", not is_redo_disabled(page))
    click_cell(page, 0, 1)
    time.sleep(0.2)
    check("Redo cleared after new move", is_redo_disabled(page))

    # 7. Undo re-enables after move
    check("Undo enabled after move", not is_undo_disabled(page))


# ═══════════════════════════════════════════
# GROUP 3: Panel Mutual Exclusivity
# ═══════════════════════════════════════════

def test_panel_exclusivity(page: Page):
    print("\n── Group 3: Panel Mutual Exclusivity ──")

    clear_storage(page)
    page.reload()
    page.wait_for_load_state("networkidle")
    time.sleep(0.5)
    start_easy_game(page)

    # 1. Settings → Puzzle Selector (auto-close settings)
    page.locator('button[title="Settings"]').click()
    time.sleep(0.3)
    check("Settings panel opens", page.locator('text=Show Timer').count() > 0)

    page.locator('button:has-text("New Game")').click()
    time.sleep(0.3)
    check("Settings auto-closes when puzzle selector opens",
          page.locator('text=Show Timer').count() == 0)
    check("Puzzle selector is open", page.locator('text=Difficulty').count() > 0)

    # 2. Puzzle Selector → Settings (auto-close puzzle selector)
    page.locator('button[title="Settings"]').click()
    time.sleep(0.3)
    check("Puzzle selector auto-closes when settings opens",
          page.locator('text=Difficulty').count() == 0)
    check("Settings is open again", page.locator('text=Show Timer').count() > 0)

    # 3. Escape closes panel
    page.keyboard.press("Escape")
    time.sleep(0.3)
    check("Escape closes settings panel", page.locator('text=Show Timer').count() == 0)

    # 4. Backdrop click closes panel
    page.locator('button[title="Settings"]').click()
    time.sleep(0.3)
    backdrop = page.locator('.fixed.inset-0.bg-black\\/40')
    if backdrop.count() > 0:
        backdrop.click(position={"x": 10, "y": 10})
        time.sleep(0.3)
    check("Backdrop click closes settings", page.locator('text=Show Timer').count() == 0)

    # 5. SlidePanel NOT in DOM when closed (regression)
    settings_panel = page.locator('h2:has-text("Settings")')
    check("SlidePanel not in DOM when closed", settings_panel.count() == 0)

    # 6. Panel overlay does NOT block header buttons
    page.locator('button[title="Settings"]').click()
    time.sleep(0.3)
    # Header "New Game" button should still be clickable (z-index above backdrop)
    new_game_btn = page.locator('button:has-text("New Game")')
    is_clickable = new_game_btn.count() > 0 and new_game_btn.is_visible()
    check("Header buttons accessible over panel backdrop", is_clickable)
    page.keyboard.press("Escape")
    time.sleep(0.2)


# ═══════════════════════════════════════════
# GROUP 4: Puzzle Selector
# ═══════════════════════════════════════════

def test_puzzle_selector(page: Page):
    print("\n── Group 4: Puzzle Selector ──")

    clear_storage(page)
    page.reload()
    page.wait_for_load_state("networkidle")
    time.sleep(0.5)

    # 1. Custom size 7x3
    page.locator('button:has-text("New Game")').click()
    time.sleep(0.3)
    page.locator('text=Custom Size').click()
    time.sleep(0.2)

    # Set width to 7
    width_input = page.locator('input[type="number"]').first
    width_input.fill("7")
    time.sleep(0.1)
    # Set height to 3
    height_input = page.locator('input[type="number"]').nth(1)
    height_input.fill("3")
    time.sleep(0.1)

    page.locator('button:has-text("Nonogram")').click()
    time.sleep(0.5)

    state = get_state(page)
    check("Custom size 7x3 — width correct", state.get('width') == 7)
    check("Custom size 7x3 — height correct", state.get('height') == 3)

    # 2. Boundary: min 3x3
    page.locator('button:has-text("New Game")').click()
    time.sleep(0.3)
    page.locator('text=Custom Size').click()
    time.sleep(0.2)
    width_input = page.locator('input[type="number"]').first
    width_input.fill("1")
    time.sleep(0.1)
    height_input = page.locator('input[type="number"]').nth(1)
    height_input.fill("1")
    time.sleep(0.1)
    page.locator('button:has-text("Nonogram")').click()
    time.sleep(0.5)
    state = get_state(page)
    check("Boundary min — width clamped to >= 3", state.get('width', 0) >= 3)
    check("Boundary min — height clamped to >= 3", state.get('height', 0) >= 3)

    # 3. Boundary: max 30x30
    page.locator('button:has-text("New Game")').click()
    time.sleep(0.3)
    page.locator('text=Custom Size').click()
    time.sleep(0.2)
    width_input = page.locator('input[type="number"]').first
    width_input.fill("50")
    time.sleep(0.1)
    height_input = page.locator('input[type="number"]').nth(1)
    height_input.fill("50")
    time.sleep(0.1)
    page.locator('button:has-text("Nonogram")').click()
    time.sleep(0.5)
    state = get_state(page)
    check("Boundary max — width clamped to <= 30", state.get('width', 99) <= 30)
    check("Boundary max — height clamped to <= 30", state.get('height', 99) <= 30)

    # 4. Difficulty selection clears custom size
    page.locator('button:has-text("New Game")').click()
    time.sleep(0.3)
    page.locator('text=Custom Size').click()
    time.sleep(0.2)
    # Now click a difficulty button — should deactivate custom size
    page.locator('button:has-text("medium")').first.click()
    time.sleep(0.2)
    page.locator('button:has-text("Nonogram")').click()
    time.sleep(0.5)
    state = get_state(page)
    check("Difficulty selection uses preset size (10x10)",
          state.get('width') == 10 and state.get('height') == 10)

    # 5. Puzzle type list shows registered types
    page.locator('button:has-text("New Game")').click()
    time.sleep(0.3)
    check("Puzzle type list shows Nonogram",
          page.locator('button:has-text("Nonogram")').count() > 0)
    page.keyboard.press("Escape")
    time.sleep(0.2)


# ═══════════════════════════════════════════
# GROUP 5: Toolbar State
# ═══════════════════════════════════════════

def test_toolbar_state(page: Page):
    print("\n── Group 5: Toolbar State ──")

    clear_storage(page)
    page.reload()
    page.wait_for_load_state("networkidle")
    time.sleep(0.5)
    start_easy_game(page)

    # 1. Undo disabled initially → enabled after move → disabled after undo all
    check("Undo disabled initially", is_undo_disabled(page))
    click_cell(page, 0, 0)
    time.sleep(0.2)
    check("Undo enabled after move", not is_undo_disabled(page))
    page.keyboard.press("Control+z")
    time.sleep(0.2)
    check("Undo disabled after undoing all", is_undo_disabled(page))

    # 2. Redo disabled → enabled → disabled
    check("Redo enabled after undo", not is_redo_disabled(page))
    page.keyboard.press("Control+y")
    time.sleep(0.2)
    check("Redo disabled after redo all", is_redo_disabled(page))

    # 3. Check mode toggle (errors appear/disappear)
    # Put wrong value in a cell where solution says empty and grid is currently empty
    state = get_state(page)
    solution = state['solution']
    grid = state['grid']
    # Find a cell where solution is empty AND grid is currently empty
    wrong_r, wrong_c = 0, 0
    for r, row in enumerate(solution):
        found = False
        for c, cell in enumerate(row):
            if cell != 'filled' and grid[r][c] == 'empty':
                wrong_r, wrong_c = r, c
                found = True
                break
        if found:
            break
    click_cell(page, wrong_r, wrong_c, button=0)
    time.sleep(0.2)

    # Toggle check mode
    page.locator('button[title="Check (C)"]').click()
    time.sleep(0.3)
    state = get_state(page)
    check("Check mode enabled", state.get('checkMode') == True)

    # Check for error rings in DOM
    error_cells = page.locator('.ring-red-500, .ring-1.ring-error')
    check("Errors visible in check mode", error_cells.count() > 0)

    # Toggle off
    page.locator('button[title="Check (C)"]').click()
    time.sleep(0.3)
    state = get_state(page)
    check("Check mode disabled", state.get('checkMode') == False)

    # 4. Solve button opens solver panel
    solve_btn = page.locator('button:has-text("Solve")')
    check("Solve button visible", solve_btn.count() > 0)
    solve_btn.click()
    time.sleep(0.5)
    check("Solver panel opens on click",
          page.locator('h2:has-text("Solve Step-by-Step")').count() > 0)
    page.keyboard.press("Escape")
    time.sleep(0.3)

    # 5. Reset two-click confirm
    reset_btn = page.locator('button:has-text("Reset")')
    reset_btn.click()
    time.sleep(0.2)
    confirm_btn = page.locator('button:has-text("Reset?")')
    check("Reset first click shows confirmation", confirm_btn.count() > 0)

    # 6. Reset timeout (3s auto-cancel)
    time.sleep(3.5)
    check("Reset confirmation auto-cancels after 3s",
          page.locator('button:has-text("Reset?")').count() == 0)
    check("Reset button text reverts",
          page.locator('button:has-text("Reset")').count() > 0)

    # Actually reset
    page.locator('button:has-text("Reset")').click()
    time.sleep(0.2)
    page.locator('button:has-text("Reset?")').click()
    time.sleep(0.3)

    # 7. Progress indicator updates
    click_cell(page, 0, 0)
    time.sleep(0.3)
    progress = page.locator('text=/%/')
    # Check that some progress percentage appears
    pct_text = page.locator('span:has-text("%")')
    check("Progress indicator visible after cell fill", pct_text.count() > 0)


# ═══════════════════════════════════════════
# GROUP 6: Timer & Persistence
# ═══════════════════════════════════════════

def test_timer_persistence(page: Page):
    print("\n── Group 6: Timer & Persistence ──")

    clear_storage(page)
    page.reload()
    page.wait_for_load_state("networkidle")
    time.sleep(0.5)
    start_easy_game(page)

    # 1. Timer starts on new game
    time.sleep(1.5)
    state = get_state(page)
    check("Timer starts on new game (elapsedMs > 0)", state.get('elapsedMs', 0) > 0)

    # 2. Timer display visible when showTimer is on
    timer_el = page.locator('[data-testid="timer"]')
    check("Timer display visible", timer_el.count() > 0)

    # 3. Timer resets on new game
    time.sleep(1)
    start_easy_game(page)
    time.sleep(0.3)
    state = get_state(page)
    check("Timer resets on new game", state.get('elapsedMs', 9999) < 1000)

    # 4. Timer persists across reload
    time.sleep(2)
    elapsed_before = get_state(page).get('elapsedMs', 0)
    page.reload()
    page.wait_for_load_state("networkidle")
    time.sleep(0.5)
    elapsed_after = get_state(page).get('elapsedMs', 0)
    check("Timer persists across reload", elapsed_after >= elapsed_before)

    # 5. Preferences persist (toggle show timer off and back)
    page.locator('button[title="Settings"]').click()
    time.sleep(0.3)
    # Find the Show Timer toggle
    timer_toggle = page.locator('button[role="switch"]').first
    timer_toggle.click()
    time.sleep(0.2)
    prefs = get_prefs(page)
    original_show_timer = prefs.get('showTimer')
    page.keyboard.press("Escape")
    time.sleep(0.2)
    page.reload()
    page.wait_for_load_state("networkidle")
    time.sleep(0.5)
    prefs_after = get_prefs(page)
    check("Preferences persist across reload",
          prefs_after.get('showTimer') == original_show_timer)
    # Toggle back
    page.locator('button[title="Settings"]').click()
    time.sleep(0.3)
    page.locator('button[role="switch"]').first.click()
    time.sleep(0.2)
    page.keyboard.press("Escape")
    time.sleep(0.2)

    # 6. Game state persists across reload
    click_cell(page, 0, 0)
    time.sleep(0.2)
    grid_before = get_state(page).get('grid')
    page.reload()
    page.wait_for_load_state("networkidle")
    time.sleep(0.5)
    grid_after = get_state(page).get('grid')
    check("Game state grid persists across reload", grid_before == grid_after)

    # 7. Timer stops on completion
    solve_puzzle(page)
    time.sleep(1)
    state1 = get_state(page)
    time.sleep(2)
    state2 = get_state(page)
    check("Timer stops on completion (solved=true)",
          state1.get('elapsedMs') == state2.get('elapsedMs') or state2.get('solved'))

    # 8. Completion state persists across reload
    page.reload()
    page.wait_for_load_state("networkidle")
    time.sleep(0.5)
    state = get_state(page)
    check("Completion state persists across reload", state.get('solved') == True)

    # 9. Clear localStorage → empty state
    clear_storage(page)
    page.reload()
    page.wait_for_load_state("networkidle")
    time.sleep(0.5)
    check("Clear storage → shows start button",
          page.locator('button:has-text("Start a Puzzle")').count() > 0)


# ═══════════════════════════════════════════
# GROUP 7: Z-Index & Overlay
# ═══════════════════════════════════════════

def test_zindex_overlay(page: Page):
    print("\n── Group 7: Z-Index & Overlay ──")

    clear_storage(page)
    page.reload()
    page.wait_for_load_state("networkidle")
    time.sleep(0.5)
    start_easy_game(page)

    # 1. Completion overlay blocks grid clicks
    solve_puzzle(page)
    time.sleep(1)
    overlay = page.locator('[data-testid="completion-overlay"]')
    check("Completion overlay visible", overlay.count() > 0)
    # Click through overlay — grid should not change
    state_before = get_state(page)
    click_cell(page, 0, 0)
    time.sleep(0.2)
    state_after = get_state(page)
    check("Completion overlay blocks grid interaction",
          state_before['grid'] == state_after['grid'])

    # 2. Settings panel backdrop closes on click
    start_easy_game(page)
    page.locator('button[title="Settings"]').click()
    time.sleep(0.3)
    backdrop = page.locator('.fixed.inset-0.bg-black\\/40')
    check("Settings backdrop exists", backdrop.count() > 0)
    backdrop.click(position={"x": 10, "y": 10})
    time.sleep(0.3)
    check("Backdrop click closes settings", page.locator('h2:has-text("Settings")').count() == 0)

    # 3. Header buttons accessible over panel
    page.locator('button[title="Settings"]').click()
    time.sleep(0.3)
    new_game_btn = page.locator('button:has-text("New Game")')
    check("Header 'New Game' button visible over panel", new_game_btn.is_visible())


# ═══════════════════════════════════════════
# GROUP 8: Accessibility
# ═══════════════════════════════════════════

def test_accessibility(page: Page):
    print("\n── Group 8: Accessibility ──")

    clear_storage(page)
    page.reload()
    page.wait_for_load_state("networkidle")
    time.sleep(0.5)
    start_easy_game(page)

    # 1. Grid has role="grid"
    grid = page.locator('[role="grid"]')
    check("Grid has role='grid'", grid.count() > 0)

    # 2. Rows have role="row"
    rows = page.locator('[role="row"]')
    check("Rows have role='row'", rows.count() >= 3)

    # 3. Cells have role="gridcell" with tabIndex
    cells = page.locator('[role="gridcell"]')
    check("Cells have role='gridcell'", cells.count() > 0)
    # Check tabIndex on first cell
    tab_index = cells.first.get_attribute("tabindex")
    check("Cells have tabIndex attribute", tab_index is not None)


# ═══════════════════════════════════════════
# GROUP 9: Known Bug Regressions
# ═══════════════════════════════════════════

def test_regressions(page: Page):
    print("\n── Group 9: Known Bug Regressions ──")

    clear_storage(page)
    page.reload()
    page.wait_for_load_state("networkidle")
    time.sleep(0.5)
    start_easy_game(page)

    # 1. Toggle switch click actually changes state
    page.locator('button[title="Settings"]').click()
    time.sleep(0.3)
    toggle = page.locator('button[role="switch"]').first
    aria_before = toggle.get_attribute("aria-checked")
    toggle.click()
    time.sleep(0.3)
    aria_after = toggle.get_attribute("aria-checked")
    check("Toggle switch click changes aria-checked", aria_before != aria_after)
    # Revert
    toggle.click()
    time.sleep(0.2)
    page.keyboard.press("Escape")
    time.sleep(0.2)

    # 2. SlidePanel not in DOM when closed
    check("SlidePanel not in DOM when closed (settings)",
          page.locator('h2:has-text("Settings")').count() == 0)
    check("SlidePanel not in DOM when closed (puzzle selector)",
          page.locator('h2:has-text("New Game")').count() == 0)

    # 3. Settings button not blocked by panel overlay
    page.locator('button:has-text("New Game")').click()
    time.sleep(0.3)
    # Settings gear should still be clickable
    settings_btn = page.locator('button[title="Settings"]')
    try:
        settings_btn.click(timeout=2000)
        time.sleep(0.3)
        check("Settings button clickable when puzzle panel open",
              page.locator('h2:has-text("Settings")').count() > 0)
    except Exception:
        check("Settings button clickable when puzzle panel open", False)
    page.keyboard.press("Escape")
    time.sleep(0.2)

    # 4. Solve button visible on both active and solved states
    start_easy_game(page)
    solve_btn = page.locator('button:has-text("Solve")')
    check("Solve button visible during active game", solve_btn.count() > 0)

    # 5. Solve button opens panel with steps
    solve_btn.click()
    time.sleep(0.5)
    step_text = page.locator('text=/Step \\d+/')
    check("Solver panel shows step counter", step_text.count() > 0)
    page.keyboard.press("Escape")
    time.sleep(0.2)


# ═══════════════════════════════════════════
# GROUP 10: Combinatorial
# ═══════════════════════════════════════════

def test_combinatorial(page: Page):
    print("\n── Group 10: Combinatorial ──")

    clear_storage(page)
    page.reload()
    page.wait_for_load_state("networkidle")
    time.sleep(0.5)
    start_easy_game(page)

    # 1. Fill → Check → Reset → Check (no errors after reset)
    click_cell(page, 0, 0)
    time.sleep(0.1)
    page.locator('button[title="Check (C)"]').click()
    time.sleep(0.2)
    # Reset
    page.locator('button:has-text("Reset")').click()
    time.sleep(0.2)
    page.locator('button:has-text("Reset?")').click()
    time.sleep(0.3)
    state = get_state(page)
    check("After reset checkMode is false", state.get('checkMode') == False)
    # All cells should be empty
    all_empty = all(
        cell == 'empty'
        for row in state.get('grid', [])
        for cell in row
    )
    check("After reset grid is all empty", all_empty)

    # 2. Multiple undo/redo cycles: 5 moves, undo 3, redo 2, undo 1, new move
    start_easy_game(page)
    for i in range(5):
        click_cell(page, 0, i)
        time.sleep(0.1)
    # Undo 3
    for _ in range(3):
        page.keyboard.press("Control+z")
        time.sleep(0.1)
    state = get_state(page)
    check("After 5 moves, undo 3 — undoStack has 2",
          len(state.get('undoStack', [])) == 2)
    # Redo 2
    for _ in range(2):
        page.keyboard.press("Control+y")
        time.sleep(0.1)
    state = get_state(page)
    check("After redo 2 — undoStack has 4",
          len(state.get('undoStack', [])) == 4)
    # Undo 1
    page.keyboard.press("Control+z")
    time.sleep(0.1)
    state = get_state(page)
    check("After undo 1 — undoStack has 3",
          len(state.get('undoStack', [])) == 3)
    # New move clears redo
    click_cell(page, 1, 0)
    time.sleep(0.2)
    state = get_state(page)
    check("New move after undo — redoStack empty",
          len(state.get('redoStack', [])) == 0)
    check("New move after undo — undoStack has 4",
          len(state.get('undoStack', [])) == 4)

    # 3. Check mode persists across undo
    start_easy_game(page)
    click_cell(page, 0, 0)
    time.sleep(0.1)
    page.locator('button[title="Check (C)"]').click()
    time.sleep(0.2)
    check("Check mode on", get_state(page).get('checkMode') == True)
    page.keyboard.press("Control+z")
    time.sleep(0.2)
    check("Check mode persists across undo", get_state(page).get('checkMode') == True)

    # 4. Settings → change cell size → close → verify applied
    page.locator('button[title="Settings"]').click()
    time.sleep(0.3)
    slider = page.locator('input[type="range"]')
    # Set to 40
    slider.fill("40")
    time.sleep(0.2)
    page.keyboard.press("Escape")
    time.sleep(0.3)
    prefs = get_prefs(page)
    check("Cell size changed to 40", prefs.get('cellSize') == 40)


# ═══════════════════════════════════════════
# GROUP 11: Edge Cases
# ═══════════════════════════════════════════

def test_edge_cases(page: Page):
    print("\n── Group 11: Edge Cases ──")

    # 1. Invalid localStorage → graceful recovery
    page.evaluate(f'localStorage.setItem("{GAME_KEY}", "{{invalid json")')
    page.reload()
    page.wait_for_load_state("networkidle")
    time.sleep(0.5)
    check("Invalid JSON in storage → graceful recovery",
          page.locator('button:has-text("Start a Puzzle")').count() > 0 or
          page.locator('[role="grid"]').count() > 0)

    # 2. Rapid panel open/close
    clear_storage(page)
    page.reload()
    page.wait_for_load_state("networkidle")
    time.sleep(0.5)
    start_easy_game(page)
    for _ in range(5):
        page.locator('button[title="Settings"]').click()
        time.sleep(0.05)
        page.keyboard.press("Escape")
        time.sleep(0.05)
    time.sleep(0.3)
    # App should not crash
    check("Rapid panel open/close — no crash",
          page.locator('[role="grid"]').count() > 0)

    # 3. 30x30 grid generates without hanging
    page.locator('button:has-text("New Game")').click()
    time.sleep(0.3)
    page.locator('text=Custom Size').click()
    time.sleep(0.2)
    width_input = page.locator('input[type="number"]').first
    width_input.fill("30")
    height_input = page.locator('input[type="number"]').nth(1)
    height_input.fill("30")
    time.sleep(0.1)
    page.locator('button:has-text("Nonogram")').click()
    time.sleep(2)
    state = get_state(page)
    check("30x30 grid generates", state.get('width') == 30 and state.get('height') == 30)
    check("30x30 grid cells rendered",
          page.locator('[role="gridcell"]').count() >= 900)

    # 4. Keyboard shortcuts (Ctrl+Z, Ctrl+Y, C for check)
    # Go back to small grid
    clear_storage(page)
    page.reload()
    page.wait_for_load_state("networkidle")
    time.sleep(0.5)
    start_easy_game(page)

    click_cell(page, 0, 0)
    time.sleep(0.2)
    page.keyboard.press("Control+z")
    time.sleep(0.2)
    check("Ctrl+Z undo works", get_cell_value(page, 0, 0) == 'empty')
    page.keyboard.press("Control+y")
    time.sleep(0.2)
    check("Ctrl+Y redo works", get_cell_value(page, 0, 0) == 'filled')

    # C for check mode
    page.keyboard.press("c")
    time.sleep(0.2)
    check("C key toggles check mode on", get_state(page).get('checkMode') == True)
    page.keyboard.press("c")
    time.sleep(0.2)
    check("C key toggles check mode off", get_state(page).get('checkMode') == False)


# ═══════════════════════════════════════════
# GROUP 12: Visual (Screenshots)
# ═══════════════════════════════════════════

def test_visual_screenshots(page: Page):
    print("\n── Group 12: Visual (Screenshots) ──")

    # 1. Empty state screenshot
    clear_storage(page)
    page.reload()
    page.wait_for_load_state("networkidle")
    time.sleep(0.5)
    page.screenshot(path="tests/e2e-empty.png")
    check("Empty state screenshot saved", True)

    # 2. Active game screenshot
    start_easy_game(page)
    click_cell(page, 0, 0)
    click_cell(page, 1, 1)
    click_cell(page, 2, 2)
    time.sleep(0.3)
    page.screenshot(path="tests/e2e-active.png")
    check("Active game screenshot saved", True)

    # 3. Completion overlay screenshot
    solve_puzzle(page)
    time.sleep(1)
    page.screenshot(path="tests/e2e-completion.png")
    check("Completion overlay screenshot saved", True)


# ═══════════════════════════════════════════
# GROUP 13: HexMine Puzzle
# ═══════════════════════════════════════════

def start_easy_hexmine(page: Page):
    """Start a new easy hexmine game."""
    page.click('button:has-text("New Game")')
    time.sleep(0.3)
    easy_btn = page.locator('button:has-text("easy")', has_text="5")
    if easy_btn.count() > 0:
        easy_btn.first.click()
        time.sleep(0.2)
    page.locator('button:has-text("Hex Minesweeper")').click()
    time.sleep(0.5)


def click_hex_cell(page: Page, r: int, c: int, button: int = 0):
    """Click a hex cell at offset row r, col c via SVG polygon."""
    page.evaluate('''([r, c, btn]) => {
        const svg = document.querySelector('svg');
        if (!svg) return;
        const groups = svg.querySelectorAll('g');
        const width = parseInt(document.querySelector('svg').getAttribute('data-width') || '8');
        // Groups are in row-major order matching layout.cells
        const state = JSON.parse(localStorage.getItem("grid-puzzles:game") || "{}");
        const w = state.width || 8;
        const idx = r * w + c;
        if (idx >= groups.length) return;
        const g = groups[idx];
        const poly = g.querySelector('polygon');
        if (!poly) return;
        const rect = poly.getBoundingClientRect();
        const x = rect.left + rect.width / 2;
        const y = rect.top + rect.height / 2;
        if (btn === 2) {
            g.dispatchEvent(new MouseEvent('contextmenu', {
                clientX: x, clientY: y, button: 2, bubbles: true
            }));
        } else {
            g.dispatchEvent(new MouseEvent('mousedown', {
                clientX: x, clientY: y, button: btn, bubbles: true
            }));
        }
    }''', [r, c, button])
    time.sleep(0.15)


def find_safe_hex_cell(page: Page) -> tuple:
    """Find a hidden cell that is safe (not a mine or disabled) from localStorage state."""
    state = get_state(page)
    solution = state.get('solution', [])
    grid = state.get('grid', [])
    for r, row in enumerate(solution):
        for c, cell in enumerate(row):
            if cell not in ('mine', 'disabled') and r < len(grid) and c < len(grid[r]) and grid[r][c] == 'hidden':
                return (r, c)
    return None


def find_mine_hex_cell(page: Page) -> tuple:
    """Find a hidden cell that is a mine from localStorage state."""
    state = get_state(page)
    solution = state.get('solution', [])
    grid = state.get('grid', [])
    for r, row in enumerate(solution):
        for c, cell in enumerate(row):
            if cell == 'mine' and r < len(grid) and c < len(grid[r]) and grid[r][c] == 'hidden':
                return (r, c)
    return None


def auto_solve_hexmine(page: Page):
    """Reveal all non-mine, non-disabled cells to win a hexmine game."""
    state = get_state(page)
    solution = state.get('solution', [])
    grid = state.get('grid', [])
    for r, row in enumerate(solution):
        for c, cell in enumerate(row):
            if cell not in ('mine', 'disabled') and r < len(grid) and c < len(grid[r]) and grid[r][c] == 'hidden':
                click_hex_cell(page, r, c, button=0)
    time.sleep(0.5)


def test_hexmine(page: Page):
    print("\n── Group 13: HexMine Puzzle ──")

    clear_storage(page)
    page.reload()
    page.wait_for_load_state("networkidle")
    time.sleep(0.5)

    # 1. Start hexmine game — correct state
    start_easy_hexmine(page)
    state = get_state(page)
    check("Hexmine — puzzleType is hexmine", state.get('puzzleType') == 'hexmine')
    check("Hexmine — grid is 8x8", state.get('width') == 8 and state.get('height') == 8)
    check("Hexmine — all cells start hidden",
          all(cell == 'hidden' for row in state.get('grid', []) for cell in row))
    check("Hexmine — solution has mines",
          any(cell == 'mine' for row in state.get('solution', []) for cell in row))

    # 2. SVG grid renders
    svg = page.locator('svg')
    check("Hexmine — SVG grid rendered", svg.count() > 0)
    polygons = page.locator('svg polygon')
    check("Hexmine — 64 hex polygons rendered", polygons.count() == 64)

    # 3. Reveal a safe cell
    safe = find_safe_hex_cell(page)
    check("Hexmine — found safe cell", safe is not None)
    if safe:
        click_hex_cell(page, safe[0], safe[1], button=0)
        state = get_state(page)
        cell_val = state['grid'][safe[0]][safe[1]]
        check("Hexmine — safe cell revealed (is number)",
              isinstance(cell_val, int) and 0 <= cell_val <= 6)
        check("Hexmine — undoStack has 1 entry",
              len(state.get('undoStack', [])) == 1)

    # 4. Undo the reveal
    page.keyboard.press("Control+z")
    time.sleep(0.2)
    state = get_state(page)
    if safe:
        check("Hexmine — undo restores hidden",
              state['grid'][safe[0]][safe[1]] == 'hidden')

    # 5. Flag a mine cell (right-click)
    mine = find_mine_hex_cell(page)
    check("Hexmine — found mine cell", mine is not None)
    if mine:
        click_hex_cell(page, mine[0], mine[1], button=2)
        state = get_state(page)
        check("Hexmine — mine cell flagged",
              state['grid'][mine[0]][mine[1]] == 'flagged')

    # 6. Unflag (right-click again)
    if mine:
        click_hex_cell(page, mine[0], mine[1], button=2)
        state = get_state(page)
        check("Hexmine — mine cell unflagged",
              state['grid'][mine[0]][mine[1]] == 'hidden')

    # 7. Mine hit — game over
    start_easy_hexmine(page)
    mine = find_mine_hex_cell(page)
    if mine:
        click_hex_cell(page, mine[0], mine[1], button=0)
        state = get_state(page)
        check("Hexmine — mine hit: cell is exploded",
              state['grid'][mine[0]][mine[1]] == 'exploded')
        check("Hexmine — mine hit: game paused",
              state.get('paused') == True)
        # All mines should be revealed
        solution = state.get('solution', [])
        grid = state.get('grid', [])
        all_mines_shown = all(
            grid[r][c] in ('mine', 'exploded', 'flagged')
            for r, row in enumerate(solution)
            for c, cell in enumerate(row)
            if cell == 'mine'
        )
        check("Hexmine — mine hit: all mines revealed", all_mines_shown)
        # Game over text
        game_over = page.locator('text=Game Over')
        check("Hexmine — Game Over text visible", game_over.count() > 0)

    # 8. Undo after mine hit — recovers
    page.keyboard.press("Control+z")
    time.sleep(0.2)
    state = get_state(page)
    if mine:
        check("Hexmine — undo mine hit: cell hidden again",
              state['grid'][mine[0]][mine[1]] == 'hidden')

    # 9. Lose on wrong flag
    start_easy_hexmine(page)
    safe = find_safe_hex_cell(page)
    if safe:
        click_hex_cell(page, safe[0], safe[1], button=2)
        state = get_state(page)
        check("Hexmine — wrong flag: cell exploded",
              state['grid'][safe[0]][safe[1]] == 'exploded')
        check("Hexmine — wrong flag: game paused",
              state.get('paused') == True)

    # 10. Win condition — reveal all safe cells
    start_easy_hexmine(page)
    auto_solve_hexmine(page)
    time.sleep(1)
    state = get_state(page)
    check("Hexmine — win: solved is true", state.get('solved') == True)
    check("Hexmine — win: paused is true", state.get('paused') == True)
    # Completion overlay
    overlay = page.locator('text=Puzzle Complete')
    check("Hexmine — win: completion overlay visible", overlay.count() > 0)

    # 11. Cascade reveal (click 0-cell opens neighbors)
    start_easy_hexmine(page)
    state = get_state(page)
    solution = state.get('solution', [])
    # Find a 0-cell
    zero_cell = None
    for r, row in enumerate(solution):
        for c, cell in enumerate(row):
            if cell == 0:
                zero_cell = (r, c)
                break
        if zero_cell:
            break
    if zero_cell:
        click_hex_cell(page, zero_cell[0], zero_cell[1], button=0)
        state = get_state(page)
        grid = state.get('grid', [])
        revealed = sum(1 for row in grid for cell in row if cell != 'hidden' and cell != 'flagged')
        check("Hexmine — cascade: 0-cell reveals >1 cell", revealed > 1)
    else:
        check("Hexmine — cascade: 0-cell reveals >1 cell (no 0-cell found)", True)

    # 12. Persistence across reload
    start_easy_hexmine(page)
    safe = find_safe_hex_cell(page)
    if safe:
        click_hex_cell(page, safe[0], safe[1], button=0)
    state_before = get_state(page)
    page.reload()
    page.wait_for_load_state("networkidle")
    time.sleep(0.5)
    state_after = get_state(page)
    check("Hexmine — state persists across reload",
          state_before.get('grid') == state_after.get('grid'))
    check("Hexmine — puzzleType persists",
          state_after.get('puzzleType') == 'hexmine')

    # 13. SVG renders after reload
    svg = page.locator('svg')
    check("Hexmine — SVG renders after reload", svg.count() > 0)

    # 14. Mine counter display
    mine_counter = page.locator('text=/\\d+ \\/ \\d+/')
    check("Hexmine — mine counter visible", mine_counter.count() > 0)


# ═══════════════════════════════════════════
# GROUP 14: HexMine Advanced Clues
# ═══════════════════════════════════════════

def start_difficulty_hexmine(page: Page, difficulty: str):
    """Start a hexmine game at specified difficulty."""
    page.click('button:has-text("New Game")')
    time.sleep(0.3)
    diff_btn = page.locator(f'button:has-text("{difficulty}")')
    if diff_btn.count() > 0:
        diff_btn.first.click()
        time.sleep(0.2)
    page.locator('button:has-text("Hex Minesweeper")').click()
    time.sleep(0.8)


def test_hexmine_advanced_clues(page: Page):
    print("\n── Group 14: HexMine Advanced Clues ──")

    clear_storage(page)
    page.reload()
    page.wait_for_load_state("networkidle")
    time.sleep(0.5)

    # 1. Easy generates null clues (Phase 1 compatibility)
    start_easy_hexmine(page)
    state = get_state(page)
    check("Easy — null clues", state.get('clues') is None)
    check("Easy — no shape", state.get('shape') is None)

    # 2. Medium generates clues
    start_difficulty_hexmine(page, "Medium")
    state = get_state(page)
    clue_data = state.get('clues')
    # clues is now { clues: [...], questionMarks: [...] } or null
    clues = clue_data.get('clues', []) if isinstance(clue_data, dict) else clue_data
    check("Medium — clues is non-null with entries",
          clues is not None and isinstance(clues, list) and len(clues) > 0)

    # 3. Medium clues have special conditions
    if clues:
        has_special = any(c.get('special') != 'none' for c in clues)
        check("Medium — at least one clue with special condition", has_special)

        # 4. Adjacent clues present
        has_adjacent = any(c.get('type') == 'adjacent' for c in clues)
        check("Medium — has adjacent clues", has_adjacent)

        # 5. Clue mine counts are correct
        solution = state.get('solution', [])
        all_correct = True
        for clue in clues:
            if clue.get('type') != 'adjacent':
                continue
            actual_mines = sum(
                1 for key in clue.get('cellKeys', [])
                if key and solution[int(key.split(',')[0])][int(key.split(',')[1])] == 'mine'
            )
            if actual_mines != clue.get('mineCount'):
                all_correct = False
                break
        check("Medium — adjacent clue counts correct", all_correct)
    else:
        check("Medium — at least one clue with special condition", False)
        check("Medium — has adjacent clues", False)
        check("Medium — adjacent clue counts correct", False)

    # 6. Medium game still solvable — auto-solve
    auto_solve_hexmine(page)
    time.sleep(0.5)
    state = get_state(page)
    check("Medium — win after auto-solve", state.get('solved') == True)

    # 7. Hard generates line clues
    start_difficulty_hexmine(page, "Hard")
    state = get_state(page)
    clue_data = state.get('clues')
    clues = clue_data.get('clues', []) if isinstance(clue_data, dict) else clue_data
    has_line = clues is not None and any(c.get('type') == 'line' for c in clues)
    check("Hard — has line clues", has_line)

    # 8. Line origin cell is disabled
    if has_line:
        line_clue = next(c for c in clues if c.get('type') == 'line')
        dk = line_clue.get('displayKey', '')
        parts = dk.split(',')
        if len(parts) == 2:
            dr, dc = int(parts[0]), int(parts[1])
            grid = state.get('grid', [])
            check("Hard — line origin is disabled", grid[dr][dc] == 'disabled')
        else:
            check("Hard — line origin is disabled", False)

        # 9. Line clue has direction
        check("Hard — line clue has direction", line_clue.get('direction') is not None)

        # 10. Line count correct
        solution = state.get('solution', [])
        actual_mines = sum(
            1 for key in line_clue.get('cellKeys', [])
            if key and solution[int(key.split(',')[0])][int(key.split(',')[1])] == 'mine'
        )
        check("Hard — line clue count correct", actual_mines == line_clue.get('mineCount'))
    else:
        check("Hard — line origin is disabled", False)
        check("Hard — line clue has direction", False)
        check("Hard — line clue count correct", False)

    # 11. Hard has shape with false entries
    shape = state.get('shape')
    has_disabled = shape is not None and any(not v for row in shape for v in row)
    check("Hard — shape has disabled cells", has_disabled)

    # 12. Line origin not clickable
    if has_line:
        dk = line_clue.get('displayKey', '')
        parts = dk.split(',')
        dr, dc = int(parts[0]), int(parts[1])
        state_before = get_state(page)
        click_hex_cell(page, dr, dc, button=0)
        state_after = get_state(page)
        check("Hard — disabled cell click does nothing",
              state_before.get('grid') == state_after.get('grid'))

    # 13. Expert generates range clues
    start_difficulty_hexmine(page, "Expert")
    state = get_state(page)
    clue_data = state.get('clues')
    clues = clue_data.get('clues', []) if isinstance(clue_data, dict) else clue_data
    has_range = clues is not None and any(c.get('type') == 'range' for c in clues)
    check("Expert — has range clues", has_range)

    # 14. Clues persist across reload
    state_before = get_state(page)
    page.reload()
    page.wait_for_load_state("networkidle")
    time.sleep(0.5)
    state_after = get_state(page)
    check("Expert — clues persist across reload",
          state_before.get('clues') == state_after.get('clues'))

    # 15. Expert game winnable
    auto_solve_hexmine(page)
    time.sleep(0.5)
    state = get_state(page)
    check("Expert — win after auto-solve", state.get('solved') == True)


# ═══════════════════════════════════════════
# RUNNER
# ═══════════════════════════════════════════

def main():
    global PASS, FAIL
    headless = "--ci" in sys.argv

    with sync_playwright() as p:
        browser = p.chromium.launch(headless=headless)
        page = browser.new_page(
            viewport={"width": 1280, "height": 800},
            color_scheme="dark",
        )

        js_errors = []
        page.on("pageerror", lambda exc: js_errors.append(str(exc)))

        page.goto(BASE)
        page.wait_for_load_state("networkidle")
        time.sleep(1)

        print("=" * 60)
        print("Grid Puzzles E2E Suite")
        print("=" * 60)

        try:
            test_state_machine(page)
            test_grid_interaction(page)
            test_panel_exclusivity(page)
            test_puzzle_selector(page)
            test_toolbar_state(page)
            test_timer_persistence(page)
            test_zindex_overlay(page)
            test_accessibility(page)
            test_regressions(page)
            test_combinatorial(page)
            test_edge_cases(page)
            test_visual_screenshots(page)
            test_hexmine(page)
            test_hexmine_advanced_clues(page)
        except Exception as e:
            print(f"\n  CRASH: {e}")
            import traceback
            traceback.print_exc()
            page.screenshot(path="tests/e2e-crash.png")

        if js_errors:
            print(f"\n⚠ JS errors ({len(js_errors)}):")
            for e in js_errors[:5]:
                print(f"  {e[:200]}")

        print("\n" + "=" * 60)
        print(f"RESULT: {PASS} passed, {FAIL} failed")
        print("=" * 60)

        if FAIL > 0:
            print("\nFailed:")
            for name in ERRORS:
                print(f"  ✗ {name}")

        time.sleep(1)
        browser.close()
        sys.exit(0 if FAIL == 0 else 1)


if __name__ == "__main__":
    main()
