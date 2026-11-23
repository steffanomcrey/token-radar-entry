/* Token Radar — the dashboard's whole behaviour.
 *
 * Reads window.RADAR, which data.js sets from the same board.json the dossier is built on. No network
 * access: no fetch, no XHR, no image or font request, no CDN. Everything below is DOM built from that
 * one object, so the page shows exactly what the model wrote and nothing else.
 */
(function () {
  'use strict';

  var R = window.RADAR;
  var $ = function (id) { return document.getElementById(id); };

  /* ---------- formatting ---------- */

  function usd(v) {
    if (v === null || v === undefined || !isFinite(v)) return '—';
    var a = Math.abs(v);
    if (a >= 1e12) return '$' + trim1(v / 1e12) + 'T';
    if (a >= 1e9) return '$' + trim1(v / 1e9) + 'B';
    if (a >= 1e6) return '$' + trim1(v / 1e6) + 'M';
    if (a >= 1e3) return '$' + trim1(v / 1e3) + 'k';
    return '$' + Math.round(v);
  }

  function trim1(n) {
    var s = n >= 100 ? n.toFixed(0) : n >= 10 ? n.toFixed(1) : n.toFixed(2);
    return s.replace(/\.0+$/, '').replace(/(\.\d)0$/, '$1');
  }

  /** The value and its unit split, so the unit can be set smaller in the table. */
  function usdParts(v) {
    var full = usd(v);
    var m = full.match(/^(\$[0-9.,]+)([BTMk]?)$/);
    return m ? { value: m[1], unit: m[2] } : { value: full, unit: '' };
  }

  function pct(v) {
    if (v === null || v === undefined || !isFinite(v)) return '—';
    return (v > 0 ? '+' : '') + trim1(v) + '%';
  }

  function multiple(v) { return (v === null || v === undefined) ? '—' : trim1(v) + '×'; }

  function days(v) {
    if (v === null || v === undefined) return 'unknown';
    if (v < 60) return v + 'd';
    if (v < 730) return Math.round(v / 30) + 'mo';
    return trim1(v / 365) + 'y';
  }

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text !== undefined && text !== null) n.textContent = String(text);
    return n;
  }

  function deltaClass(v) {
    if (v === null || v === undefined || !isFinite(v)) return 'flat';
    if (v >= 0.5) return 'up';
    if (v <= -0.5) return 'down';
    return 'flat';
  }

  /** A farm step arrives as "…text. Cost: …. Time: …."; split the tail back into its two figures. */
  function splitStep(text) {
    var m = String(text).match(/^([\s\S]*?)\s+Cost:\s*([\s\S]*?)\.\s+Time:\s*([\s\S]*?)\.$/);
    if (!m) return { body: String(text), cost: null, time: null };
    return { body: m[1], cost: m[2], time: m[3] };
  }

  /* ---------- state ---------- */

  var state = { q: '', cat: '', chain: '', sort: 'value', chips: {}, selected: null, tab: 'board' };

  var CHIPS = [
    { id: 'watch', label: 'Watchlist only', amber: true },
    { id: 'growing', label: 'Growing ≥ 10% 7d' },
    { id: 'thick', label: 'Peer-backed (≥3 peers)' },
    { id: 'big', label: 'Implied ≥ $500M' },
    { id: 'top25', label: 'Top 25' }
  ];

  /* ---------- masthead ---------- */

  function renderProvenance() {
    var dl = $('provenance');
    dl.textContent = '';
    var pairs = [
      ['as of', R.as_of],
      ['source', R.source],
      ['floor', usd(R.floor_usd) + ' TVL'],
      ['rows', R.board_size + ' ranked'],
      ['watchlist', R.watchlist_size + ' slugs'],
      ['model', R.model_version]
    ];
    pairs.forEach(function (p) {
      dl.appendChild(el('dt', null, p[0]));
      dl.appendChild(el('dd', null, p[1]));
    });
  }

  function renderVerdict() {
    var box = $('verdict');
    box.textContent = '';
    var left = el('div', 'verdict-copy');
    left.appendChild(el('h2', null, 'The read'));

    var top = R.rows.slice(0, 3);
    var totalImplied = R.rows.reduce(function (s, r) { return s + r.implied_value_usd; }, 0);
    var capped = R.rows.filter(function (r) { return r.capped_by !== 'none'; }).length;
    var watch = R.rows.filter(function (r) { return r.on_watchlist; }).length;

    var p1 = el('p');
    p1.appendChild(el('span', null, R.board_size + ' protocols in this snapshot carry no token yet. Benchmarked against the '));
    p1.appendChild(el('strong', null, R.peer_pairs + ' traded protocols'));
    p1.appendChild(el('span', null, ' that do, they imply '));
    p1.appendChild(el('strong', null, usd(totalImplied)));
    p1.appendChild(el('span', null, ' of value in total — '));
    p1.appendChild(el('span', 'num', top.length + ' names'));
    p1.appendChild(el('span', null, ' hold a third of it and '));
    p1.appendChild(el('span', 'num', String(watch)));
    p1.appendChild(el('span', null, ' come from the watchlist floor.'));
    left.appendChild(p1);

    var p2 = el('p');
    p2.style.marginTop = '9px';
    p2.appendChild(el('span', null, 'Every median comes from the snapshot itself (global median '));
    p2.appendChild(el('span', 'num', multiple(R.global_multiple)));
    p2.appendChild(el('span', null, ' of TVL across ' + R.peer_pairs + ' traded protocols, 90th percentile '));
    p2.appendChild(el('span', 'num', multiple(R.multiple_p90)));
    p2.appendChild(el('span', null, '); no claim is above ' + multiple(Math.max(R.multiple_p90, R.model.implied_cap_multiple)) + ' of its own TVL, so the caps bit on '));
    p2.appendChild(el('strong', null, capped === 0 ? 'no row' : capped + ' rows'));
    p2.appendChild(el('span', null, '.'));
    left.appendChild(p2);
    box.appendChild(left);

    var right = el('div', 'podium');
    right.appendChild(el('h2', null, 'Top of the board'));
    top.forEach(function (r, i) {
      var btn = el('button', 'podium-item');
      btn.type = 'button';
      btn.appendChild(el('span', 'podium-rank', '#' + r.rank));
      var mid = el('span');
      mid.appendChild(el('span', 'podium-name', r.name));
      mid.appendChild(el('span', 'podium-meta', '  ' + r.category + ' · ' + r.primary_chain + ' · TVL ' + usd(r.tvl_usd)));
      btn.appendChild(mid);
      btn.appendChild(el('span', 'podium-value', usd(r.implied_value_usd)));
      btn.addEventListener('click', function () { select(r.slug); openBoard(); });
      right.appendChild(btn);
    });
    box.appendChild(right);
  }

  /* ---------- controls ---------- */

  function buildControls() {
    var cats = {}, chains = {};
    R.rows.forEach(function (r) {
      if (r.category) cats[r.category] = (cats[r.category] || 0) + 1;
      r.chains.forEach(function (c) { chains[c] = (chains[c] || 0) + 1; });
    });
    var catNames = Object.keys(cats).sort(function (a, b) { return cats[b] - cats[a] || a.localeCompare(b); });
    var chainNames = Object.keys(chains).sort(function (a, b) { return chains[b] - chains[a] || a.localeCompare(b); });

    function fill(sel, items, label) {
      sel.textContent = '';
      var opt = el('option', null, label);
      opt.value = '';
      sel.appendChild(opt);
      items.forEach(function (it) {
        var o = el('option', null, it[0] + ' (' + it[1] + ')');
        o.value = it[0];
        sel.appendChild(o);
      });
    }
    fill($('cat'), catNames.map(function (c) { return [c, cats[c]]; }), 'All categories');
    fill($('chain'), chainNames.map(function (c) { return [c, chains[c]]; }), 'All chains');

    var chips = $('chips');
    chips.textContent = '';
    CHIPS.forEach(function (c) {
      var b = el('button', 'chip' + (c.amber ? ' amber' : ''), c.label);
      b.type = 'button';
      b.setAttribute('aria-pressed', 'false');
      b.dataset.chip = c.id;
      b.title = { watch: 'Rows on the snapshot\'s watchlist', growing: 'TVL grew at least 10% over the last seven days', thick: 'The category median stands on at least 3 traded peers', big: 'Implied value of at least $500M', top25: 'The board\'s first 25 rows' }[c.id] || '';
      b.addEventListener('click', function () {
        state.chips[c.id] = !state.chips[c.id];
        b.setAttribute('aria-pressed', state.chips[c.id] ? 'true' : 'false');
        render();
      });
      chips.appendChild(b);
    });

    $('q').addEventListener('input', function () { state.q = this.value.trim().toLowerCase(); render(); });
    $('cat').addEventListener('change', function () { state.cat = this.value; render(); });
    $('chain').addEventListener('change', function () { state.chain = this.value; render(); });
    $('sort').addEventListener('change', function () { state.sort = this.value; render(); });

    document.addEventListener('keydown', function (e) {
      if (e.key === '/' && document.activeElement !== $('q')) { e.preventDefault(); $('q').focus(); }
    });
  }

  /* ---------- board ---------- */

  function passes(r) {
    if (state.chips.watch && !r.on_watchlist) return false;
    if (state.chips.growing && !((r.change_7d || 0) >= 10)) return false;
    if (state.chips.thick && r.peer_peers < 3) return false;
    if (state.chips.big && r.implied_value_usd < 5e8) return false;
    if (state.chips.top25 && r.rank > 25) return false;
    if (state.cat && r.category !== state.cat) return false;
    if (state.chain && r.chains.indexOf(state.chain) === -1) return false;
    if (state.q) {
      var hay = (r.name + ' ' + r.slug + ' ' + (r.category || '') + ' ' + r.chains.join(' ')).toLowerCase();
      if (hay.indexOf(state.q) === -1) return false;
    }
    return true;
  }

  function sorted(rows) {
    var s = rows.slice();
    var key = {
      value: function (r) { return -r.implied_value_usd; },
      tvl: function (r) { return -r.tvl_usd; },
      growth: function (r) { return -(r.change_7d === null || r.change_7d === undefined ? -1e9 : r.change_7d); },
      age: function (r) { return -(r.age_days === null || r.age_days === undefined ? -1e9 : r.age_days); },
      rank: function (r) { return r.rank; }
    }[state.sort];
    return s.sort(function (a, b) { return key(a) - key(b) || a.slug.localeCompare(b.slug); });
  }

  function rowTr(r) {
    var tr = el('tr');
    tr.dataset.slug = r.slug;
    tr.tabIndex = 0;
    if (r.rank <= 3) tr.className = 'top';
    if (state.selected === r.slug) tr.className += ' active';

    tr.appendChild(el('td', 'c-rank', r.rank));

    var name = el('td', 'c-name');
    var wrap = el('div', 'pname');
    wrap.appendChild(document.createTextNode(r.name));
    if (r.on_watchlist) { var b = el('span', 'badge watch', 'WATCH'); b.title = 'On the snapshot\'s watchlist'; wrap.appendChild(b); }
    if (r.capped_by !== 'none') { var cb = el('span', 'badge cap', 'CAPPED'); cb.title = 'Implied value held at the ' + (r.capped_by === 'gate' ? 'gate ceiling' : 'TVL-multiple cap'); wrap.appendChild(cb); }
    if (r.age_days !== null && r.age_days < 90) { var nb = el('span', 'badge new', 'NEW'); nb.title = 'First seen ' + r.listed_at + ', under 90 days old'; wrap.appendChild(nb); }
    name.appendChild(wrap);
    name.appendChild(el('div', 'slug', r.slug));
    tr.appendChild(name);

    tr.appendChild(el('td', 'c-cat', r.category || '—'));
    tr.appendChild(el('td', 'c-chain', r.primary_chain || '—'));

    var tvl = el('td', 'c-num');
    var tp = usdParts(r.tvl_usd);
    tvl.appendChild(el('span', 'tvl', tp.value));
    tvl.appendChild(el('span', 'unit', ' ' + tp.unit));
    tr.appendChild(tvl);

    var d = el('td', 'c-num');
    d.appendChild(el('span', 'delta ' + deltaClass(r.change_7d), pct(r.change_7d)));
    tr.appendChild(d);

    tr.appendChild(el('td', 'c-num px', multiple(r.peer_multiple)));

    var imp = el('td', 'c-implied');
    var ip = usdParts(r.implied_value_usd);
    imp.appendChild(el('span', 'implied', ip.value));
    imp.appendChild(el('span', 'unit', ' ' + ip.unit));
    tr.appendChild(imp);

    tr.addEventListener('click', function () { select(r.slug); });
    tr.addEventListener('keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); select(r.slug); } });
    return tr;
  }

  function renderBoard() {
    var body = $('rows');
    body.textContent = '';
    var rows = sorted(R.rows.filter(passes));
    rows.forEach(function (r) { body.appendChild(rowTr(r)); });
    $('empty').hidden = rows.length > 0;
    var c = $('count');
    c.textContent = '';
    c.appendChild(el('b', null, rows.length + ' of ' + R.board_size));
    c.appendChild(document.createTextNode(' rows shown · ' + usd(rows.reduce(function (s, r) { return s + r.implied_value_usd; }, 0)) + ' implied on screen'));
    return rows;
  }

  function openBoard() { $('view-live').hidden = true; $('view-model').hidden = true; }

  /* ---------- detail ---------- */

  function select(slug) {
    state.selected = slug;
    Array.prototype.forEach.call(document.querySelectorAll('#rows tr'), function (tr) {
      tr.classList.toggle('active', tr.dataset.slug === slug);
    });
    renderDetail();
  }

  function fact(dl, k, v) {
    dl.appendChild(el('dt', null, k));
    dl.appendChild(el('dd', null, v));
  }

  function renderDetail() {
    var box = $('detail');
    box.textContent = '';
    var r = null;
    for (var i = 0; i < R.rows.length; i++) if (R.rows[i].slug === state.selected) r = R.rows[i];
    if (!r) {
      box.appendChild(el('h2', null, 'Pick a protocol'));
      box.appendChild(el('p', 'hint', 'The board is ranked by implied value. Select a row to see the arithmetic behind its number and the farm plan written for it: what to open, what it costs, how long to hold.')); 
      var hint = el('div', 'hint');
      hint.style.marginTop = '12px';
      hint.textContent = 'Nothing here is a hand-written favourite. Every multiple on this page is a median of the snapshot\'s own traded protocols, recomputed from the input, so a new snapshot moves the whole board.';
      box.appendChild(hint);
      return;
    }

    var head = el('div', 'detail-head');
    var title = el('div');
    title.appendChild(el('h2', null, r.name));
    title.appendChild(el('div', 'detail-slug', r.slug + ' · ' + (r.category || 'uncategorised')));
    head.appendChild(title);
    var focusBtn = el('button', 'focus-toggle', document.body.classList.contains('focusing') ? 'Back to the board' : 'Focus view');
    focusBtn.type = 'button';
    focusBtn.title = 'Show this protocol on its own, wide enough to read the whole plan';
    focusBtn.addEventListener('click', function () { toggleFocus(); });
    head.appendChild(focusBtn);
    box.appendChild(head);

    var cols = el('div', 'detail-cols');
    var main = el('div', 'col-main');
    var plan = el('div', 'col-plan');
    cols.appendChild(main); cols.appendChild(plan);
    box.appendChild(cols);

    var tags = el('div', 'tags');
    r.chains.forEach(function (c) { tags.appendChild(el('span', 'tag', c)); });
    if (r.on_watchlist) tags.appendChild(el('span', 'tag watch', 'WATCHLIST'));
    tags.appendChild(el('span', 'tag', 'RANK ' + r.rank + ' / ' + R.board_size));
    box.appendChild(tags);

    box.appendChild(el('div', 'hero-label', 'Implied value'));
    box.appendChild(el('div', 'hero-value', usd(r.implied_value_usd)));
    var sub = el('div', 'hint');
    sub.style.marginTop = '5px';
    sub.textContent = 'If this protocol had a token today, at the multiple its category already trades at.';
    box.appendChild(sub);

    main.appendChild(el('h3', null, 'What the model read'));
    var facts = el('dl', 'facts');
    fact(facts, 'TVL', usd(r.tvl_usd));
    fact(facts, '7d growth', pct(r.change_7d));
    fact(facts, 'First seen', r.listed_at ? r.listed_at + ' (' + days(r.age_days) + ')' : 'unknown');
    fact(facts, 'Classifier', 'pre-token, no market cap in snapshot');
    fact(facts, 'Category median', multiple(r.peer_multiple));
    fact(facts, 'Peers behind it', r.peer_peers === 0 ? 'none — global median' : r.peer_peers + ' traded');
    fact(facts, 'Chain factor', multiple(r.chain_factor));
    fact(facts, 'Breadth (' + r.chains.length + ' chains)', multiple(r.breadth_factor));
    fact(facts, 'Momentum', multiple(r.momentum_factor));
    fact(facts, 'Patience', multiple(r.patience_factor));
    fact(facts, 'Effective multiple', multiple(r.effective_multiple));
    main.appendChild(facts);

    main.appendChild(el('h3', null, 'The arithmetic'));
    var math = el('div', 'math');
    function line(label, value, cls) {
      var row = el('div', 'row' + (cls ? ' ' + cls : ''));
      row.appendChild(el('span', null, label));
      row.appendChild(el('b', null, value));
      math.appendChild(row);
    }
    line('TVL', usd(r.tvl_usd));
    line('× category median', multiple(r.peer_multiple) + (r.peer_peers ? '  (' + r.peer_peers + ' peers)' : '  (global)'));
    line('× chain', multiple(r.chain_factor) + ' · breadth ' + multiple(r.breadth_factor));
    line('× momentum', multiple(r.momentum_factor) + '  (' + pct(r.change_7d) + ' 7d)');
    line('× patience', multiple(r.patience_factor) + '  (' + days(r.age_days) + ' old)');
    line('= implied', usd(r.implied_value_usd), 'total');
    if (r.capped_by !== 'none') {
      var note = el('div', 'note', 'Held down by the ' + (r.capped_by === 'gate' ? 'gate ceiling' : 'TVL-multiple cap') + ', so the arithmetic above is larger than the number on the row.');
      math.appendChild(note);
    } else {
      math.appendChild(el('div', 'note', 'No cap applied: the claim stays under ' + multiple(Math.max(R.multiple_p90, R.model.implied_cap_multiple)) + ' of TVL.'));
    }
    main.appendChild(math);

    plan.appendChild(el('h3', null, 'Farm plan — ' + r.steps.length + ' steps'));
    plan.appendChild(el('p', 'plan-lede', 'Written for this protocol: the position its size justifies, what it costs, and how long the record has to be visible. Every figure comes from the snapshot.'));
    var ol = el('ol', 'steps');
    r.steps.forEach(function (s) {
      var parts = splitStep(s);
      var li = el('li');
      li.appendChild(el('div', 'step-text', parts.body));
      if (parts.cost) {
        var cost = el('div', 'step-cost');
        cost.appendChild(el('span', 'k', 'Cost '));
        cost.appendChild(document.createTextNode(parts.cost + ' · '));
        cost.appendChild(el('span', 'k', 'Time '));
        cost.appendChild(document.createTextNode(parts.time));
        li.appendChild(cost);
      }
      ol.appendChild(li);
    });
    box.appendChild(ol);
  }

  /* ---------- live pane: the market's own numbers, never the model's ---------- */

  function renderLive() {
    var box = $('view-live');
    box.textContent = '';
    box.appendChild(el('h2', null, 'Already trading — shown, not ranked'));
    box.appendChild(el('p', 'lede', R.live_size + ' protocols in the snapshot hold a market cap, so their value is a fact rather than an implication. They are held out of the board and used only as the benchmark: each one contributes a market cap ÷ TVL multiple, and the medians of those multiples price every pre-token row above.'));

    var table = el('table', 'mini');
    var head = el('tr');
    ['Protocol', 'Category', 'Chain', 'TVL', 'Market cap', 'mcap ÷ TVL'].forEach(function (h, i) {
      head.appendChild(el('th', i === 3 || i === 4 || i === 5 ? 'num' : null, h));
    });
    var thead = el('thead'); thead.appendChild(head); table.appendChild(thead);
    var tbody = el('tbody');
    R.live.slice(0, 24).forEach(function (l) {
      var tr = el('tr');
      tr.appendChild(el('td', null, l.name));
      tr.appendChild(el('td', 'dim', l.category || '—'));
      tr.appendChild(el('td', 'dim', l.chains[0] || '—'));
      tr.appendChild(el('td', 'num', usd(l.tvl_usd)));
      tr.appendChild(el('td', 'num', l.mcap_usd ? usd(l.mcap_usd) : '—'));
      var m = l.tvl_usd > 0 && l.mcap_usd ? l.mcap_usd / l.tvl_usd : null;
      tr.appendChild(el('td', 'num', m === null ? '—' : m.toFixed(3) + '×'));
      tbody.appendChild(tr);
    });
    table.appendChild(tbody);
    box.appendChild(table);
    box.appendChild(el('p', 'lede', 'The first 24 by TVL of ' + R.live_size + '; every one of the ' + R.peer_pairs + ' with a usable ratio is in the median, not only the ones printed here.'));
  }

  /* ---------- model pane: the method, stated plainly ---------- */

  function renderModel() {
    var box = $('view-model');
    box.textContent = '';
    box.appendChild(el('h2', null, 'The model, plainly'));
    box.appendChild(el('p', 'lede', 'One function scores every row. It reads only fields the snapshot carries, and it re-derives its own benchmark from the snapshot\'s traded protocols, so nothing on this page depends on a list of names someone liked.'));

    var cards = el('div', 'grid-cards');
    function card(title, body, big) {
      var c = el('div', 'card');
      c.appendChild(el('h4', null, title));
      if (big) c.appendChild(el('div', 'big', big));
      if (body) c.appendChild(el('p', null, body));
      cards.appendChild(c);
    }
    card('Step 1 — the benchmark', 'For every traded protocol, multiple = market cap ÷ TVL, kept between 0.001× and 60×. The median of those multiples is the global benchmark for this snapshot.', multiple(R.global_multiple) + ' global');
    card('Step 2 — the category', 'Each category\'s median is shrunk toward the global median by ' + R.model.prior_weight + ' pseudo-peers: (n × median + w × global) ÷ (n + w). A category with one peer cannot dominate.', 'shrunk');
    card('Step 3 — the chain', 'The primary chain\'s median over the global median, clamped to [' + R.model.chain_floor + ', ' + R.model.chain_cap + '], times a breadth bonus of +' + (R.model.chain_breadth_bonus * 100) + '% per extra chain up to ' + R.model.chain_breadth_max + '.', 'clamped');
    card('Step 4 — momentum', 'Seven-day TVL growth, clamped to [' + R.model.growth_floor + '%, +' + R.model.growth_cap + '%], at a weight of ' + R.model.growth_weight + ': a collapse cannot half a row and a spike cannot double it.', '×' + R.model.growth_weight);
    card('Step 5 — patience', 'A protocol that has run longer without a token has a longer record: ' + R.model.patience_floor + ' + ' + R.model.patience_range + ' × min(age, ' + R.model.patience_days + 'd) ÷ ' + R.model.patience_days + 'd, with unknown age at ' + R.model.unknown_age_days + ' days.', R.model.patience_floor + '–' + (R.model.patience_floor + R.model.patience_range) + '×');
    card('The cap', 'No row may imply more than ' + multiple(Math.max(R.multiple_p90, R.model.implied_cap_multiple)) + ' of its own TVL (the snapshot\'s 90th-percentile multiple), and the gate ceiling of ' + usd(R.gate_max_implied_usd) + ' is the last word.', R.rows.filter(function (x) { return x.capped_by !== 'none'; }).length + ' rows capped');
    box.appendChild(cards);

    box.appendChild(el('h2', null, 'Constants in force'));
    var t = el('table', 'mini');
    var thead = el('thead');
    var hr = el('tr');
    ['Constant', 'Value', 'What it does'].forEach(function (h, i) { hr.appendChild(el('th', i === 1 ? 'num' : null, h)); });
    thead.appendChild(hr); t.appendChild(thead);
    var tb = el('tbody');
    var rows = [
      ['prior_weight', R.model.prior_weight, 'Pseudo-peers pulling a thin category median back toward the global one'],
      ['growth_weight', R.model.growth_weight, 'How far a percentage of 7d growth moves the multiple'],
      ['growth_floor / cap', R.model.growth_floor + '% / +' + R.model.growth_cap + '%', 'The band 7d growth is clamped into'],
      ['patience_floor / range', R.model.patience_floor + ' / ' + R.model.patience_range, 'The multiplier band for age, applied over the ramp'],
      ['patience_days', R.model.patience_days, 'Age at which the patience ramp is full'],
      ['unknown_age_days', R.model.unknown_age_days, 'Age assumed when the snapshot has none'],
      ['chain_floor / cap', R.model.chain_floor + ' / ' + R.model.chain_cap, 'Clamp on the chain premium'],
      ['chain_breadth_bonus', R.model.chain_breadth_bonus, 'Multiple added per extra chain, up to ' + R.model.chain_breadth_max + ' chains'],
      ['implied_cap_multiple', R.model.implied_cap_multiple, 'Floor of the cap, in TVL multiples (raised to the 90th percentile in practice)'],
      ['gate_max_implied_usd', usd(R.gate_max_implied_usd), 'The gate\'s own ceiling on any implied value']
    ];
    rows.forEach(function (r) {
      var tr = el('tr');
      tr.appendChild(el('td', null, r[0]));
      tr.appendChild(el('td', 'num', String(r[1])));
      tr.appendChild(el('td', 'dim', r[2]));
      tb.appendChild(tr);
    });
    t.appendChild(tb);
    box.appendChild(t);

    box.appendChild(el('h2', null, 'Where the board comes from'));
    box.appendChild(el('p', 'lede', 'The snapshot carries ' + R.universe_size + ' protocols at a floor of ' + usd(R.floor_usd) + ' TVL. Every one that already trades is held out and used as the benchmark (' + R.peer_pairs + ' with a usable ratio). Every one that does not trade is ranked (' + R.board_size + ' rows), with all ' + R.watchlist_size + ' watchlist slugs on the board whatever their size, and ' + R.early_size + ' further pre-token protocols found by TVL.'));

    var notes = el('div', 'card');
    notes.appendChild(el('h4', null, 'What this model does not do'));
    notes.appendChild(el('p', null, 'It does not predict a launch date, a valuation at TGE, or a float. It does not read team quality, audits or tokenomics, because the snapshot carries none of those. It answers one narrow question — what does this category\'s traded market pay for a dollar of TVL — and multiplies.'));
    notes.appendChild(el('p', null, 'A row priced off a single peer is marked with a small peer count in the detail pane, and there is a filter for it, because a median of one is a guess wearing a number.'));
    box.appendChild(notes);
  }

  /* ---------- wiring ---------- */

  function render() { renderBoard(); renderDetail(); }

  /** Focus mode: the protocol on its own, wide enough for the whole plan to be read at once. */
  function toggleFocus() {
    var on = document.body.classList.toggle('focusing');
    renderDetail();
    if (on) window.scrollTo(0, 0);
  }

  function openLive() { $('view-live').hidden = false; $('view-model').hidden = true; renderLive(); $('view-live').scrollIntoView({ block: 'start' }); }
  function openModel() { $('view-model').hidden = false; $('view-live').hidden = true; renderModel(); $('view-model').scrollIntoView({ block: 'start' }); }

  function init() {
    if (!window.RADAR || !R.rows || !R.rows.length) {
      $('verdict').textContent = 'data.js did not load, so there is nothing to rank.';
      return;
    }
    renderProvenance();
    renderVerdict();
    buildControls();
    var hash = (window.location.hash || '').replace(/^#/, '');
    var params = {};
    hash.split('&').forEach(function (kv) {
      var bits = kv.split('=');
      if (bits[0]) params[bits[0]] = bits.slice(1).join('=');
    });
    state.selected = params.slug && R.rows.some(function (r) { return r.slug === params.slug; }) ? params.slug : R.rows[0].slug;
    if (params.focus === '1') document.body.classList.add('focusing');
    render();
    if (params.view === 'live') openLive();
    else if (params.view === 'model') openModel();
    $('footnote').textContent = 'Token Radar · ' + R.board_size + ' pre-token protocols ranked against ' + R.peer_pairs + ' traded peers · snapshot ' + R.as_of + ' · model ' + R.model_version + ' · ' + R.source;
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
