# Auto DCA

**Browser-native decline-curve analysis for oil & gas wells.** Load production data, get an
Arps fit, forecast, and EUR in seconds — the entire computation runs in your browser, so
your production data never leaves your machine.

> Live demo: _(deploys to workollab-02 — see `docs/DEPLOY.md`)_

Auto DCA is a from-scratch TypeScript rebuild of Equinor's open
[`decline-curve-analysis`](https://github.com/equinor/decline-curve-analysis) (MIT). The
rebuilt engine is validated numerically against the original Python: on real North Sea
fields it reproduces Equinor's fitted curves to within **0.02 parts per million**.

## What it does

- **Auto model selection** — fits Arps exponential, hyperbolic, and harmonic, then picks the
  model that best forecasts a held-out tail (AICc as fallback).
- **Forecast + EUR** — projects future rate and Estimated Ultimate Recovery three ways: to
  infinity (when finite), to a time horizon, and to an economic-limit rate.
- **CSV upload + samples** — drop your own `(date, rate)` CSV, or try bundled real wells from
  the Norwegian Continental Shelf (SODIR open data).
- **Diagnostics & confidence** — R², RMSE, model comparison, and a residual-bootstrap
  confidence band.
- **Private by design** — 100% client-side. No backend, no upload, no signup.

## How the math works

Faithful to Equinor's approach (see [`docs/MATH_SPEC.md`](docs/MATH_SPEC.md)): models are fit
in **log-space** with a robust **p-norm loss** (p = 1.4), over an unbounded reparametrization
so the optimizer never fights box constraints, then mapped back to engineering parameters
`(qᵢ, Dᵢ, b)`. Optimization is a from-scratch Nelder-Mead simplex with multi-start.

## Repo layout

```
engine/      @workollab/auto-dca-engine — dependency-free TS DCA engine + parity tests
app/         Vite + React + Tailwind demo (consumes the engine)
reference/   Equinor's decline-curve-analysis (vendored, MIT) + golden-output generator
docs/        MATH_SPEC.md · BUILD_LOG.md · DEPLOY.md
```

## Develop

```bash
npm install            # workspace install (engine + app)
npm run build:engine   # compile the engine to engine/dist
npm run test:engine    # 31 tests: closed-form, CSV, and parity vs. Equinor
npm run dev            # demo at http://localhost:5173
npm run build          # production build -> app/dist (static)
```

Regenerate the golden fixtures + sample wells from the Python reference:

```bash
cd reference && uv venv --python 3.12 .venv && source .venv/bin/activate
uv pip install numpy scipy pandas
python generate_golden.py
```

## Engine API

```ts
import { autoDCA } from '@workollab/auto-dca-engine';

const t = [0, 1, 2, 3, /* … months */];
const q = [1000, 940, 890, 850, /* … rate */];

const result = autoDCA(t, q, { economicLimit: 50 });
result.selection.best.model;        // 'hyperbolic'
result.selection.best.fit.params;   // { qi, Di, b }
result.forecast.eur.toEconomicLimit;
result.band;                        // 80% confidence band
```

## Attribution & licenses

- Engine + app: **MIT** © Workollab — see [`LICENSE`](LICENSE).
- Rebuilt from Equinor's `decline-curve-analysis` (MIT, © 2025 Equinor).
- Sample wells: **SODIR** (Norwegian Offshore Directorate) open data, under the
  [Norwegian Licence for Open Government Data (NLOD)](https://data.norge.no/nlod/en).

See [`NOTICE.md`](NOTICE.md) for full attribution.

This is a technical demo, not reserves advice.

---

Built by [Workollab](https://workollab.com) — agentic AI & software for small operators.
