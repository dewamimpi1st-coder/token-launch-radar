# token-launch-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/dewamimpi1st-coder/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/dewamimpi1st-coder/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Launch Radar (radar-3.1) ranks pre-token DeFi protocols by an odds-weighted, curve-implied launch value: a log-log curve `log(mcap) = a + b·log(TVL)` fitted by least squares on the snapshot's own live-token comps on every run (a ≈ 7.79, b ≈ 0.47, R² ≈ 0.14 on the current snapshot — the coefficients are recomputed each run, never hard-coded), times the cohort launch odds for the protocol's age bucket. Every candidate term (category median, 7-day growth, age, chain count) was tested by ablation on four held-out splits and dropped, because none beat the curve alone on ≥3 of 4 splits; the dashboard shows the held-out tests, the ablation table, an integrity strip, an 80% interval per row (with its rank range, and a held-out calibration test: interval fitted on train comps only, coverage counted on test comps — 78.3% / 86.7% on random splits, 65.0% walk-forward), and a costed farm verdict (FARM / MARGINAL / SKIP) for every protocol decided only by the break-even share — the % of the odds-weighted implied value one farmer must receive to cover gas + time at $20/h (FARM ≤0.001%, MARGINAL ≤0.005%, SKIP above) — with a concrete six-step farm plan with cost and time. No farmer share is invented anywhere.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <path-to-snapshot.json>
```

`main.ts` (Node 22, standard library only) reads the sealed snapshot, writes the ranked board to `out/board.json`, the dashboard data to `out/data.js`, and copies `dashboard/` and `screenshots/` to `out/`, then writes `out/dossier.json` with the vendored make.fun library. Open `out/dashboard/index.html` in a browser to use the dashboard.

---

<sub>Entered on [make.fun](https://make.fun/?ref=a23jzwmt&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
