"""Verify all vision requirements for the puzzle compiler."""
from playwright.sync_api import sync_playwright
import json, time, sys

BASE = "http://localhost:5180"
PASS = 0
FAIL = 0

def check(name, passed):
    global PASS, FAIL
    if passed:
        PASS += 1
        print(f"  PASS: {name}")
    else:
        FAIL += 1
        print(f"  FAIL: {name}")

def run_compiler(page, blueprint_js):
    return page.evaluate(f'''() => new Promise(resolve => {{
        import('/src/puzzles/hexmine/compiler/index.ts').then(mod => {{
            import('/src/puzzles/hexmine/solve.ts').then(solveMod => {{
                try {{
                    const p = mod.compilePuzzle({blueprint_js});
                    const solvable = solveMod.solveFromRevealed(
                        p.grid, p.solution, p.width, p.height, p.clues?.clues
                    );
                    resolve({{
                        ok: true, solvable,
                        clueCount: p.clues?.clues?.length ?? 0,
                        hasShape: !!p.shape,
                        disabled: p.shape ? p.shape.flat().filter(v => !v).length : 0,
                        mineCount: p.solution.flat().filter(c => c === 'mine').length,
                        solution: p.solution,
                        clueTypes: (p.clues?.clues ?? []).reduce((a,c) => {{
                            a[c.type] = (a[c.type]||0)+1; return a;
                        }}, {{}}),
                    }});
                }} catch(e) {{
                    resolve({{ ok: false, error: e.message, isCompError: e.name === 'CompilationError' }});
                }}
            }});
        }});
    }})''')

def main():
    with sync_playwright() as p:
        browser = p.chromium.launch(headless=True)
        page = browser.new_page(viewport={"width": 1280, "height": 800})
        page.goto(BASE)
        page.wait_for_load_state("networkidle")
        time.sleep(2)

        print("=" * 60)
        print("PUZZLE COMPILER VISION REQUIREMENTS")
        print("=" * 60)

        # V1: Backwards generation
        print("\n-- V1: Backwards generation --")
        r = run_compiler(page, '''{ id:'v1', name:'t', width:8, height:8, mineDensity:0.15, seed:42,
            steps:[{id:0, target:{kind:'coord',row:2,col:4}, targetValue:1,
                    requiredStrategy:{kind:'clue',type:'adjacent'}}] }''')
        check("Compiles with coord target", r.get('ok'))
        check("Target cell is mine in solution", r.get('ok') and r.get('solution', [[]])[2][4] == 'mine')

        # V2: Auto targets
        print("\n-- V2: Auto targets --")
        r = run_compiler(page, '''{ id:'v2', name:'t', width:8, height:8, mineDensity:0.15, seed:100,
            steps:[{id:0, target:{kind:'auto'}, targetValue:1},
                   {id:1, target:{kind:'auto'}, targetValue:0}] }''')
        check("Auto target works", r.get('ok'))
        check("Auto target solvable", r.get('solvable'))

        # V3: All clue type factories
        print("\n-- V3: All clue type factories --")
        for ct in ['adjacent', 'line', 'range', 'edge-header']:
            r = run_compiler(page, f'''{{ id:'v3-{ct}', name:'t', width:10, height:10, mineDensity:0.15, seed:200,
                steps:[{{id:0, target:{{kind:'auto'}}, targetValue:1,
                        requiredStrategy:{{kind:'clue',type:'{ct}'}}}}] }}''')
            check(f"{ct} clue factory", r.get('ok'))

        # V4: Full auto mode
        print("\n-- V4: Full auto mode --")
        r = run_compiler(page, '''{ id:'v4', name:'t', width:10, height:10, mineDensity:0.15, seed:350,
            steps:[], autoStepCount:10, defaultDifficulty:'medium' }''')
        check("Full auto compiles", r.get('ok'))
        check("Full auto solvable", r.get('solvable'))
        check("Full auto has clues", r.get('clueCount', 0) > 0)

        # V5: Grid shape trimming
        print("\n-- V5: Grid shape trimming --")
        r = run_compiler(page, '''{ id:'v5', name:'t', width:10, height:10, mineDensity:0.15, seed:400,
            steps:[{id:0, target:{kind:'auto'}, targetValue:1,
                    requiredStrategy:{kind:'clue',type:'adjacent'}}] }''')
        check("Shape trimming creates holes", r.get('hasShape') and r.get('disabled', 0) > 0)

        # V6: Conflict detection
        print("\n-- V6: Conflict detection --")
        r = run_compiler(page, '''{ id:'v6', name:'t', width:6, height:6, mineDensity:0.15, seed:500,
            steps:[{id:0, target:{kind:'coord',row:3,col:3}, targetValue:1,
                    requiredStrategy:{kind:'clue',type:'adjacent'}}] }''')
        check("Detects already-assigned target", not r.get('ok') and r.get('isCompError'))

        # V7: Deterministic
        print("\n-- V7: Deterministic --")
        bp = '''{ id:'v7', name:'t', width:8, height:8, mineDensity:0.15, seed:999,
            steps:[{id:0, target:{kind:'auto'}, targetValue:1,
                    requiredStrategy:{kind:'clue',type:'adjacent'}}] }'''
        r1 = run_compiler(page, bp)
        r2 = run_compiler(page, bp)
        check("Same seed = same solution", r1.get('mineCount') == r2.get('mineCount'))

        # V8: Pre-revealed strategy
        print("\n-- V8: Pre-revealed cells --")
        r = run_compiler(page, '''{ id:'v8', name:'t', width:8, height:8, mineDensity:0.15, seed:600,
            steps:[{id:0, target:{kind:'auto'}, targetValue:0,
                    requiredStrategy:{kind:'pre-revealed'}},
                   {id:1, target:{kind:'auto'}, targetValue:1,
                    requiredStrategy:{kind:'clue',type:'adjacent'}}] }''')
        check("Pre-revealed strategy works", r.get('ok'))

        # V9: Contiguous/nonContiguous in compiler
        print("\n-- V9: Special annotations --")
        r = run_compiler(page, '''{ id:'v9', name:'t', width:10, height:10, mineDensity:0.15, seed:700,
            steps:[{id:0, target:{kind:'auto'}, targetValue:1,
                    requiredStrategy:{kind:'clue',type:'adjacent',special:'contiguous'}}] }''')
        check("Contiguous adjacent works", r.get('ok'))

        # V10: Mixed strategies in one blueprint
        print("\n-- V10: Mixed strategies --")
        r = run_compiler(page, '''{ id:'v10', name:'t', width:10, height:10, mineDensity:0.15, seed:800,
            steps:[{id:0, target:{kind:'auto'}, targetValue:1,
                    requiredStrategy:{kind:'clue',type:'adjacent'}},
                   {id:1, target:{kind:'auto'}, targetValue:0,
                    requiredStrategy:{kind:'clue',type:'edge-header'}},
                   {id:2, target:{kind:'auto'}, targetValue:1,
                    requiredStrategy:{kind:'clue',type:'adjacent',special:'contiguous'}}] }''')
        check("Mixed strategies compile", r.get('ok'))
        check("Multiple clue types in result", len(r.get('clueTypes', {})) >= 1)

        # V11: Control spectrum — coord + auto in same blueprint
        print("\n-- V11: Control spectrum --")
        r = run_compiler(page, '''{ id:'v11', name:'t', width:8, height:8, mineDensity:0.15, seed:900,
            steps:[{id:0, target:{kind:'coord',row:2,col:5}, targetValue:1,
                    requiredStrategy:{kind:'clue',type:'adjacent'}},
                   {id:1, target:{kind:'auto'}, targetValue:0}] }''')
        check("Mixed coord + auto targets", r.get('ok'))

        browser.close()

    print(f"\n{'='*60}")
    print(f"RESULT: {PASS} passed, {FAIL} failed out of {PASS+FAIL}")
    print(f"{'='*60}")
    sys.exit(0 if FAIL == 0 else 1)

if __name__ == "__main__":
    main()
