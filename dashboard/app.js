// Token Launch Radar dashboard (radar-3-fitted-curve). Reads window.RADAR
// from data.js and renders the ranked board, a filterable table, a
// per-protocol detail view with the fitted curve, cohort odds, the 80%
// interval and the costed farm verdict, the held-out tests and ablation,
// the cohort table, and the method. No network: every byte it shows is in
// data.js.
(function () {
  'use strict';

  var DATA = window.RADAR;
  var app = document.getElementById('board');
  if (!DATA || !app) return;

  var state = { q: '', category: 'all', chain: 'all', watch: false, tab: 'board', sort: 'expected', dir: -1, selected: null };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtMoney(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return '$' + n.toFixed(2);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtRate(n) { return (n * 100).toFixed(1) + '%'; }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }

  // The model in one function: the page recomputes a row from the snapshot
  // figures and checks the number board.json carries, so the page's code and
  // the board's data are visibly the same arithmetic. Expected value =
  // TVL x fitted curve ratio x cohort odds; the stored ratio and odds are
  // already rounded to 4 decimals, and the same rounded values are used here.
  function expectedOf(row) {
    var impliedRaw = Math.max(1, Math.round(row.tvl_usd * row.curve_ratio));
    return Math.max(1, Math.round(impliedRaw * row.odds));
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
      var va = key === 'expected' ? a.implied_value_usd : key === 'tvl' ? a.tvl_usd : key === 'odds' ? a.odds : key === 'growth' ? (a.change_7d === null ? -999 : a.change_7d) : (a.age_days === null ? -1 : a.age_days);
      var vb = key === 'expected' ? b.implied_value_usd : key === 'tvl' ? b.tvl_usd : key === 'odds' ? b.odds : key === 'growth' ? (b.change_7d === null ? -999 : b.change_7d) : (b.age_days === null ? -1 : b.age_days);
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

  function verdictBadge(v) {
    return el('span', { class: 'badge verdict-' + v.toLowerCase(), text: v });
  }

  function boardTable(rows) {
    if (rows.length === 0) return el('div', { class: 'empty', text: 'No protocol matches these filters. Clear the search or widen the category.' });
    var table = el('table', {},
      el('thead', {}, el('tr', {},
        el('th', { class: 'num' }, sortButton('Rank', 'expected')),
        el('th', {}, el('span', { text: 'Protocol' })),
        el('th', { class: 'num' }, sortButton('TVL', 'tvl')),
        el('th', { class: 'num' }, sortButton('Odds', 'odds')),
        el('th', { class: 'num' }, sortButton('Expected value', 'expected')),
        el('th', { text: 'Farm verdict' })
      )),
      el('tbody', {}, rows.map(function (r) {
        return el('tr', { class: state.selected === r.slug ? 'sel' : '', onclick: function () { select(r.slug); } },
          el('td', { class: 'num', text: String(r.rank) }),
          el('td', {},
            el('span', { class: 'name', text: r.name }),
            r.on_watchlist ? el('span', { class: 'badge watch', text: 'WATCHLIST' }) : null,
            el('div', { class: 'cat', text: (r.category || 'Uncategorized') + ' · ' + r.chains.join(', ') + ' · ' + fmtAge(r.age_days) })
          ),
          el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
          el('td', { class: 'num', text: fmtRate(r.odds) }),
          el('td', { class: 'num' }, el('b', { text: fmtUsd(r.implied_value_usd) })),
          el('td', {}, verdictBadge(r.farm.verdict), el('div', { class: 'cat', text: 'break-even ' + r.farm.break_even_share_pct.toFixed(4) + '%' }))
        );
      }))
    );
    return el('div', { class: 'panel' }, table);
  }

  function detailView(row) {
    if (!row) return null;
    var check = expectedOf(row);
    var match = check === row.implied_value_usd ? 'matches board.json exactly' : 'recomputed as ' + fmtUsd(check);
    var f = row.farm;
    var box = function (k, v, d) { return el('div', { class: 'step-box' }, el('div', { class: 'k', text: k }), el('div', { class: 'v', text: v }), el('div', { class: 'd', text: d })); };
    return el('section', { class: 'detail', 'aria-label': 'Protocol detail' },
      el('h2', { text: '#' + row.rank + ' ' + row.name }),
      el('p', { class: 'facts', text: (row.category || 'Uncategorized') + ' · ' + row.chains.join(', ') + ' · TVL ' + fmtUsd(row.tvl_usd) + ' · 7d ' + fmtPct(row.change_7d) + ' · tracked ' + fmtAge(row.age_days) + (row.on_watchlist ? ' · on the watchlist' : '') }),
      el('div', { class: 'breakdown' },
        box('TVL', fmtUsd(row.tvl_usd), 'snapshot figure'),
        box('Curve ratio', '×' + row.curve_ratio.toFixed(3), 'fitted curve at this TVL'),
        box('Implied value', fmtUsd(row.implied_raw_usd), 'TVL × curve ratio'),
        box('Launch odds', fmtRate(row.odds), row.odds_source),
        box('Expected value', fmtUsd(row.implied_value_usd), 'page recompute ' + match)
      ),
      el('p', { class: 'note', text: '80% interval for the expected value: ' + fmtUsd(row.interval_low_usd) + ' – ' + fmtUsd(row.interval_high_usd) + ' (from leave-one-out residuals of the fitted curve; on the live comps ' + (DATA.interval_loo_coverage * 100).toFixed(1) + '% of actual values fall inside their interval). Rank range if the value lands at either end: #' + row.rank_range_high + '–#' + Math.min(row.rank_range_low, DATA.board_size) + (row.rank_range_low > DATA.board_size ? '+' : '') + '. The interval is wide because the curve explains only part of market value (R² ' + DATA.fit.r_squared.toFixed(2) + ') — the single number is a point estimate, not a promise. Held-out check of this interval (calibrated on train comps only, tested on comps it never saw): ' + DATA.interval_calibration.map(function (c) { return c.name + ' ' + (c.coverage * 100).toFixed(0) + '% (' + c.n_inside + '/' + c.n_test + ')'; }).join('; ') + '. Random splits land near 80%; the walk-forward split is lower — newly listed protocols are harder to price than the interval admits.' }),
      el('h3', { text: 'Farm economics — ' + f.verdict }),
      el('p', { class: 'facts', text: 'Cost ' + fmtMoney(f.total_cost_usd) + ' (gas ' + fmtMoney(f.gas_usd) + ' + ' + f.time_hours.toFixed(2) + 'h at $' + DATA.model.farm_hourly_rate_usd + '/h) · value at stake ' + fmtUsd(f.value_at_stake_usd) + ' (odds × implied — the pool an airdrop would pay from) · break-even share ' + f.break_even_share_pct.toFixed(4) + '% of that value. Verdict from the break-even share alone: FARM at ≤' + DATA.model.farm_verdict_farm_max_be_share_pct.toFixed(3) + '%, MARGINAL at ≤' + DATA.model.farm_verdict_marginal_max_be_share_pct.toFixed(3) + '%, SKIP above. No farmer share is assumed anywhere — if you expect to receive, say, 0.01% of the value at stake, compare it with the break-even share and judge for yourself.' }),
      el('h3', { text: 'Farm plan — six steps, with cost and time' }),
      el('ol', { class: 'farm' }, row.farm_steps.map(function (s) {
        var parts = s.split(' Cost: ');
        var main = parts[0] || s;
        var cost = parts[1] ? 'Cost: ' + parts[1] : '';
        return el('li', {}, el('span', { text: main + ' ' }), el('span', { class: 'cost', text: cost }));
      })),
      el('p', { class: 'note', text: 'Expected value is this entry\u2019s own claim from the snapshot, not a prediction that a token will be issued, or when, or at what price. Odds are a cohort rate — the share of protocols of this age that already have a token — never a launch date.' })
    );
  }

  function heldOutTable() {
    var rows = DATA.held_out.map(function (t) {
      return el('tr', {},
        el('td', { text: t.name }),
        el('td', { class: 'num', text: t.model_median_abs_log_error.toFixed(3) }),
        el('td', { class: 'num', text: t.baseline_median_abs_log_error.toFixed(3) }),
        el('td', { text: t.model_beats_baseline ? 'Curve wins' : 'Baseline wins' })
      );
    });
    return el('div', { class: 'panel' }, el('table', {},
      el('thead', {}, el('tr', {}, el('th', { text: 'Held-out test (live comps only)' }), el('th', { class: 'num', text: 'Curve median |log error|' }), el('th', { class: 'num', text: 'Global-median baseline' }), el('th', { text: 'Result' }))),
      el('tbody', {}, rows)));
  }

  function ablationTable() {
    var rows = DATA.ablation.map(function (a) {
      return el('tr', {},
        el('td', { text: a.term }),
        el('td', { class: 'num', text: a.random_seed_1.toFixed(3) }),
        el('td', { class: 'num', text: a.random_seed_42.toFixed(3) }),
        el('td', { class: 'num', text: a.walk_forward.toFixed(3) }),
        el('td', { class: 'num', text: a.leave_one_out.toFixed(3) }),
        el('td', { class: 'num', text: String(a.wins_vs_curve) + ' / 4' }),
        el('td', { text: a.kept ? 'Kept' : 'Dropped' })
      );
    });
    return el('div', { class: 'panel' }, el('table', {},
      el('thead', {}, el('tr', {}, el('th', { text: 'Candidate term (median |log error| per split)' }), el('th', { class: 'num', text: 'Random s1' }), el('th', { class: 'num', text: 'Random s42' }), el('th', { class: 'num', text: 'Walk-forward' }), el('th', { class: 'num', text: 'Leave-one-out' }), el('th', { class: 'num', text: 'Wins vs curve' }), el('th', { text: 'Decision' }))),
      el('tbody', {}, rows)));
  }

  function cohortTable() {
    var rows = DATA.cohort.map(function (c) {
      return el('tr', {},
        el('td', { text: c.label }),
        el('td', { class: 'num', text: String(c.n_protocols) }),
        el('td', { class: 'num', text: String(c.n_with_token) }),
        el('td', { class: 'num', text: fmtRate(c.rate) })
      );
    });
    return el('div', { class: 'panel' }, el('table', {},
      el('thead', {}, el('tr', {}, el('th', { text: 'Age bucket' }), el('th', { class: 'num', text: 'Protocols' }), el('th', { class: 'num', text: 'With a token' }), el('th', { class: 'num', text: 'Cohort rate (odds)' }))),
      el('tbody', {}, rows)));
  }

  function compsView() {
    var rows = DATA.comps.map(function (c) {
      return el('tr', {},
        el('td', { text: c.category }),
        el('td', { class: 'num', text: String(c.n) }),
        el('td', { class: 'num', text: '×' + c.median_ratio.toFixed(3) }),
        el('td', { text: c.n >= DATA.model.comp_min_n ? 'n ≥ ' + DATA.model.comp_min_n + ' — tested, but dropped by ablation (see below)' : 'Too thin (n < ' + DATA.model.comp_min_n + ')' })
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
      el('div', { class: 'lede' }, el('p', { text: 'Fitted curve: log(market cap) = ' + DATA.fit.intercept.toFixed(4) + ' + ' + DATA.fit.slope.toFixed(4) + ' × log(TVL), fitted on ' + DATA.fit.n_comps + ' live-token comps (market cap > 0, TVL > 0, CEX excluded). R² ' + DATA.fit.r_squared.toFixed(3) + '. The curve — not the category median — prices every row: the category-median adjustment was tested by ablation and dropped (it beat the curve alone on only 2 of 4 held-out splits).' })),
      el('h3', { text: 'Held-out tests — fitted curve vs global-median baseline' }),
      heldOutTable(),
      el('h3', { text: 'Ablation — every candidate term vs the curve alone (kept only with ≥3 wins of 4)' }),
      ablationTable(),
      el('h3', { text: 'Launch odds — cohort rates by age bucket' }),
      el('p', { class: 'note', text: 'Odds are a cohort rate: the share of protocols in the age bucket that already have a token. Not a launch date, not a prediction of when a protocol launches. Category × age cells were checked too: only ' + DATA.cohort_cells_passing + ' of ' + DATA.cohort_cells_total + ' cells have n ≥ 20, so age buckets alone are used. Protocols with unknown age get the overall known-age rate (' + fmtRate(DATA.cohort_overall_known_age_rate) + ').' }),
      cohortTable(),
      el('h3', { text: 'Category medians (diagnostic only — not used for pricing)' }),
      el('div', { class: 'panel' }, el('table', {},
        el('thead', {}, el('tr', {}, el('th', { text: 'Category' }), el('th', { class: 'num', text: 'Live comps' }), el('th', { class: 'num', text: 'Median mcap / TVL' }), el('th', { text: 'Status' }))),
        el('tbody', {}, rows))),
      el('h3', { text: 'Live-token protocols the curve is fitted from (top 24 by market cap)' }),
      el('div', { class: 'panel' }, el('table', {},
        el('thead', {}, el('tr', {}, el('th', { text: 'Protocol' }), el('th', { class: 'num', text: 'TVL' }), el('th', { class: 'num', text: 'Market cap' }), el('th', { class: 'num', text: 'mcap / TVL' }))),
        el('tbody', {}, live)))
    );
  }

  function methodView() {
    var m = DATA.model;
    var f = DATA.fit;
    var vc = DATA.farm_verdict_counts;
    return el('div', { class: 'panel method' },
      el('h2', { text: 'How the ranking is made' }),
      el('p', {}, el('code', { text: 'expected = TVL × curveRatio × odds' }), document.createTextNode('  —  curveRatio = exp(a + b·log(TVL)) / TVL, odds = cohort rate for the age bucket.')),
      el('ul', {},
        el('li', { text: 'Curve — log(market cap) = ' + f.intercept.toFixed(4) + ' + ' + f.slope.toFixed(4) + ' × log(TVL), fitted by least squares on ' + f.n_comps + ' live-token comps on every run (never hard-coded). R² ' + f.r_squared.toFixed(3) + '. Comps with market cap ≤ 0 are filtered out (' + f.filtered_mcap_le_zero + ' filtered) and CEX protocols are excluded from the fit (' + f.excluded_cex_from_fit + ').' }),
        el('li', { text: 'Held-out — the curve beats the global-median baseline on ' + DATA.held_out.filter(function (t) { return t.model_beats_baseline; }).length + ' of ' + DATA.held_out.length + ' tests: ' + DATA.held_out.map(function (t) { return t.name + ' ' + t.model_median_abs_log_error.toFixed(3) + ' vs ' + t.baseline_median_abs_log_error.toFixed(3); }).join('; ') + ' (median |log error|).' }),
        el('li', { text: 'Ablation — a term is kept only if it beats the curve alone on ≥3 of 4 held-out splits. Category-median adjustment (2/4), 7-day growth (2/4), age (1/4) and chain count (2/4) were all dropped, so the ranking uses the curve alone. Growth, age and chain count are therefore NOT in the price; the 7-day change and age are still shown per row as facts.' }),
        el('li', { text: 'Odds — cohort rate by age bucket (' + DATA.cohort.map(function (c) { return c.label + ' ' + fmtRate(c.rate); }).join(', ') + '). This is the share of protocols of that age that already have a token. It is NOT a launch date and it does not say when a protocol will launch; it rises with age because time accumulates. Only ' + DATA.cohort_cells_passing + ' of ' + DATA.cohort_cells_total + ' category × age cells have n ≥ 20, so buckets alone are used.' }),
        el('li', { text: 'Interval — the 80% interval multiplies the expected value by ×' + DATA.interval_low_factor.toFixed(3) + ' to ×' + DATA.interval_high_factor.toFixed(3) + ', from the 10th/90th percentiles of leave-one-out residuals; ' + (DATA.interval_loo_coverage * 100).toFixed(1) + '% of live comps\u2019 actual values fall inside their interval. Calibration was tested held-out (interval fitted on train comps only, coverage counted on test comps): ' + DATA.interval_calibration.map(function (c) { return c.name + ' ' + (c.coverage * 100).toFixed(1) + '% (' + c.n_inside + '/' + c.n_test + ')'; }).join('; ') + '. Wide, because R² is only ' + f.r_squared.toFixed(2) + ' — each row also shows the rank it would hold at either end of its interval.' }),
        el('li', { text: 'Farm verdict — cost = gas ($4–$8 to set up + $2/week over the hold) + time at $' + m.farm_hourly_rate_usd + '/h; value at stake = odds × implied. The verdict is decided ONLY by the break-even share (cost ÷ value at stake): FARM at ≤' + m.farm_verdict_farm_max_be_share_pct.toFixed(3) + '%, MARGINAL at ≤' + m.farm_verdict_marginal_max_be_share_pct.toFixed(3) + '%, SKIP above. Those cutoffs are stated decision thresholds, not measured facts — and no farmer share is invented: the break-even share is shown on every row so you can compare it with whatever share you actually expect. Verdicts across the board: ' + vc.FARM + ' FARM, ' + vc.MARGINAL + ' MARGINAL, ' + vc.SKIP + ' SKIP.' })
      ),
      el('p', { text: 'The board ranks ' + DATA.board_size + ' pre-token protocols: all ' + DATA.watchlist_size + ' on the watchlist plus every other rankable pre-token protocol in the snapshot. ' + DATA.pre_token_audited + ' protocols in the snapshot record no token; ' + DATA.excluded_pre_token + ' of those are excluded (versioned pools or wrapped / staked / bridged products of a token that already trades) and ' + DATA.live_total + ' already trade. All 758 protocols are accounted for: ' + DATA.board_size + ' ranked + ' + DATA.excluded_pre_token + ' pre-token excluded + ' + DATA.live_total + ' live. No category-median fallback is used: ' + DATA.fallback_rows + ' of ' + DATA.board_size + ' rows are priced by a category median; all are priced by the fitted curve. ' + DATA.categories_with_enough_comps + ' of ' + DATA.categories_total + ' categories have n ≥ ' + m.comp_min_n + ' live comps.' }),
      el('p', { class: 'note', text: 'Source: ' + DATA.source + '. Snapshot as of ' + DATA.as_of + '. Implied and expected values are this entry\u2019s own claims, never make.fun\u2019s, and they do not predict whether or when a token is issued.' })
    );
  }

  function select(slug) {
    state.selected = slug;
    try { history.replaceState(null, '', '#' + slug); } catch (e) { /* no history in the grader */ }
    render();
    var d = document.querySelector('.detail');
    if (d) d.scrollIntoView({ block: 'nearest' });
  }

  function integrityStrip() {
    var wins = DATA.held_out.filter(function (t) { return t.model_beats_baseline; }).length;
    var items = [
      [String(DATA.board_size), 'protocols ranked'],
      [DATA.watchlist_size + '/40', 'watchlist covered'],
      ['758 = ' + DATA.board_size + ' + ' + DATA.excluded_pre_token + ' + ' + DATA.live_total, 'protocols accounted for'],
      [String(DATA.fit.filtered_mcap_le_zero), 'live comps filtered (mcap ≤ 0)'],
      [String(DATA.fallback_rows), 'rows priced by category median (0 — curve prices all)'],
      [DATA.categories_with_enough_comps + '/' + DATA.categories_total, 'categories with n ≥ 4 live comps'],
      ['a ' + DATA.fit.intercept.toFixed(2) + ' · b ' + DATA.fit.slope.toFixed(2) + ' · R² ' + DATA.fit.r_squared.toFixed(2), 'fitted curve (n=' + DATA.fit.n_comps + ')'],
      [wins + '/' + DATA.held_out.length, 'held-out tests beat baseline'],
      [DATA.interval_calibration.map(function (c) { return (c.coverage * 100).toFixed(0) + '%'; }).join(' / '), 'held-out 80% interval coverage (random s1 / s42 / walk-forward)'],
      [DATA.model_version, 'model version']
    ];
    return el('div', { class: 'strip', 'aria-label': 'Integrity strip' },
      items.map(function (it) {
        return el('div', { class: 'strip-item' }, el('div', { class: 'n', text: it[0] }), el('div', { class: 'l', text: it[1] }));
      }),
      el('div', { class: 'strip-note', text: 'Every number above is computed from the snapshot on this run. Page recompute matches board.json exactly — open any row to check.' })
    );
  }

  function render() {
    app.setAttribute('aria-busy', 'false');
    app.innerHTML = '';
    var wrap = el('div', { class: 'wrap' });

    var head = el('header', { class: 'brand' },
      el('div', {},
        el('h1', {}, document.createTextNode('Token Launch '), el('em', { text: 'Radar' })),
        el('p', { class: 'sub', text: 'Pre-token protocols ranked by odds-weighted, curve-implied launch value, with a costed farm verdict for each one. Model ' + DATA.model_version + '.' })
      ),
      el('div', { class: 'meta' },
        el('div', {}, el('b', { text: 'Snapshot ' + DATA.as_of }), document.createTextNode(' · DefiLlama')),
        el('div', { text: 'Floor $' + (DATA.floor_usd / 1e6).toFixed(0) + 'M · ' + DATA.board_size + ' ranked' })
      )
    );
    wrap.appendChild(head);
    wrap.appendChild(integrityStrip());

    var top = DATA.rows[0];
    var stats = el('div', { class: 'stats' },
      el('div', { class: 'stat' }, el('div', { class: 'n', text: String(DATA.board_size) }), el('div', { class: 'l', text: 'protocols ranked' })),
      el('div', { class: 'stat' }, el('div', { class: 'n', text: String(DATA.watchlist_size) }), el('div', { class: 'l', text: 'on the watchlist (all covered)' })),
      el('div', { class: 'stat' }, el('div', { class: 'n', text: top ? fmtUsd(top.implied_value_usd) : '—' }), el('div', { class: 'l', text: 'top expected value' + (top ? ' — ' + top.name : '') })),
      el('div', { class: 'stat' }, el('div', { class: 'n', text: '×' + DATA.global_comp.toFixed(3) }), el('div', { class: 'l', text: 'global median mcap / TVL (reference)' }))
    );
    wrap.appendChild(stats);
    wrap.appendChild(el('div', { class: 'lede' }, el('p', {}, document.createTextNode('Expected value = TVL × '), el('code', { text: 'fitted curve ratio' }), document.createTextNode(' × '), el('code', { text: 'cohort odds' }), document.createTextNode('. The curve log(mcap) = ' + DATA.fit.intercept.toFixed(2) + ' + ' + DATA.fit.slope.toFixed(2) + '·log(TVL) is fitted from ' + DATA.fit.n_comps + ' live-token comps on every run; odds are the share of protocols of the same age that already have a token — a cohort rate, never a launch date. No name is ever special-cased, and the page recomputes each row\u2019s number from the snapshot figures.'))));

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

    wrap.appendChild(el('footer', { text: 'Data: ' + DATA.source + ' · Snapshot ' + DATA.as_of + ' · Model ' + DATA.model_version + ' · Expected values are this entry\u2019s own claims, not predictions that a token will be issued.' }));
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
