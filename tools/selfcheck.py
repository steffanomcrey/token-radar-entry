"""A local mirror of the board gate: run after every build so a regression is caught here, not by the judge."""
import json, os, sys
from pathlib import Path

out = Path(sys.argv[1] if len(sys.argv) > 1 else '/tmp/radarout')
snap = json.load(open('/root/radarsub/input/snapshot.json'))
board = json.load(open(out / 'board.json'))
rows = board['rows']
fails = []
def check(ok, msg):
    if not ok: fails.append(msg)

check(isinstance(rows, list), 'rows must be a list')
check(100 <= len(rows) <= 4000, 'row count %d outside 100..4000' % len(rows))
check(sorted(r['rank'] for r in rows) == list(range(1, len(rows) + 1)), 'ranks are not 1..N')
vals = [r['implied_value_usd'] for r in rows]
check(all(isinstance(v, int) and 0 < v <= 100_000_000_000_000 for v in vals), 'implied values must be positive ints <= 1e14')
check(all(vals[i] >= vals[i + 1] for i in range(len(vals) - 1)), 'implied values must not rise as rank falls')
check(len(set(vals)) > len(vals) // 10, 'too many identical implied values')
slugs = {p['slug'] for p in snap['protocols']}
check(all(r['slug'] in slugs for r in rows), 'a row slug is not in the snapshot')
missing = [s for s in snap['watchlist'] if s not in {r['slug'] for r in rows}]
check(not missing, 'watchlist slugs missing from the board: %s' % missing)
for r in rows:
    steps = r['farm_steps']
    check(3 <= len(steps) <= 12, '%s has %d farm steps' % (r['slug'], len(steps)))
    for s in steps:
        check(isinstance(s, str) and 20 <= len(s.strip()) <= 600, '%s has a step of %d chars' % (r['slug'], len(s)))
    check(all(steps), '%s has an empty step' % r['slug'])
dash = out / 'dashboard'
check((dash / 'index.html').exists(), 'dashboard/index.html missing')
check(any(p.suffix == '.css' for p in dash.iterdir()), 'dashboard has no css')
check(any(p.suffix == '.js' for p in dash.iterdir()), 'dashboard has no js')
files = list(dash.rglob('*'))
check(len([p for p in files if p.is_file()]) <= 400, 'dashboard has over 400 files')
total = sum(p.stat().st_size for p in files if p.is_file())
check(total <= 4 * 1024 * 1024, 'dashboard is over 4 MiB')
shots = sorted((out / 'screenshots').iterdir())
check(3 <= len(shots) <= 4, '%d screenshots' % len(shots))
check((out / 'dossier.json').exists(), 'dossier.json missing')
print('\n'.join('FAIL ' + f for f in fails) if fails else 'selfcheck: all board rules hold (%d rows, %d screenshots)' % (len(rows), len(shots)))
sys.exit(1 if fails else 0)
