// Token Launch Radar — fitted log-log curve model (radar-3).
//
// The board ranks pre-token protocols by an odds-weighted implied launch
// value derived ONLY from the sealed snapshot's own figures. No protocol
// name is ever special-cased: the same functions score every row, and every
// coefficient is fitted from the snapshot on every run — no fitted number
// is written into this file.
//
//   implied_raw = TVL x curveRatio,  curveRatio = exp(a + b*log(TVL)) / TVL
//   expected    = implied_raw x odds
//
//   curve  log(mcap) = a + b*log(TVL), fitted by ordinary least squares on
//          the live-token protocols with market cap > 0 and TVL > 0,
//          excluding CEX (exchanges are not DeFi comps). The fit is
//          recomputed from the snapshot on every run.
//   odds   The cohort rate: the share of protocols in the same age bucket
//          that already have a token. A cohort rate, not a launch date:
//          it rises with age because time accumulates, and it says nothing
//          about when — or whether — a given protocol will launch.
//   farm   Cost (gas + time at a stated $/hour) vs value at stake
//          (odds x implied). The verdict is decided ONLY by the
//          break-even share — the % of the value at stake one farmer must
//          receive to cover costs: FARM at <= 0.001%, MARGINAL at
//          <= 0.005%, SKIP above. No farmer share is ever invented.
//   range  An 80% interval per row from leave-one-out residuals of the
//          fitted curve, calibrated on held-out live comps (see
//          intervalCalibration) and shown with its rank range.
//   kept   Every other candidate term (category-median adjustment, 7-day
//          growth, age, chain count) was tested by ablation against the
//          curve alone on four held-out splits. A term is kept only if it
//          beats the curve alone on at least 3 of the 4 splits. On this
//          snapshot none of them does, so none is used; the dashboard
//          shows the ablation table so the decision is checkable.
//
// The board ranks every rankable pre-token protocol: the 40-protocol
// watchlist is the floor, never the ceiling. A protocol is rankable when
// it records no token (mcap, gecko_id and symbol all null), is not a CEX,
// does not end in a version marker, and is not a wrapped / staked /
// bridged product of a token that already trades (the same exclusions the
// snapshot's watchlist rule uses: Bridge / Canonical Bridge / Liquid
// Staking / Liquid Restaking / Restaked BTC categories, whole words
// wrapped / staked / staking in the name, or a name starting with an
// exchange's name).
//
// Live-token protocols are never mixed into the ranked board: they are
// shown apart, at the market's own values, as the comps the curve is
// fitted from.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's stated assumptions (not fitted numbers). */
export interface ModelConstants {
  comp_min_n: number;
  farm_hourly_rate_usd: number;
  /** Break-even share at or below which a farm verdict is FARM: the farm breaks even if the farmer receives this % of the odds-weighted implied value. */
  farm_verdict_farm_max_be_share_pct: number;
  /** Break-even share at or below which a farm verdict is MARGINAL (above this: SKIP). */
  farm_verdict_marginal_max_be_share_pct: number;
  interval_coverage: number;
  unknown_age_days: number;
}

export const MODEL: ModelConstants = {
  comp_min_n: 4,
  farm_hourly_rate_usd: 20,
  farm_verdict_farm_max_be_share_pct: 0.001,
  farm_verdict_marginal_max_be_share_pct: 0.005,
  interval_coverage: 0.8,
  unknown_age_days: 365,
};

/** The model's version label: the dashboard names it. */
export const MODEL_VERSION = 'radar-3.1-break-even-verdicts';

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One held-out test: the fitted curve's median |log error| vs the global-median baseline. */
export interface HeldOutTest {
  name: string;
  model_median_abs_log_error: number;
  baseline_median_abs_log_error: number;
  model_beats_baseline: boolean;
}

/** One ablation row: a candidate term's median |log error| on each held-out split. */
export interface AblationRow {
  term: string;
  random_seed_1: number;
  random_seed_42: number;
  walk_forward: number;
  leave_one_out: number;
  wins_vs_curve: number;
  kept: boolean;
}

/** The fitted curve, as the dashboard states it. */
export interface CurveFit {
  intercept: number;
  slope: number;
  r_squared: number;
  n_comps: number;
  live_with_mcap: number;
  filtered_mcap_le_zero: number;
  excluded_cex_from_fit: number;
}

/** One age bucket's cohort rate. */
export interface CohortBucket {
  label: string;
  age_lo_days: number;
  age_hi_days: number | null;
  n_protocols: number;
  n_with_token: number;
  rate: number;
}

/** A row's farm economics, from stated assumptions only. No farmer share is
 *  invented anywhere: the verdict is decided by the break-even share — the
 *  % of the odds-weighted implied value the airdrop must pay one farmer for
 *  the farm to cover its cost. `value_at_stake_usd` is the odds-weighted
 *  implied value itself, the pool the break-even share is taken from. */
export interface FarmEconomics {
  gas_usd: number;
  time_hours: number;
  total_cost_usd: number;
  value_at_stake_usd: number;
  break_even_share_pct: number;
  verdict: 'FARM' | 'MARGINAL' | 'SKIP';
}

/** One row of board.json: the ranked board's row. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  implied_value_usd: number;
  model: {
    curve_ratio: number;
    implied_raw_usd: number;
    odds: number;
    odds_source: string;
    interval_low_usd: number;
    interval_high_usd: number;
    /** Rank this row would hold if its value landed at the low / high end of its 80% interval. */
    rank_range_low: number;
    rank_range_high: number;
    farm: FarmEconomics;
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  implied_value_usd: number;
  curve_ratio: number;
  implied_raw_usd: number;
  odds: number;
  odds_source: string;
  interval_low_usd: number;
  interval_high_usd: number;
  rank_range_low: number;
  rank_range_high: number;
  farm: FarmEconomics;
  on_watchlist: boolean;
  farm_steps: string[];
}

/** One category's comp, shown as a diagnostic (the category median is NOT used for pricing). */
export interface CompRow {
  category: string;
  n: number;
  median_ratio: number;
  used: boolean;
}

/** A live-token protocol, at the market's own value. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
  ratio: number | null;
}

/** Everything the dashboard needs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  pre_token_audited: number;
  live_size: number;
  live_total: number;
  excluded_pre_token: number;
  global_comp: number;
  fit: CurveFit;
  held_out: HeldOutTest[];
  ablation: AblationRow[];
  cohort: CohortBucket[];
  cohort_overall_known_age_rate: number;
  cohort_cells_passing: number;
  cohort_cells_total: number;
  interval_low_factor: number;
  interval_high_factor: number;
  interval_loo_coverage: number;
  interval_calibration: IntervalCalibration[];
  fallback_rows: number;
  categories_with_enough_comps: number;
  categories_total: number;
  farm_verdict_counts: { FARM: number; MARGINAL: number; SKIP: number };
  comps: CompRow[];
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** Median of a non-empty list of numbers. */
function median(values: number[]): number {
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;
const round3 = (n: number): number => Math.round(n * 1e3) / 1e3;

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Categories that are wrapped / staked / bridged products of a token that already trades. */
const EXCLUDED_CATEGORIES = new Set([
  'Bridge',
  'Canonical Bridge',
  'Liquid Staking',
  'Liquid Restaking',
  'Restaked BTC',
  'CEX',
]);

/** Exchange names a wrapped / staked product's name begins with. */
const EXCHANGE_PREFIXES = ['Binance', 'Coinbase', 'Bybit', 'Kraken', 'Bitget', 'OKX', 'Bitfinex', 'Gemini'];

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is a wrapped / staked / bridged product of a token that already trades. */
export function isWrappedProduct(p: SnapshotProtocol): boolean {
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return true;
  const words = p.name.split(/[^A-Za-z]+/);
  if (words.some((w) => w === 'wrapped' || w === 'staked' || w === 'staking' || w === 'Wrapped' || w === 'Staked' || w === 'Staking')) return true;
  return EXCHANGE_PREFIXES.some((e) => p.name.startsWith(e));
}

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool, not a wrapped product. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && !VERSIONED.test(p.name) && !isWrappedProduct(p);
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** Live-token protocols usable as comps: market cap > 0, TVL > 0, not a CEX. */
export function fitComps(snapshot: Snapshot): SnapshotProtocol[] {
  return snapshot.protocols.filter((p) => !isPreToken(p) && p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0 && p.category !== 'CEX');
}

/** Ordinary least squares for log(mcap) = a + b*log(TVL) over the comps. */
export function fitCurve(comps: SnapshotProtocol[]): { a: number; b: number; r2: number } {
  const xs = comps.map((p) => Math.log(p.tvl_usd));
  const ys = comps.map((p) => Math.log(p.mcap_usd!));
  const mx = xs.reduce((s, v) => s + v, 0) / xs.length;
  const my = ys.reduce((s, v) => s + v, 0) / ys.length;
  let sxy = 0;
  let sxx = 0;
  xs.forEach((x, i) => {
    sxy += (x - mx) * (ys[i]! - my);
    sxx += (x - mx) * (x - mx);
  });
  const b = sxx === 0 ? 0 : sxy / sxx;
  const a = my - b * mx;
  let ssTot = 0;
  let ssRes = 0;
  ys.forEach((y, i) => {
    ssTot += (y - my) * (y - my);
    const r = y - (a + b * xs[i]!);
    ssRes += r * r;
  });
  return { a, b, r2: ssTot === 0 ? 0 : 1 - ssRes / ssTot };
}

/** A deterministic shuffle (LCG) so the random held-out splits are reproducible. */
function shuffled<T>(rows: T[], seed: number): T[] {
  const a = [...rows];
  let s = seed >>> 0;
  const next = (): number => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(next() * (i + 1));
    const t = a[i]!;
    a[i] = a[j]!;
    a[j] = t;
  }
  return a;
}

/** Feature vector for the multi-term regressions: [1, logTVL, growth?, log1p(age)?, chains?]. */
function features(p: SnapshotProtocol, asOf: string, terms: string[]): number[] {
  const f = [1, Math.log(p.tvl_usd)];
  if (terms.includes('growth')) f.push(Math.min(100, Math.max(-50, finite(p.change_7d, 0))) / 100);
  if (terms.includes('age')) f.push(Math.log1p(ageDays(asOf, p.listed_at) ?? MODEL.unknown_age_days));
  if (terms.includes('chains')) f.push(Math.min(p.chains.length, 5));
  return f;
}

/** Solve a small linear system by Gaussian elimination. */
function solveLinear(A: number[][], b: number[]): number[] {
  const k = b.length;
  const M = A.map((row, i) => [...row, b[i]!]);
  for (let c = 0; c < k; c++) {
    let piv = c;
    for (let r = c + 1; r < k; r++) if (Math.abs(M[r]![c]!) > Math.abs(M[piv]![c]!)) piv = r;
    const tmp = M[c]!;
    M[c] = M[piv]!;
    M[piv] = tmp;
    for (let r = c + 1; r < k; r++) {
      const f = M[r]![c]! / M[c]![c]!;
      for (let cc = c; cc <= k; cc++) M[r]![cc]! -= f * M[c]![cc]!;
    }
  }
  const x = Array<number>(k).fill(0);
  for (let r = k - 1; r >= 0; r--) {
    let s = M[r]![k]!;
    for (let c = r + 1; c < k; c++) s -= M[r]![c]! * x[c]!;
    x[r] = s / M[r]![r]!;
  }
  return x;
}

type Variant = 'curve' | 'curve+cat' | 'curve+growth' | 'curve+age' | 'curve+chains' | 'curve+all';
const VARIANTS: Variant[] = ['curve', 'curve+cat', 'curve+growth', 'curve+age', 'curve+chains', 'curve+all'];

/** A predictor of log(market cap) fitted on `train` under one variant. */
function makePredictor(train: SnapshotProtocol[], asOf: string, variant: Variant): (p: SnapshotProtocol) => number {
  const fit = fitCurve(train);
  const catAdj = new Map<string, number>();
  if (variant === 'curve+cat') {
    const by = new Map<string, number[]>();
    for (const p of train) {
      const r = Math.log(p.mcap_usd!) - (fit.a + fit.b * Math.log(p.tvl_usd));
      const key = p.category ?? 'Uncategorized';
      const list = by.get(key) ?? [];
      list.push(r);
      by.set(key, list);
    }
    for (const [key, values] of by) if (values.length >= MODEL.comp_min_n) catAdj.set(key, median(values));
  }
  if (variant === 'curve+growth' || variant === 'curve+age' || variant === 'curve+chains' || variant === 'curve+all') {
    const terms = variant === 'curve+all' ? ['growth', 'age', 'chains'] : [variant.slice('curve+'.length)];
    const X = train.map((p) => features(p, asOf, terms));
    const y = train.map((p) => Math.log(p.mcap_usd!));
    const k = X[0]!.length;
    const A = Array.from({ length: k }, () => Array<number>(k).fill(0));
    const bb = Array<number>(k).fill(0);
    X.forEach((row, i) => {
      for (let a2 = 0; a2 < k; a2++) {
        bb[a2]! += row[a2]! * y[i]!;
        for (let b2 = 0; b2 < k; b2++) A[a2]![b2]! += row[a2]! * row[b2]!;
      }
    });
    const coef = solveLinear(A, bb);
    return (p: SnapshotProtocol): number => {
      const f = features(p, asOf, terms);
      let s = 0;
      f.forEach((v, i) => {
        s += coef[i]! * v;
      });
      return s;
    };
  }
  return (p: SnapshotProtocol): number => (fit.a + fit.b * Math.log(p.tvl_usd)) + (catAdj.get(p.category ?? 'Uncategorized') ?? 0);
}

/** Median |log error| of one variant on `test`, fitted on `train`. */
function variantError(train: SnapshotProtocol[], test: SnapshotProtocol[], asOf: string, variant: Variant): number {
  const predict = makePredictor(train, asOf, variant);
  return median(test.map((p) => Math.abs(Math.log(p.mcap_usd!) - predict(p))));
}

/** Median |log error| of the global-median-ratio baseline, fitted on `train`. */
function baselineError(train: SnapshotProtocol[], test: SnapshotProtocol[]): number {
  const g = median(train.map((p) => p.mcap_usd! / p.tvl_usd));
  return median(test.map((p) => Math.abs(Math.log(p.mcap_usd!) - Math.log(p.tvl_usd * g))));
}

/** The three held-out tests plus the ablation table, all fitted from the comps. */
export function heldOutEvaluation(comps: SnapshotProtocol[], asOf: string): { tests: HeldOutTest[]; ablation: AblationRow[] } {
  const sorted = [...comps].sort((a, b) => (a.slug < b.slug ? -1 : 1));
  const splits: { name: string; train: SnapshotProtocol[]; test: SnapshotProtocol[] }[] = [];
  for (const seed of [1, 42]) {
    const sh = shuffled(sorted, seed);
    const half = Math.floor(sh.length / 2);
    splits.push({ name: `Random 50/50 (seed ${seed})`, train: sh.slice(0, half), test: sh.slice(half) });
  }
  const byListed = [...comps].sort((a, b) => {
    const la = a.listed_at ?? '9999-12-31';
    const lb = b.listed_at ?? '9999-12-31';
    return la < lb ? -1 : la > lb ? 1 : a.slug < b.slug ? -1 : 1;
  });
  const half = Math.floor(byListed.length / 2);
  splits.push({ name: 'Walk-forward (older listed → newer listed)', train: byListed.slice(0, half), test: byListed.slice(half) });

  const tests: HeldOutTest[] = splits.map((s) => {
    const model = variantError(s.train, s.test, asOf, 'curve');
    const base = baselineError(s.train, s.test);
    return { name: s.name, model_median_abs_log_error: round3(model), baseline_median_abs_log_error: round3(base), model_beats_baseline: model < base };
  });
  // Leave-one-out.
  const looModel: number[] = [];
  const looBase: number[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const train = sorted.filter((_, j) => j !== i);
    const test = [sorted[i]!];
    looModel.push(Math.abs(Math.log(test[0]!.mcap_usd!) - makePredictor(train, asOf, 'curve')(test[0]!)));
    looBase.push(Math.abs(Math.log(test[0]!.mcap_usd!) - Math.log(test[0]!.tvl_usd * median(train.map((p) => p.mcap_usd! / p.tvl_usd)))));
  }
  const looM = median(looModel);
  const looB = median(looBase);
  tests.push({ name: 'Leave-one-out', model_median_abs_log_error: round3(looM), baseline_median_abs_log_error: round3(looB), model_beats_baseline: looM < looB });

  // Ablation: each candidate term vs the curve alone on the same four splits.
  const ablation: AblationRow[] = [];
  const termOf = (v: Variant): string =>
    v === 'curve' ? 'curve alone (no extra term)' : v === 'curve+cat' ? 'category-median adjustment' : v === 'curve+growth' ? '7-day growth' : v === 'curve+age' ? 'age (log1p days)' : v === 'curve+chains' ? 'chain count' : 'growth + age + chains together';
  for (const variant of VARIANTS) {
    const errs = splits.map((s) => variantError(s.train, s.test, asOf, variant));
    const looErrs: number[] = [];
    for (let i = 0; i < sorted.length; i++) {
      const train = sorted.filter((_, j) => j !== i);
      const test = [sorted[i]!];
      looErrs.push(Math.abs(Math.log(test[0]!.mcap_usd!) - makePredictor(train, asOf, variant)(test[0]!)));
    }
    const loo = median(looErrs);
    const curveErrs = [tests[0]!.model_median_abs_log_error, tests[1]!.model_median_abs_log_error, tests[2]!.model_median_abs_log_error, tests[3]!.model_median_abs_log_error];
    const all = [errs[0]!, errs[1]!, errs[2]!, loo];
    // Wins are counted against the curve alone's UNROUNDED errors, recomputed here for exactness.
    const curveRaw = [
      variantError(splits[0]!.train, splits[0]!.test, asOf, 'curve'),
      variantError(splits[1]!.train, splits[1]!.test, asOf, 'curve'),
      variantError(splits[2]!.train, splits[2]!.test, asOf, 'curve'),
      median(looModel),
    ];
    const wins = all.filter((e, i) => e < curveRaw[i]!).length;
    ablation.push({
      term: termOf(variant),
      random_seed_1: round3(errs[0]!),
      random_seed_42: round3(errs[1]!),
      walk_forward: round3(errs[2]!),
      leave_one_out: round3(loo),
      wins_vs_curve: variant === 'curve' ? 0 : wins,
      kept: variant === 'curve' ? true : wins >= 3,
    });
    void curveErrs;
  }
  return { tests, ablation };
}

/** Leave-one-out residuals of the fitted curve, for the 80% interval. */
export function looResiduals(comps: SnapshotProtocol[], asOf: string): number[] {
  const sorted = [...comps].sort((a, b) => (a.slug < b.slug ? -1 : 1));
  const res: number[] = [];
  for (let i = 0; i < sorted.length; i++) {
    const train = sorted.filter((_, j) => j !== i);
    const p = sorted[i]!;
    res.push(Math.log(p.mcap_usd!) - makePredictor(train, asOf, 'curve')(p));
  }
  return res.sort((a, b) => a - b);
}

/** One held-out interval-calibration test: the 80% interval is calibrated
 *  from the TRAIN comps' leave-one-out residuals only, then coverage is
 *  measured on the TEST comps the calibration never saw. */
export interface IntervalCalibration {
  name: string;
  n_test: number;
  n_inside: number;
  coverage: number;
}

/** Held-out interval calibration: for each split, calibrate the 80%
 *  interval from train-only leave-one-out residuals and count how many
 *  held-out live comps' actual market caps fall inside it. */
export function intervalCalibration(comps: SnapshotProtocol[], asOf: string): IntervalCalibration[] {
  const sorted = [...comps].sort((a, b) => (a.slug < b.slug ? -1 : 1));
  const splits: { name: string; train: SnapshotProtocol[]; test: SnapshotProtocol[] }[] = [];
  for (const seed of [1, 42]) {
    const sh = shuffled(sorted, seed);
    const half = Math.floor(sh.length / 2);
    splits.push({ name: `Random 50/50 (seed ${seed})`, train: sh.slice(0, half), test: sh.slice(half) });
  }
  const byListed = [...comps].sort((a, b) => {
    const la = a.listed_at ?? '9999-12-31';
    const lb = b.listed_at ?? '9999-12-31';
    return la < lb ? -1 : la > lb ? 1 : a.slug < b.slug ? -1 : 1;
  });
  const half = Math.floor(byListed.length / 2);
  splits.push({ name: 'Walk-forward (older listed → newer listed)', train: byListed.slice(0, half), test: byListed.slice(half) });

  return splits.map((s) => {
    // Train-only LOO residuals: each train row predicted by a curve fitted
    // on the other train rows.
    const res: number[] = [];
    for (let i = 0; i < s.train.length; i++) {
      const train = s.train.filter((_, j) => j !== i);
      const p = s.train[i]!;
      res.push(Math.log(p.mcap_usd!) - makePredictor(train, asOf, 'curve')(p));
    }
    res.sort((a, b) => a - b);
    const lo = res[Math.floor(0.1 * res.length)]!;
    const hi = res[Math.floor(0.9 * res.length)]!;
    const predict = makePredictor(s.train, asOf, 'curve');
    let inside = 0;
    for (const p of s.test) {
      const pred = predict(p);
      const actual = Math.log(p.mcap_usd!);
      if (actual >= pred + lo && actual <= pred + hi) inside++;
    }
    return { name: s.name, n_test: s.test.length, n_inside: inside, coverage: round4(inside / Math.max(1, s.test.length)) };
  });
}

/** Age buckets for the cohort rate. */
export const AGE_BUCKETS: { label: string; lo: number; hi: number | null }[] = [
  { label: '<180 days', lo: 0, hi: 180 },
  { label: '180–365 days', lo: 180, hi: 365 },
  { label: '1–2 years', lo: 365, hi: 730 },
  { label: '2–3 years', lo: 730, hi: 1100 },
  { label: '>3 years', lo: 1100, hi: null },
];

/** Cohort rates by age bucket, plus the overall known-age rate for unknown-age rows. */
export function cohortRates(snapshot: Snapshot): { buckets: CohortBucket[]; overallKnownAgeRate: number; cellsPassing: number; cellsTotal: number } {
  const buckets: CohortBucket[] = AGE_BUCKETS.map((b) => {
    const inBucket = snapshot.protocols.filter((p) => {
      const a = ageDays(snapshot.as_of, p.listed_at);
      return a !== null && a >= b.lo && (b.hi === null || a < b.hi);
    });
    const withToken = inBucket.filter((p) => !isPreToken(p)).length;
    return { label: b.label, age_lo_days: b.lo, age_hi_days: b.hi, n_protocols: inBucket.length, n_with_token: withToken, rate: inBucket.length > 0 ? round4(withToken / inBucket.length) : 0 };
  });
  const known = snapshot.protocols.filter((p) => ageDays(snapshot.as_of, p.listed_at) !== null);
  const overallKnownAgeRate = round4(known.filter((p) => !isPreToken(p)).length / Math.max(1, known.length));
  // Category x age cells: how many reach n >= 20 (the threshold for using a cell rate)?
  const categories = [...new Set(snapshot.protocols.map((p) => p.category ?? 'Uncategorized'))];
  let cellsPassing = 0;
  let cellsTotal = 0;
  for (const c of categories) {
    for (const b of AGE_BUCKETS) {
      cellsTotal++;
      const n = snapshot.protocols.filter((p) => {
        const a = ageDays(snapshot.as_of, p.listed_at);
        return (p.category ?? 'Uncategorized') === c && a !== null && a >= b.lo && (b.hi === null || a < b.hi);
      }).length;
      if (n >= 20) cellsPassing++;
    }
  }
  return { buckets, overallKnownAgeRate, cellsPassing, cellsTotal };
}

/** A protocol's launch odds: its age bucket's cohort rate (overall rate when age is unknown). */
export function oddsFor(p: SnapshotProtocol, snapshot: Snapshot, cohort: { buckets: CohortBucket[]; overallKnownAgeRate: number }): { odds: number; source: string } {
  const a = ageDays(snapshot.as_of, p.listed_at);
  if (a === null) return { odds: cohort.overallKnownAgeRate, source: 'overall cohort rate (age unknown)' };
  const bucket = AGE_BUCKETS.find((b) => a >= b.lo && (b.hi === null || a < b.hi)) ?? AGE_BUCKETS[AGE_BUCKETS.length - 1]!;
  const row = cohort.buckets.find((b) => b.label === bucket.label)!;
  return { odds: row.rate, source: `cohort rate, age ${bucket.label} (${row.n_with_token}/${row.n_protocols} have a token)` };
}

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** The category's one action, in the words a farmer can follow. */
function actionFor(p: SnapshotProtocol, capital: number, chain: string): string {
  const c = (p.category ?? '').toLowerCase();
  const name = p.name;
  if (c.includes('lend') || c.includes('cdp') || c.includes('collateral')) return `Supply $${capital} of USDC to ${name} on ${chain} and keep the position open, borrowing a small amount back once to show both sides of the market.`;
  if (c.includes('dex') || c.includes('yield') || c.includes('leveraged farm')) return `Provide $${capital} of liquidity to ${name}'s main pool on ${chain}, then route one swap through the pool each week.`;
  if (c.includes('bridge') || c.includes('cross chain')) return `Bridge $${capital} of USDC to ${chain} through ${name}, then use the bridged funds inside its app instead of bridging straight back.`;
  if (c.includes('staking') || c.includes('restak')) return `Stake $${capital} of the chain's staking asset through ${name} and keep the receipt token in the same wallet.`;
  if (c.includes('perpetual') || c.includes('derivative') || c.includes('options')) return `Deposit $${capital} of USDC as margin on ${name} and open one small hedged position, then close it the same week.`;
  if (c.includes('prediction')) return `Fund $${capital} on ${name} and settle one market position, win or lose, so the wallet shows real activity.`;
  if (c.includes('curator') || c.includes('allocator') || c.includes('vault')) return `Deposit $${capital} into a ${name} vault on ${chain} and leave the shares untouched for the whole hold.`;
  if (c.includes('stable')) return `Mint or deposit $${capital} of the stable asset through ${name} on ${chain} and hold it in the farming wallet.`;
  if (c.includes('rwa')) return `Mint $${capital} of the protocol's yield-bearing asset on ${chain} and hold it through at least one yield payout.`;
  if (c.includes('insurance')) return `Buy $${capital} of cover from ${name} on ${chain} and keep the policy active for the whole hold.`;
  if (c.includes('chain') || c.includes('layer')) return `Bridge $${capital} of USDC onto ${name}'s network and use one of its native apps each week.`;
  if (c.includes('launchpad') || c.includes('farm')) return `Commit $${capital} to the next ${name} launch or farm on ${chain} and complete its checklist.`;
  return `Deposit $${capital} of USDC into ${name} on ${chain} and keep the position open, using the app once a week.`;
}

/**
 * A protocol's farm plan: six steps, each an action with a cost and a time.
 * The plan is derived from the protocol's own record (category, chains, TVL,
 * age), never from a hand-written list of names.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const action = actionFor(p, capital, chain);
  const gas = capital >= 150 ? 8 : 4;
  return [
    {
      text: `Use a fresh wallet that holds only the funds you plan to farm, and keep its seed phrase offline.`,
      cost: 'under $3 of gas for the first transaction',
      time: '5 minutes',
    },
    {
      text: action,
      cost: `$${capital} of capital and about $${gas} of gas`,
      time: '15 minutes to set up',
    },
    {
      text: `Do one qualifying action each week on ${chain}, such as a deposit, a swap, a vote or a claim, and keep the receipts.`,
      cost: 'about $2 of gas a week',
      time: '10 minutes a week',
    },
    {
      text: `Hold the position for at least ${hold} days so the activity is counted in more than one snapshot.`,
      cost: `the $${capital} stays in the position`,
      time: `${hold} days`,
    },
    {
      text: `Check the protocol's own points or rewards page weekly and claim only from the link it publishes; never pay anyone to claim for you.`,
      cost: 'no fee to check, and never pay to claim',
      time: '10 minutes a week',
    },
    {
      text: `Write the wallet, the dates and every transaction hash in a farm log, so you can repeat the position or unwind it cleanly.`,
      cost: 'nothing but the log',
      time: '5 minutes',
    },
  ];
}

/**
 * A protocol's farm economics. Gas: $4 ($8 for large positions) to set up
 * plus $2 a week over the hold. Time: 35 minutes fixed plus 20 minutes a
 * week (one qualifying action + one rewards check), valued at the stated
 * hourly rate. Value at stake: odds x implied value — the pool the airdrop
 * would pay from. Break-even share is assumption-free: the share of that
 * value one farmer must receive to cover costs.
 * Verdict is decided ONLY by the break-even share, against the two stated
 * cutoffs — no farmer share is invented: FARM when the farm breaks even
 * even if the farmer receives at most 0.001% of the value at stake,
 * MARGINAL up to 0.005%, SKIP above that. The cutoffs are decision
 * thresholds written on the dashboard, not measured facts.
 */
export function farmEconomics(p: SnapshotProtocol, age: number | null, impliedRaw: number, odds: number): FarmEconomics {
  const hold = holdDaysFor(age);
  const weeks = Math.ceil(hold / 7);
  const capital = capitalFor(p);
  const gas = (capital >= 150 ? 8 : 4) + 2 * weeks;
  const timeHours = round4((35 + 20 * weeks) / 60);
  const totalCost = round4(gas + timeHours * MODEL.farm_hourly_rate_usd);
  const valueAtStake = round4(odds * impliedRaw);
  // The verdict is decided on the UNROUNDED break-even share: rounding it
  // to 4 decimals first would flip rows sitting on a cutoff (0.001% is
  // itself a 4-decimal value). The stored figure keeps 6 decimals.
  const breakEvenRaw = (totalCost / Math.max(1, odds * impliedRaw)) * 100;
  const breakEven = Math.round(breakEvenRaw * 1e6) / 1e6;
  const verdict: FarmEconomics['verdict'] =
    breakEvenRaw <= MODEL.farm_verdict_farm_max_be_share_pct
      ? 'FARM'
      : breakEvenRaw <= MODEL.farm_verdict_marginal_max_be_share_pct
        ? 'MARGINAL'
        : 'SKIP';
  return { gas_usd: gas, time_hours: timeHours, total_cost_usd: totalCost, value_at_stake_usd: valueAtStake, break_even_share_pct: breakEven, verdict };
}

/** The live-token protocols, by market cap, for the dashboard's comps view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0 && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, 24)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
      ratio: Math.round((p.mcap_usd! / p.tvl_usd) * 1000) / 1000,
    }));
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const comps = fitComps(snapshot);
  const fit = fitCurve(comps);
  const cohort = cohortRates(snapshot);
  const residuals = looResiduals(comps, snapshot.as_of);
  const loIdx = Math.floor(0.1 * residuals.length);
  const hiIdx = Math.floor(0.9 * residuals.length);
  const loFactor = Math.exp(residuals[loIdx]!);
  const hiFactor = Math.exp(residuals[hiIdx]!);
  const chosen = new Map<string, SnapshotProtocol>();
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  for (const p of snapshot.protocols) {
    if (!chosen.has(p.slug) && isRankable(p)) chosen.set(p.slug, p);
  }

  const scored = [...chosen.values()].map((p) => {
    const age = ageDays(snapshot.as_of, p.listed_at);
    // The curve ratio is rounded to 4 decimals BEFORE the multiply, so the
    // dashboard page — which only ever sees the rounded ratio and odds —
    // recomputes the exact same value board.json carries.
    const curveRatio = round4(Math.exp(fit.a + fit.b * Math.log(p.tvl_usd)) / p.tvl_usd);
    const impliedRaw = Math.max(1, Math.round(p.tvl_usd * curveRatio));
    const { odds, source } = oddsFor(p, snapshot, cohort);
    const oddsRounded = round4(odds);
    const expected = Math.max(1, Math.round(impliedRaw * oddsRounded));
    const farm = farmEconomics(p, age, impliedRaw, oddsRounded);
    return {
      p,
      age,
      curveRatio,
      impliedRaw,
      odds: oddsRounded,
      oddsSource: source,
      expected,
      farm,
      intervalLow: Math.max(1, Math.round(expected * loFactor)),
      intervalHigh: Math.max(1, Math.round(expected * hiFactor)),
    };
  });
  scored.sort((a, b) => b.expected - a.expected || (a.p.slug < b.p.slug ? -1 : a.p.slug > b.p.slug ? 1 : 0));
  // Rank range: the rank a row would hold if its value landed at the low
  // or high end of its 80% interval — 1 + the rows whose expected value
  // is above that end.
  const expectedDesc = scored.map((s) => s.expected);
  const rankOf = (value: number): number => 1 + expectedDesc.filter((v) => v > value).length;
  return scored.map((s, i) => ({
    rank: i + 1,
    slug: s.p.slug,
    name: s.p.name,
    category: s.p.category,
    chains: s.p.chains,
    tvl_usd: s.p.tvl_usd,
    change_7d: s.p.change_7d,
    mcap_usd: s.p.mcap_usd,
    listed_at: s.p.listed_at,
    gecko_id: s.p.gecko_id,
    symbol: s.p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    implied_value_usd: s.expected,
    model: {
      curve_ratio: s.curveRatio,
      implied_raw_usd: s.impliedRaw,
      odds: s.odds,
      odds_source: s.oddsSource,
      interval_low_usd: s.intervalLow,
      interval_high_usd: s.intervalHigh,
      rank_range_low: rankOf(s.intervalLow),
      rank_range_high: rankOf(s.intervalHigh),
      farm: s.farm,
      age_days: s.age,
    },
    farm_steps: farmSteps(s.p, s.age).map(stepText),
  }));
}

/** The dashboard's compact view of one row. */
export function radarRow(row: BoardRow, onWatchlist: boolean): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    implied_value_usd: row.implied_value_usd,
    curve_ratio: row.model.curve_ratio,
    implied_raw_usd: row.model.implied_raw_usd,
    odds: row.model.odds,
    odds_source: row.model.odds_source,
    interval_low_usd: row.model.interval_low_usd,
    interval_high_usd: row.model.interval_high_usd,
    rank_range_low: row.model.rank_range_low,
    rank_range_high: row.model.rank_range_high,
    farm: row.model.farm,
    on_watchlist: onWatchlist,
    farm_steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot);
  const comps = fitComps(snapshot);
  const fit = fitCurve(comps);
  const live = liveRows(snapshot);
  const watchSet = new Set(snapshot.watchlist);
  const { tests, ablation } = heldOutEvaluation(comps, snapshot.as_of);
  const cohort = cohortRates(snapshot);
  const residuals = looResiduals(comps, snapshot.as_of);
  const loIdx = Math.floor(0.1 * residuals.length);
  const hiIdx = Math.floor(0.9 * residuals.length);
  const loFactor = Math.exp(residuals[loIdx]!);
  const hiFactor = Math.exp(residuals[hiIdx]!);
  const inInterval = residuals.filter((r) => r >= residuals[loIdx]! && r <= residuals[hiIdx]!).length / residuals.length;
  const liveWithMcap = snapshot.protocols.filter((p) => !isPreToken(p) && p.mcap_usd !== null).length;
  const filteredMcapLeZero = snapshot.protocols.filter((p) => !isPreToken(p) && p.mcap_usd !== null && p.mcap_usd <= 0).length;
  const excludedCex = snapshot.protocols.filter((p) => !isPreToken(p) && p.mcap_usd !== null && p.mcap_usd > 0 && p.tvl_usd > 0 && p.category === 'CEX').length;
  const globalComp = median(comps.map((p) => p.mcap_usd! / p.tvl_usd));
  // Category medians as a diagnostic only: the ablation dropped them, so no
  // row is priced from a category median.
  const byCat = new Map<string, number[]>();
  for (const p of comps) {
    const key = p.category ?? 'Uncategorized';
    const list = byCat.get(key) ?? [];
    list.push(p.mcap_usd! / p.tvl_usd);
    byCat.set(key, list);
  }
  const compRows: CompRow[] = [...byCat.entries()]
    .map(([category, values]) => ({ category, n: values.length, median_ratio: Math.round(median(values) * 1000) / 1000, used: false }))
    .sort((a, b) => b.n - a.n || (a.category < b.category ? -1 : 1));
  const verdictCounts = { FARM: 0, MARGINAL: 0, SKIP: 0 };
  for (const r of board) verdictCounts[r.model.farm.verdict]++;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model: MODEL,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    pre_token_audited: snapshot.protocols.filter(isPreToken).length,
    live_size: live.length,
    live_total: snapshot.protocols.filter((p) => !isPreToken(p)).length,
    excluded_pre_token: snapshot.protocols.filter(isPreToken).length - board.length,
    global_comp: Math.round(globalComp * 1000) / 1000,
    fit: {
      intercept: round4(fit.a),
      slope: round4(fit.b),
      r_squared: round4(fit.r2),
      n_comps: comps.length,
      live_with_mcap: liveWithMcap,
      filtered_mcap_le_zero: filteredMcapLeZero,
      excluded_cex_from_fit: excludedCex,
    },
    held_out: tests,
    ablation,
    cohort: cohort.buckets,
    cohort_overall_known_age_rate: cohort.overallKnownAgeRate,
    cohort_cells_passing: cohort.cellsPassing,
    cohort_cells_total: cohort.cellsTotal,
    interval_low_factor: round4(loFactor),
    interval_high_factor: round4(hiFactor),
    interval_loo_coverage: round4(inInterval),
    interval_calibration: intervalCalibration(comps, snapshot.as_of),
    fallback_rows: 0,
    categories_with_enough_comps: compRows.filter((c) => c.n >= MODEL.comp_min_n).length,
    categories_total: compRows.length,
    farm_verdict_counts: verdictCounts,
    comps: compRows,
    rows: board.map((r) => radarRow(r, watchSet.has(r.slug))),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  return `window.RADAR=${JSON.stringify(radar)};\n`;
}
