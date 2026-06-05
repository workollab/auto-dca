# Auto DCA

**Browser-native decline-curve analysis for oil & gas wells.** Load production data, get an
Arps fit, forecast, and EUR in seconds — the entire computation runs in your browser, so
your production data never leaves your machine.

> **Live demo: [autodca-demo.nrgnr.app](https://autodca-demo.nrgnr.app)** — or self-host in
> minutes ([`docs/DEPLOY.md`](docs/DEPLOY.md)).

Auto DCA is a from-scratch TypeScript rebuild of Equinor's open
[`decline-curve-analysis`](https://github.com/equinor/decline-curve-analysis) (MIT). The
rebuilt engine is validated numerically against the original Python: on real North Sea
fields it reproduces Equinor's fitted curves to within **0.02 parts per million**.

## What it does

- **Auto model selection** — fits Arps exponential, hyperbolic, and harmonic, then picks the
  model with the best **cross-validated** forecast skill (expanding-window; AICc as fallback).
- **Terminal decline** — optional Modified-Arps (hyperbolic → exponential at a minimum decline
  `Dmin`), the SPE-standard guard against over-booking reserves.
- **Forecast + EUR** — projects future rate and Estimated Ultimate Recovery three ways: to
  infinity (when finite), to a time horizon, and to an economic-limit rate.
- **CSV upload + samples** — drop your own `(date, rate)` CSV, or try bundled real wells from
  the Norwegian Continental Shelf (SODIR open data).
- **Diagnostics & confidence** — R², RMSE, model comparison, and a residual-bootstrap
  confidence band.
- **Private by design** — 100% client-side. No backend, no upload, no signup.

## Using the demo

Open **[autodca-demo.nrgnr.app](https://autodca-demo.nrgnr.app)** (or run it locally — see
[Develop](#develop)). Then:

1. **Load data.** Click a sample North Sea well, or drop in your own CSV
   (see [Bring your own data](#bring-your-own-data)). Everything runs in your browser —
   nothing is uploaded.
2. **Watch it fit.** The engine tries each Arps family (exponential → harmonic → hyperbolic)
   and fine-tunes the parameters; the curve morphs toward the data and the loss ticks down,
   then it settles on the model with the best cross-validated forecast.
3. **Set the economics.** Enter an **economic limit** (abandonment rate) — EUR is integrated
   until production drops to it. Toggle **terminal decline** (default 6 %/yr) to switch the
   hyperbolic tail to exponential once decline slows, keeping reserves honest.
4. **Read the results.**
   - *Best model* — `qᵢ` (initial rate), `b` (Arps exponent), `Dᵢ` (decline), effective
     annual decline.
   - *EUR* — to economic limit, to infinity (when finite), and to the forecast horizon.
   - *Fit quality* — R², RMSE, and how the model was selected.
   - *Model comparison* — all three families ranked, with the winner highlighted.
   - The chart shows history (dots), the fit + forecast (line), an 80 % confidence band, and
     markers for the forecast start, terminal-decline switch, and economic limit.
5. **Export.** Download the forecast (rate + cumulative) as CSV.

### Bring your own data

Drop a CSV with a **time** column and a **rate** column (a header row is required). Columns are
auto-detected; commas/quotes in numbers are handled.

```csv
date,oil_rate
2018-01,1240
2018-02,1135
2018-03,1061
2018-04,998
```

- **Time column** — a date (`YYYY-MM`, `YYYY-MM-DD`, or `MM/DD/YYYY`) or a plain number
  (elapsed periods). Detected from a header like `date`, `month`, `time`, `period`, or `day`;
  otherwise the first column is used. Dates are converted to elapsed **months**.
- **Rate column** — production per period. Detected from a header containing `rate`, `oil`,
  `gas`, `prod`, `q`, `bbl`, `boe`, `sm3`, `mcf`, `volume`, …; otherwise a numeric column is
  used. Units are yours — EUR comes out in `rate × time` units.
- **Tips** — give at least 4 positive points; start at or near **peak** production (DCA models
  the decline, not the build-up); non-positive and blank rows are dropped automatically.

## How it works

Faithful to Equinor's approach (full equations in [`docs/MATH_SPEC.md`](docs/MATH_SPEC.md)).
The pipeline:

1. **Clean & align** — keep positive rates, sorted by time. (Best results come from data that
   starts near peak production.)
2. **Fit** each Arps family in **log-space** with a robust **p-norm loss** (p = 1.4, less
   sensitive to noise than least squares), over an unbounded reparametrization so the optimizer
   never fights box constraints. Solved with a from-scratch **Nelder-Mead** simplex + multi-
   start, then mapped back to engineering parameters `(qᵢ, Dᵢ, b)`.
3. **Select** the family with the lowest **expanding-window cross-validation** error — train on
   a growing prefix, score the next slice, average over folds. This rewards genuine forecast
   skill and is robust to late-life anomalies (infill drilling, recompletions) that fool a
   single train/test split. AICc breaks ties and covers very short series.
4. **Forecast** forward, optionally applying **Modified-Arps terminal decline**: once the
   hyperbolic decline slows to `Dmin`, switch to exponential at that rate (a smooth, C¹ join).
5. **EUR** — integrate to the economic limit, to a horizon, and (when finite) to infinity, and
   draw a residual-bootstrap confidence band around the forecast.

The whole engine is validated against Equinor's Python reference on real fields — matching the
fitted curves to within **0.02 ppm** (see `engine/test`).

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
npm run test:engine    # 34 tests: closed-form, CSV, terminal decline, and parity vs. Equinor
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

const result = autoDCA(t, q, {
  economicLimit: 50,      // abandonment rate
  terminalDecline: 0.005, // optional Dmin (nominal, per time unit) — Modified Arps
});
result.selection.best.model;        // 'hyperbolic'
result.selection.best.fit.params;   // { qi, Di, b }
result.forecast.eur.toEconomicLimit;
result.forecast.terminalSwitchTime; // when hyperbolic -> exponential kicks in
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
