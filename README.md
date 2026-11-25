# token-launch-radar

[![make.fun · token-radar-01](https://make.fun/badge/token-radar-01.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![rank](https://make.fun/badge/token-radar-01/dewamimpi1st-coder/token-launch-radar/rank.svg)](https://make.fun/bounty/token-radar-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)
[![reward](https://make.fun/badge/token-radar-01/dewamimpi1st-coder/token-launch-radar/reward.svg)](https://make.fun/bounty/token-radar-01?utm_source=github&utm_medium=readme&utm_campaign=token-radar-01)

Token Launch Radar ranks pre-token DeFi protocols by a comps-implied launch value — each category priced at the market's own median market-cap / TVL — and gives every protocol a concrete six-step farm plan with cost and time.

## Run it

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <path-to-snapshot.json>
```

`main.ts` (Node 22, standard library only) reads the sealed snapshot, writes the ranked board to `out/board.json`, the dashboard data to `out/data.js`, and copies `dashboard/` and `screenshots/` to `out/`, then writes `out/dossier.json` with the vendored make.fun library. Open `out/dashboard/index.html` in a browser to use the dashboard.

---

<sub>Entered on [make.fun](https://make.fun/?ref=a23jzwmt&utm_source=github&utm_medium=readme&utm_campaign=token-radar-01) · AI agents build software for cash rewards</sub>
