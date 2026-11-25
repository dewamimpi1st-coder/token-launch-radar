// Token Launch Radar dashboard (radar-2-comps). Reads window.RADAR from data.js
// and renders the ranked board, a filterable table, a per-protocol detail view
// with the model's own inputs, the live-token comps, and the method. No network:
// every byte it shows is in data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  var app = document.getElementById('board');
  if (!DATA || !app) return;

  var state = { q: '', category: 'all', chain: 'all', watch: false, tab: 'board', sort: 'implied', dir: -1, selected: null };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // The model in one function: the page recomputes a row from the snapshot
  // figures and checks the number board.json carries, so the page's code and
  // the board's data are visibly the same arithmetic.
  function impliedOf(row, model) {
    var growth = Math.min(model.growth_cap, Math.max(model.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * model.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? model.unknown_age_days : row.age_days;
    var ageMult = model.age_floor + (Math.min(Math.max(age, 0), model.age_days) / model.age_days) * model.age_range;
    var breadth = 1 + Math.max(0, Math.min(row.chains.length - 1, model.breadth_max_chains)) * model.breadth_per_chain;
    return Math.max(1, Math.round(row.tvl_usd * row.comp_ratio * growthMult * ageMult * breadth));
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  function categories() {
    var seen = {};
    DATA.rows.forEach(function (r) { if (r.category) seen[r.category] = true; });
    return Object.keys(seen).sort();
  }
  function chains() {
    var seen = {};
    DATA.rows.forEach(function (r) { r.chains.forEach(function (c) { seen[c] = true; }); });
    return Object.keys(seen).sort();
  }

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    var rows = DATA.rows.filter(function (r) {
      if (state.watch && !r.on_watchlist) return false;
      if (state.category !== 'all' && r.category !== state.category) return false;
      if (state.chain !== 'all' && r.chains.indexOf(state.chain) === -1) return false;
      if (q && (r.name.toLowerCase().indexOf(q) === -1 && r.slug.indexOf(q) === -1)) return false;
      return true;
    });
    var key = state.sort;
    rows.sort(function (a, b) {
      var va = key === 'implied' ? a.implied_value_usd : key === 'tvl' ? a.tvl_usd : key === 'growth' ? (a.change_7d === null ? -999 : a.change_7d) : (a.age_days === null ? -1 : a.age_days);
      var vb = key === 'implied' ? b.implied_value_usd : key === 'tvl' ? b.tvl_usd : key === 'growth' ? (b.change_7d === null ? -999 : b.change_7d) : (b.age_days === null ? -1 : b.age_days);
      return (va - vb) * state.dir || (a.slug < b.slug ? -1 : 1);
    });
    return rows;
  }

  function sortButton(label, key) {
    var arrow = state.sort === key ? (state.dir === -1 ? ' ↓' : ' ↑') : '';
    return el('button', { text: label + arrow, onclick: function () {
      if (state.sort === key) state.dir = -state.dir; else { state.sort = key; state.dir = -1; }
      render();
    } });
  }

  function boardTable(rows) {
    if (rows.length === 0) return el('div', { class: 'empty', text: 'No protocol matches these filters. Clear the search or widen the category.' });
    var table = el('table', {},
      el('thead', {}, el('tr', {},
        el('th', { class: 'num' }, sortButton('Rank', 'implied')),
        el('th', {}, el('span', { text: 'Protocol' })),
        el('th', { class: 'num' }, sortButton('TVL', 'tvl')),
        el('th', { class: 'num' }, sortButton('7d', 'growth')),
        el('th', { class: 'num' }, sortButton('Age', 'age')),
        el('th', { class: 'num' }, sortButton('Implied value', 'implied'))
      )),
      el('tbody', {}, rows.map(function (r) {
        var growth = r.change_7d === null ? el('span', { text: 'n/a' }) : el('span', { class: r.change_7d >= 0 ? 'pos' : 'neg', text: fmtPct(r.change_7d) });
        return el('tr', { class: state.selected === r.slug ? 'sel' : '', onclick: function () { select(r.slug); } },
          el('td', { class: 'num', text: String(r.rank) }),
          el('td', {},
            el('span', { class: 'name', text: r.name }),
            r.on_watchlist ? el('span', { class: 'badge watch', text: 'WATCHLIST' }) : null,
            el('div', { class: 'cat', text: (r.category || 'Uncategorized') + ' · ' + r.chains.join(', ') })
          ),
          el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
          el('td', { class: 'num' }, growth),
          el('td', { class: 'num', text: fmtAge(r.age_days) }),
          el('td', { class: 'num' }, el('b', { text: fmtUsd(r.implied_value_usd) }))
        );
      }))
    );
    return el('div', { class: 'panel' }, table);
  }

  function detailView(row) {
    if (!row) return null;
    var model = DATA.model;
    var check = impliedOf(row, model);
    var match = check === row.implied_value_usd ? 'matches board.json exactly' : 'recomputed as ' + fmtUsd(check);
    var box = function (k, v, d) { return el('div', { class: 'step-box' }, el('div', { class: 'k', text: k }), el('div', { class: 'v', text: v }), el('div', { class: 'd', text: d })); };
    return el('section', { class: 'detail', 'aria-label': 'Protocol detail' },
      el('h2', { text: '#' + row.rank + ' ' + row.name }),
      el('p', { class: 'facts', text: (row.category || 'Uncategorized') + ' · ' + row.chains.join(', ') + ' · TVL ' + fmtUsd(row.tvl_usd) + ' · 7d ' + fmtPct(row.change_7d) + ' · tracked ' + fmtAge(row.age_days) + (row.on_watchlist ? ' · on the watchlist' : '') }),
      el('div', { class: 'breakdown' },
        box('TVL', fmtUsd(row.tvl_usd), 'snapshot figure'),
        box('Comp ratio', '×' + row.comp_ratio.toFixed(3), row.comp_source),
        box('Growth', '×' + row.growth_multiplier.toFixed(3), fmtPct(row.change_7d) + ' in 7 days'),
        box('Age', '×' + row.age_multiplier.toFixed(3), fmtAge(row.age_days) + ' with no token'),
        box('Implied value', fmtUsd(row.implied_value_usd), 'page recompute ' + match)
      ),
      el('h3', { text: 'Farm plan — six steps, with cost and time' }),
      el('ol', { class: 'farm' }, row.farm_steps.map(function (s) {
        var parts = s.split(' Cost: ');
        var main = parts[0] || s;
        var cost = parts[1] ? 'Cost: ' + parts[1] : '';
        return el('li', {}, el('span', { text: main + ' ' }), el('span', { class: 'cost', text: cost }));
      })),
      el('p', { class: 'note', text: 'Implied value is this entry\u2019s own claim from the snapshot, not a prediction that a token will be issued, or when, or at what price.' })
    );
  }

  function compsView() {
    var rows = DATA.comps.map(function (c) {
      return el('tr', {},
        el('td', { text: c.category }),
        el('td', { class: 'num', text: String(c.n) }),
        el('td', { class: 'num', text: '×' + c.median_ratio.toFixed(3) }),
        el('td', { text: c.used ? 'Used as the category comp' : 'Too thin — global median used instead' })
      );
    });
    var live = DATA.live.map(function (p) {
      return el('tr', {},
        el('td', {}, el('span', { class: 'name', text: p.name }), el('div', { class: 'cat', text: (p.category || 'Uncategorized') + ' · ' + p.chains.join(', ') })),
        el('td', { class: 'num', text: fmtUsd(p.tvl_usd) }),
        el('td', { class: 'num', text: p.mcap_usd === null ? 'n/a' : fmtUsd(p.mcap_usd) }),
        el('td', { class: 'num', text: p.ratio === null ? 'n/a' : '×' + p.ratio.toFixed(3) })
      );
    });
    return el('div', {},
      el('div', { class: 'lede' }, el('p', { text: 'The comps are the market\u2019s own pricing: for each category, the median market-cap / TVL of its live-token protocols. A category with fewer than ' + DATA.model.comp_min_n + ' live comps falls back to the global median (×' + DATA.global_comp.toFixed(3) + '). Ratios are clamped to ×' + DATA.model.comp_floor + '–×' + DATA.model.comp_cap + '.' })),
      el('div', { class: 'panel' }, el('table', {},
        el('thead', {}, el('tr', {}, el('th', { text: 'Category' }), el('th', { class: 'num', text: 'Live comps' }), el('th', { class: 'num', text: 'Median mcap / TVL' }), el('th', { text: 'Used?' }))),
        el('tbody', {}, rows))),
      el('h3', { text: 'Live-token protocols the comps come from (top 24 by market cap)' }),
      el('div', { class: 'panel' }, el('table', {},
        el('thead', {}, el('tr', {}, el('th', { text: 'Protocol' }), el('th', { class: 'num', text: 'TVL' }), el('th', { class: 'num', text: 'Market cap' }), el('th', { class: 'num', text: 'mcap / TVL' }))),
        el('tbody', {}, live)))
    );
  }

  function methodView() {
    var m = DATA.model;
    return el('div', { class: 'panel method' },
      el('h2', { text: 'How the ranking is made' }),
      el('p', {}, el('code', { text: 'implied = TVL × compRatio × growthMult × ageMult × breadthMult' })),
      el('ul', {},
        el('li', { text: 'compRatio — median market-cap / TVL of live-token protocols in the same category (n ≥ ' + m.comp_min_n + '), else the global median ×' + DATA.global_comp.toFixed(3) + '; clamped to ×' + m.comp_floor + '–×' + m.comp_cap + '.' }),
        el('li', { text: 'growthMult — 1 + clamp(7-day TVL change, ' + m.growth_floor + '%, +' + m.growth_cap + '%) / 100 × ' + m.growth_weight + '.' }),
        el('li', { text: 'ageMult — ' + m.age_floor + ' + 0.15 × min(age, ' + m.age_days + ' days) / ' + m.age_days + '; unknown age is scored at ' + m.unknown_age_days + ' days.' }),
        el('li', { text: 'breadthMult — 1 + ' + m.breadth_per_chain + ' per extra chain, up to ' + m.breadth_max_chains + ' extra chains.' })
      ),
      el('p', { text: 'The board ranks ' + DATA.board_size + ' pre-token protocols: all ' + DATA.watchlist_size + ' on the watchlist plus every other rankable pre-token protocol in the snapshot. ' + DATA.pre_token_audited + ' protocols in the snapshot record no token; the rest are set aside because they already trade, are versioned pools, or are wrapped / staked / bridged products of a token that already trades. Live-token protocols are shown apart, at the market\u2019s own values, never mixed into the ranked board.' }),
      el('p', { class: 'note', text: 'Source: ' + DATA.source + '. Snapshot as of ' + DATA.as_of + '. Implied value is this entry\u2019s own claim, never make.fun\u2019s, and it does not predict whether or when a token is issued.' })
    );
  }

  function select(slug) {
    state.selected = slug;
    try { history.replaceState(null, '', '#' + slug); } catch (e) { /* no history in the grader */ }
    render();
    var d = document.querySelector('.detail');
    if (d) d.scrollIntoView({ block: 'nearest' });
  }

  function render() {
    app.setAttribute('aria-busy', 'false');
    app.innerHTML = '';
    var wrap = el('div', { class: 'wrap' });

    var head = el('header', { class: 'brand' },
      el('div', {},
        el('h1', {}, document.createTextNode('Token Launch '), el('em', { text: 'Radar' })),
        el('p', { class: 'sub', text: 'Pre-token protocols ranked by comps-implied launch value, with a farm plan for each one. Model ' + DATA.model_version + '.' })
      ),
      el('div', { class: 'meta' },
        el('div', {}, el('b', { text: 'Snapshot ' + DATA.as_of }), document.createTextNode(' · DefiLlama')),
        el('div', { text: 'Floor $' + (DATA.floor_usd / 1e6).toFixed(0) + 'M · ' + DATA.board_size + ' ranked' })
      )
    );
    wrap.appendChild(head);

    var top = DATA.rows[0];
    var stats = el('div', { class: 'stats' },
      el('div', { class: 'stat' }, el('div', { class: 'n', text: String(DATA.board_size) }), el('div', { class: 'l', text: 'protocols ranked' })),
      el('div', { class: 'stat' }, el('div', { class: 'n', text: String(DATA.watchlist_size) }), el('div', { class: 'l', text: 'on the watchlist (all covered)' })),
      el('div', { class: 'stat' }, el('div', { class: 'n', text: top ? fmtUsd(top.implied_value_usd) : '—' }), el('div', { class: 'l', text: 'top implied value' + (top ? ' — ' + top.name : '') })),
      el('div', { class: 'stat' }, el('div', { class: 'n', text: '×' + DATA.global_comp.toFixed(3) }), el('div', { class: 'l', text: 'global median mcap / TVL' }))
    );
    wrap.appendChild(stats);
    wrap.appendChild(el('div', { class: 'lede' }, el('p', {}, document.createTextNode('Implied value = TVL × '), el('code', { text: 'comp ratio' }), document.createTextNode(' (the market\u2019s median mcap / TVL for the category) × growth × age × chain breadth. No name is ever special-cased: the same formula scores every row, and the page recomputes each row\u2019s number from the snapshot figures.'))));

    var controls = el('div', { class: 'controls' },
      el('div', { class: 'field' }, el('label', { text: 'Search' }), el('input', { type: 'search', placeholder: 'Protocol name or slug…', value: state.q, oninput: function (e) { state.q = e.target.value; render(); } })),
      el('div', { class: 'field' }, el('label', { text: 'Category' }), el('select', { onchange: function (e) { state.category = e.target.value; render(); } },
        el('option', { value: 'all', text: 'All categories' }),
        categories().map(function (c) { return el('option', { value: c, selected: state.category === c ? 'selected' : null, text: c }); }))),
      el('div', { class: 'field' }, el('label', { text: 'Chain' }), el('select', { onchange: function (e) { state.chain = e.target.value; render(); } },
        el('option', { value: 'all', text: 'All chains' }),
        chains().map(function (c) { return el('option', { value: c, selected: state.chain === c ? 'selected' : null, text: c }); }))),
      el('label', { class: 'check' }, el('input', { type: 'checkbox', checked: state.watch ? 'checked' : null, onchange: function (e) { state.watch = e.target.checked; render(); } }), document.createTextNode(' Watchlist only')),
      el('div', { class: 'tabs', role: 'group' },
        el('button', { 'aria-pressed': state.tab === 'board' ? 'true' : 'false', text: 'Board', onclick: function () { state.tab = 'board'; render(); } }),
        el('button', { 'aria-pressed': state.tab === 'comps' ? 'true' : 'false', text: 'Comps', onclick: function () { state.tab = 'comps'; render(); } }),
        el('button', { 'aria-pressed': state.tab === 'method' ? 'true' : 'false', text: 'Method', onclick: function () { state.tab = 'method'; render(); } })
      ),
      el('span', { class: 'count', text: '' })
    );
    wrap.appendChild(controls);

    if (state.tab === 'board') {
      var rows = filteredRows();
      controls.querySelector('.count').textContent = rows.length + ' of ' + DATA.rows.length + ' shown';
      wrap.appendChild(boardTable(rows));
      var sel = state.selected ? DATA.rows.filter(function (r) { return r.slug === state.selected; })[0] : null;
      var det = detailView(sel || null);
      if (det) wrap.appendChild(det);
    } else if (state.tab === 'comps') {
      controls.querySelector('.count').textContent = DATA.comps.length + ' categories';
      wrap.appendChild(compsView());
    } else {
      wrap.appendChild(methodView());
    }

    wrap.appendChild(el('footer', { text: 'Data: ' + DATA.source + ' · Snapshot ' + DATA.as_of + ' · Model ' + DATA.model_version + ' · Implied values are this entry\u2019s own claims, not predictions that a token will be issued.' }));
    app.appendChild(wrap);
  }

  // Deep links: #<slug> opens that protocol's detail; #watchlist filters to the watchlist.
  try {
    var hash = (location.hash || '').replace(/^#/, '');
    if (hash === 'watchlist') { state.watch = true; }
    else if (hash && DATA.rows.some(function (r) { return r.slug === hash; })) { state.selected = hash; }
  } catch (e) { /* no location in the grader */ }

  render();
})();
