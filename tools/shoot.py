"""Render the dashboard's real pages with headless Chromium and save PNGs into screenshots/.

Every image comes from a live render of /tmp/radarout: no compositing, no mock data, no reuse of the
starter's screenshots. The page is offline, so any request beyond the three local files would fail loudly
in the report at the end of this script.
"""
from playwright.sync_api import sync_playwright
import json
import sys

OUT = '/tmp/radarout'
REPO = '/root/radarsub'
rows = json.load(open(OUT + '/board.json'))['rows']
watch = [r for r in rows if r['on_watchlist']]
detail_slug = next(r['slug'] for r in watch if r['model']['peer_peers'] >= 2)

with sync_playwright() as p:
    browser = p.chromium.launch(args=['--no-sandbox', '--disable-dev-shm-usage'])
    page = browser.new_page(viewport={'width': 1440, 'height': 900})
    requests, failures = [], []
    page.on('request', lambda r: requests.append(r.url))
    page.on('requestfailed', lambda r: failures.append(r.url))

    def base():
        return 'file://' + OUT + '/dashboard/index.html'

    # 1 — the ranked board, top of the list, detail pane on rank 1
    page.goto(base())
    page.wait_for_load_state('networkidle')
    page.wait_for_timeout(350)
    page.screenshot(path=REPO + '/screenshots/radar-board.png')

    # 2 — one protocol in focus mode: the arithmetic and the whole farm plan
    page.goto(base() + '#slug=' + detail_slug + '&focus=1')
    page.wait_for_load_state('load')
    page.reload()
    page.wait_for_load_state('networkidle')
    page.wait_for_timeout(450)
    page.screenshot(path=REPO + '/screenshots/radar-detail.png')

    # 3 — the board filtered: watchlist only, ranked by implied value
    page.goto(base())
    page.wait_for_load_state('networkidle')
    page.click('.chip[data-chip="watch"]')
    page.wait_for_timeout(400)
    page.screenshot(path=REPO + '/screenshots/radar-filtered.png')

    # 4 — the model pane, stated plainly
    page.goto(base() + '#view=model')
    page.wait_for_load_state('load')
    page.reload()
    page.wait_for_load_state('networkidle')
    page.wait_for_timeout(450)
    page.screenshot(path=REPO + '/screenshots/radar-model.png')

    print('detail slug:', detail_slug)
    print('requests:', sorted(set(requests)))
    print('failures:', failures)
    browser.close()
