# Auto DCA — Build Log

Running journal of how Workollab rebuilt Equinor's `decline-curve-analysis` into a
browser-native Auto DCA engine. Terse, dated, honest — including dead ends.

---

## 2026-06-05 — Phase 0: Capture & math spec

**Goal:** understand Equinor's library well enough to rebuild the math from scratch, and
stand up a reference oracle for parity testing.

What we did:

- Vendored `equinor/decline-curve-analysis` (MIT, © 2025 Equinor) into `reference/` with
  license preserved. Read the core: `decline_curve_analysis.py` (curves + loss),
  `optimization.py` (bounded optimization plumbing), `models.py` (auto/CV layer).
- **Key findings about how Equinor actually does DCA** (this is the story):
  - Not naive least-squares. They fit in **log space** with a robust **p-norm loss**
    (`p∈[1,2]`, default **1.4**), optional **half-life time-decay weights** (recent data
    weighted more), and a Gaussian prior. Optimized with BFGS + analytic gradient,
    Nelder-Mead fallback.
  - Arps is reparametrized to **unbounded** `(θ₁,θ₂,θ₃)` (Lee et al., Bayesian Hierarchical
    Modeling) so the optimizer never fights box constraints. Clean identity falls out:
    **`exp(θ₁) = ∫₀^∞ μ dt = EUR`** in model units.
  - "Auto" = cross-validating the hyperparameters and picking the curve that forecasts the
    held-out tail best.
- Wrote `docs/MATH_SPEC.md` — the exact equations (exp / hyperbolic / harmonic), the
  θ↔(qᵢ,D,b) mapping, cumulative/EUR closed forms, the loss, and the **parity contract**.
- Stood up a Python 3.12 venv (numpy/scipy/pandas), confirmed the `dca` package fits a
  synthetic Arps well (recovered q₁≈1059 vs 1000, b≈0.50, D≈0.084 vs 0.08 under 5% noise).
- Wrote `reference/generate_golden.py` → fits synthetic cases (known truth) + 6 real
  **Norwegian Continental Shelf** fields (SODIR open data, NLOD licence) with an explicit
  reproducible config (p=1.4, no prior, no weights) and dumps:
  - `engine/test/golden/*.json` — oracle for TS parity tests
  - `app/public/samples/wells.json` — real wells bundled into the demo

Real fields fitted (oil, from production peak):

| Field      | n   | b (hyp) | Dᵢ/mo  |
|------------|-----|---------|--------|
| Gullfaks   | 369 | 0.341   | 0.0173 |
| Statfjord  | 402 | 0.164   | 0.0172 |
| Oseberg    | 357 | 0.676   | 0.0285 |
| Draugen    | 310 | 0.357   | 0.0193 |
| Gyda       | 306 | 0.000   | 0.0146 | → collapses to exponential
| Varg       | 196 | 0.000   | 0.0072 | → collapses to exponential

The Gyda/Varg collapse (b→0, and `loss_hyperbolic == loss_exponential`) is a free
correctness check: the hyperbolic model correctly degenerates to exponential when that's
the better fit.

**Decision:** the engine is **client-side TypeScript** — the whole fit runs in the browser.
Rationale: leanest hosting (static files, no server), and the privacy angle is a real
feature for oil & gas — *your production data never leaves your browser*. We keep Equinor's
Python as a local oracle and validate numerically against it; that parity number is the
spine of the article.

Next: Phase 1 — implement the TS engine and pass the parity contract.

---

## 2026-06-05 — Phase 1: The TypeScript engine

**Goal:** rebuild the decline math + auto-fit in dependency-free TypeScript, and prove it
matches Equinor numerically.

Built `engine/` (`@workollab/auto-dca-engine`), zero runtime deps:

- `models.ts` — Exponential, Hyperbolic, Harmonic. Each defined via **log-rate** and fit
  over an **unbounded** parameter vector (no box constraints for the optimizer), then mapped
  back to engineering `(qᵢ, Dᵢ, b)`. Closed-form cumulative, EUR, and economic-limit time.
  Ported Equinor's numerically-stable `log1pexp`.
- `loss.ts` — the **exact** p-norm log-space loss (`Σ wᵢ|log μ − log y|^p`), half-life
  time-decay weights, optional prior. Defaults to Equinor's p=1.4.
- `optimize.ts` — a from-scratch **Nelder-Mead** simplex (scipy coefficients) + multi-start.
- `fit.ts` / `diagnostics.ts` — single-model fit; R², RMSE, AICc; **residual-bootstrap
  confidence band** (honest for the robust loss).
- `auto.ts` — the "auto": fit all three, rank by **held-out forecast error**, AICc fallback.
- `forecast.ts` — forecast curve + EUR three ways (∞, horizon, economic limit).
- `csv.ts` — CSV ingestion with date/rate column auto-detection.

**Parity result (the headline).** Refitting every golden case with the engine (identical
config: p=1.4, no prior, uniform weights) and comparing the fitted curve μ(t) against the
Python reference:

| case set        | worst curve deviation | loss Δ (relative) |
|-----------------|-----------------------|-------------------|
| synthetic       | 6.0e-3 ppm            | ~1e-15            |
| real SODIR wells| 1.9e-2 ppm            | ~1e-15            |

**Worst case across everything: 0.019 ppm (1.9×10⁻⁶ %).** b-factors match to 3 decimals
(Gullfaks 0.341/0.341, Oseberg 0.676/0.676, …). The degenerate wells (Gyda, Varg) collapse
to exponential in both implementations (b=0.000, identical loss).

So: a clean-room TypeScript rewrite, fit in a *different* parametrization, lands on the
*same* curves as Equinor's scipy code to within two parts per hundred million — on real
North Sea production. 26/26 tests green.

Next: Phase 2 — wrap the engine in a browser demo anyone can use.

---

## 2026-06-05 — Phase 2: The browser demo

**Goal:** a demo anyone can use — pick a well or drop a CSV, see the fit, forecast, EUR and
diagnostics — with zero backend.

Built `app/` (Vite + React + TypeScript + Tailwind), consuming the engine through an npm
workspace. On-brand with the Workollab palette (dark `#0a0c12`, blue `#6cb6ff` forecast,
green `#6dd3a3` production).

- **Hand-rolled SVG decline chart** — no charting library. History dots, fit+forecast line,
  forecast-region shading, residual-bootstrap band, history/forecast split marker, economic-
  limit marker, log/linear toggle. Keeps the bundle tiny.
- `Uploader` — bundled SODIR sample wells (fetched from `public/samples/wells.json`),
  drag-drop / click / paste CSV with column auto-detection.
- `ResultCards` — chosen model + Arps params, EUR three ways, fit quality.
- `ModelTable` — all three candidates ranked, best highlighted.
- Economic-limit input, forecast CSV download, privacy badge ("stays in your browser").

**Verified live** in Chrome: loaded Gullfaks (369 pts) — clean log-scale decline, no console
errors. A nice illustration surfaced: the auto-selector picked **Harmonic** over
**Hyperbolic** even though hyperbolic had the better in-sample R² (0.95 vs 0.87) — because
Gullfaks has a late infill-drilling uptick, and harmonic forecasts the held-out tail better
(RMSE 0.484 vs 0.647). Ranking by forecast skill, not in-sample fit, is the whole point.

Bundle: **169 KB JS (55 KB gzip)**, no runtime deps in the engine. Tests: **31/31** green
(closed-form, CSV ingestion, parity). Reference vendored cleanly (nested `.git` removed,
Equinor `LICENCE.md` preserved). Added `README.md`, `LICENSE` (MIT, Workollab), `NOTICE.md`
(Equinor MIT + SODIR NLOD attribution).

**Status:** engine + demo done and working locally. Remaining: package it up (repo + CI) and
publish the demo.

---

## 2026-06-05 — Phase 2b: "Watch it fit" animation

We wanted the demo to *show* how the engine tries different curve families and fine-tunes
to the best fit — turning the "auto" from a claim into something you watch.

- **Instrumented the optimizer** (`optimize.ts`): Nelder-Mead now optionally records its
  best-vertex **trajectory** per iteration and counts **function evaluations**. Threaded
  through `multiStart` → `fitModel` → `autoSelect` → `autoDCA` via a `trace` flag (hold-out
  refits skip tracing to save memory). Zero impact on the parity result.
- **`FitAnimation.tsx`** replays the search: for each family (exponential → harmonic →
  hyperbolic) the curve morphs from its initial guess toward the data while a HUD shows the
  live model, iteration, b, Dᵢ and loss ticking down; completed families stay as ghost
  curves; at the end all three overlay and the winner is emphasized. Per-family chips show
  final loss + iteration count. Header reads e.g. "2,259 curve evaluations across 3 families".
- Auto-plays on load, with a ▶ replay button.

Verified live on Oseberg: caught iter 0 of Exponential (flat guess, loss 600.85) and the
settled state (Exponential loss 63.19/169 iters, Harmonic 45.32/87 ★best, Hyperbolic
38.82/262). No console errors. Production bundle 175 KB / 57 KB gzip (+2 KB).

Note: the held-out selector keeps choosing **Harmonic** on these mature NCS *field* series —
correct behavior: a field's long tail (secondary recovery, infill) declines slower than a
hyperbolic b<1 would extrapolate, so harmonic forecasts the hold-out better despite a worse
in-sample loss. Clean single-well data picks hyperbolic (see synthetic parity cases).

---

## 2026-06-05 — Phase 2c: Fixing the model selector (Gullfaks)

Spotted while watching the demo: Gullfaks was picking **Harmonic**, but Hyperbolic clearly
fits better. Investigated empirically (`engine/scripts/analyze.mjs`):

| Gullfaks metric        | picks      |
|------------------------|------------|
| in-sample R²           | hyperbolic (0.9465 vs harmonic 0.8722) |
| AICc                   | hyperbolic (−1099 vs −780) |
| 5-fold expanding CV    | hyperbolic (0.306 vs 0.451) |
| **single 70/30 hold-out** | **harmonic (0.484)** ← the only metric that picked harmonic |

The single hold-out split was being gamed by Gullfaks's late infill-drilling uptick — it
rewarded harmonic's slow decline for "predicting" a rise that isn't decline at all. Every
robust metric prefers hyperbolic.

**Fix:** replaced the single split in `auto.ts` with **expanding-window cross-validation**
(5 folds, train fractions 0.5→0.9, 10% test slices, averaged), AICc breaking near-ties
(within 5%) and serving as the fallback for short series (< 24 pts). New picks across all
sample wells:

| well      | before    | after        | b     | R²    |
|-----------|-----------|--------------|-------|-------|
| Gullfaks  | harmonic  | **hyperbolic** | 0.341 | 0.946 |
| Oseberg   | harmonic  | **hyperbolic** | 0.676 | 0.907 |
| Statfjord | hyperbolic| hyperbolic   | 0.164 | 0.977 |
| Draugen   | hyperbolic| hyperbolic   | 0.357 | 0.826 |
| Gyda/Varg | exponential| exponential | 0.000 | —     |

Every oil field now picks a proper hyperbolic with a **finite** EUR (Gullfaks EUR→∞ = 266.7
MSm³ instead of "diverges"). Verified live; 31/31 tests still green (parity untouched — it
doesn't exercise the selector). UI relabeled "Hold-out" → "Cross-val / CV RMSE / N-fold".

Lesson for the article: single train/test splits are fragile on real production data;
expanding-window CV is the honest way to pick a decline model. Good, concrete story beat.

---

## 2026-06-05 — Phase 2d: Syncing the forecast chart to the fit animation

Next refinement: the "Production decline & forecast" chart should change too as the engine goes through
the different curves — not sit on the final answer while the search view animates above it.

Refactor: lifted the playback timeline into a shared hook **`useFitPlayback`** (one rAF
timeline, sampled trajectories, canonical family order). Both views now read from it:

- `FitAnimation` (history range) became presentational — renders the search from the shared
  `playback`.
- `DeclineChart` gained a `preview` prop = the current candidate frame. While playing it draws
  that family's forecast over the **fixed** chart domain (dashed, family colour), dims the band
  and fades the final best-fit line to a reference, and labels the header
  "● previewing Hyperbolic · iter 42". When the timeline settles, `preview` is null and it
  snaps back to the solid best fit + band. Axes stay fixed (domain from history + best
  forecast), so the candidate curve morphs without the chart jumping.

Verified live on Gullfaks: forecast chart showed "previewing Exponential · iter 0" (flat amber
guess spanning history + forecast) and resolved to the solid hyperbolic fit on settle, in lock-
step with the search view. Bundle 176 KB / 57 KB gzip. Typecheck + 31 tests green.

---

## 2026-06-05 — Phase 2e: Terminal decline (Modified Arps / Dmin)

Reviewing the forecast: is this engineering-flow correct, and should the forecast extend
further? Assessment: the bones are right (fit from peak, log-space robust fit, forecast to an
**economic limit**, EUR). The forecast correctly stops at the econ limit — Gullfaks just looks
short because it's a mature field near end-of-life. The real gap was the opposite of "more
tail": **no terminal/minimum decline**, the SPE-standard guard against pure hyperbolic
over-predicting reserves. Added it.

- `forecast.ts`: `terminalDecline` option (nominal D_min per time-unit). Hyperbolic/harmonic
  follow Arps until `D(t)=D_min`, then switch to exponential at that rate. Piecewise rate,
  cumulative, EUR and economic-limit time; expose `terminalSwitchTime`. The switch is
  **C¹-smooth** by construction (slopes match at `D(t*)=D_min`). Gives harmonic a finite EUR.
- UI: "3 · Terminal decline" card — toggle + effective %/yr (default 6), converted to nominal
  per-time-unit. Chart draws a violet "terminal Dₘᵢₙ" marker at the switch; EUR card notes the
  setting and switch time. Toggling off shows pure Arps for comparison.

Effect on Gullfaks (b=0.34, 6%/yr terminal): switch at **399 months**, EUR→∞ **266.7 → 257.9**
(−3.3%, more conservative), econ-limit EUR ~unchanged. Modest at low b (correct); the guard
matters much more for high-b / unconventional wells. 3 new tests (continuity, harmonic→finite,
exponential-skip). **34/34 green**, parity untouched. Bundle 179 KB / 58 KB gzip.

Strong article beat: "added the SPE-standard terminal decline so the engine doesn't over-book
reserves — and watched EUR drop to a defensible number."

---

## 2026-06-05 — Phase 2f: Terminal decline in the confidence band too

The forecast line used terminal decline but the bootstrap band still used pure hyperbolic, so
in the far tail the band sat above the line. Fixed by extracting the terminal logic into a
shared `terminalEval(model, u, Dmin)` helper (rate / cum / timeAtRate / switchTime / eurInf).
`forecast()` and `bootstrapBand()` now both use it — and since each bootstrap resample has its
own fit, each gets its **own** terminal switch, exactly mirroring the forecast.

Verified numerically on Oseberg (b=0.68, switch @235 mo): deep-tail band moved from pure
**[0.033, 0.041]** to terminal **[0.0037, 0.0038]**, tightly bracketing the terminal forecast
(0.0038) instead of sitting ~10× above it. Zoomed chart shows the tail straight on log scale
(exponential) with the band hugging it. 34/34 tests green, parity untouched, bundle 179 KB /
58 KB gzip.

---

## 2026-06-05 — Phase 3: Repo + CI + deploy

Packaged the project for release. Initial git commit on `main` (venv/node_modules/dist ignored;
largest tracked file is the 1.8 MB SODIR CSV).

- **CI** (`.github/workflows/ci.yml`): on push/PR — `npm ci` → build engine → 34 tests → build
  app, upload `app/dist` as an artifact. Verified locally with a clean `npm ci`.
- **Deploy** is dead simple because the site is static: `app/dist` is a self-contained bundle
  that serves from any static host (CDN, or a server behind Caddy/nginx). Shipped an example
  `deploy/Caddyfile` (auto-HTTPS, gzip, immutable asset caching, security headers),
  `deploy/deploy.sh` (one-command build + rsync), and a generic `docs/DEPLOY.md`.

The demo is published; the engine matches Equinor to **0.02 ppm** — the headline result of the
whole rebuild.
