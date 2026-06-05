# Auto DCA — Math Specification

This document captures the decline-curve mathematics we are rebuilding from scratch in
TypeScript, faithful to Equinor's [`decline-curve-analysis`](https://github.com/equinor/decline-curve-analysis)
(MIT, © 2025 Equinor). It is the contract the TS engine must satisfy, and the reference
for the parity tests in `engine/test`.

## 1. Decline-curve models

All models are defined through their **log-rate** `log μ(t)` for numerical stability, then
exponentiated. Time `t` is in consistent units (we use **months** for the demo; days work
identically). Rate `μ(t)` is production per unit time.

### 1.1 Exponential (Arps b → 0)

Original (engineering) parametrization:

```
μ(t; C, k) = C · exp(-k·t)        C > 0,  k > 0
```

- `C` = initial rate `q_i`
- `k` = nominal decline `D_i` (constant fraction per unit time)

Cumulative / EUR (integral 0→∞ converges):

```
Q(t)  = (C/k) · (1 - exp(-k·t))
EUR   = C/k
```

Equinor's unbounded reparametrization (θ₁,θ₂):

```
log μ = θ₁ - θ₂ - t·exp(-θ₂)
k = exp(-θ₂),   C = exp(θ₁ - θ₂),   exp(θ₁) = ∫₀^∞ μ dt = EUR
```

### 1.2 Hyperbolic (Arps, 0 < b < 1)

Original parametrization (`h` is Equinor's name for the Arps exponent `b`):

```
μ(t; q₁, h, D) = q₁ · (1 + h·D·t)^(-1/h)        q₁ > 0,  D > 0,  0 < h < 1
```

- `q₁` = initial rate `q_i`
- `D`  = initial nominal decline `D_i`
- `h`  = `b` = hyperbolic exponent (Arps b-factor)

Cumulative (finite for h < 1):

```
Q(t) = (q₁ / (D·(1 - h))) · (1 - (1 + h·D·t)^(1 - 1/h))
EUR  = q₁ / (D·(1 - h))          [integral 0→∞, requires h < 1]
```

Equinor's unbounded reparametrization (θ₁,θ₂,θ₃), from Lee et al. "Bayesian Hierarchical
Modeling", eq. (3.3):

```
log μ = θ₁ - θ₂ - (1 + exp(-θ₃)) · log(1 + t·exp(θ₃ - θ₂))
```

Mapping θ ↔ (q₁, h, D):

```
h  = sigmoid(θ₃) = 1/(1+exp(-θ₃))
D  = 1 / ((1 - h)·exp(θ₂))
q₁ = exp(θ₁) · (1 - h) · D

# inverse
b  = 1/((1 - h)·D);  M = b·q₁
θ₁ = log(M)
θ₂ = log(b)
θ₃ = logit(h) = log(h) - log(1 - h)
```

Key identity: **`exp(θ₁) = ∫₀^∞ μ dt = EUR`** (the unbounded scale parameter is the EUR
in model units). True for both Exponential and Hyperbolic.

### 1.3 Harmonic (Arps b = 1)

Special case of hyperbolic with `h = 1`:

```
μ(t; q₁, D) = q₁ / (1 + D·t)
Q(t) = (q₁/D) · ln(1 + D·t)        # diverges as t→∞  ⇒ no finite EUR without a limit
```

### 1.4 Terminal decline — Modified Arps (hyperbolic → exponential)

Pure Arps hyperbolic has a *continuously decreasing* nominal decline `D(t) = Dᵢ/(1+b·Dᵢ·t)`,
so its tail flattens forever and **over-predicts late-life rate and reserves**. The SPE-
standard guard (Robertson / "hyp2exp") imposes a **minimum terminal decline** `D_min`: follow
hyperbolic until `D(t) = D_min`, then switch to exponential at that constant rate.

Switch time (where the instantaneous decline reaches the floor):

```
t* = (Dᵢ/D_min − 1) / (b·Dᵢ)        # for b>0, Dᵢ > D_min; otherwise no switch
q* = μ(t*)                           # rate at switch
```

For `t > t*`:

```
q(t) = q*·exp(−D_min·(t − t*))
Q(t) = Q(t*) + (q*/D_min)·(1 − exp(−D_min·(t − t*)))
EUR(∞) = Q(t*) + q*/D_min            # finite — even for harmonic
```

The switch is **C¹-smooth**: at `t*` the hyperbolic slope is `−D(t*)·q* = −D_min·q*`, exactly
the exponential slope. `D_min` is entered as an effective annual decline (default 6%/yr) and
converted to a nominal per-time-unit rate. Terminal decline applies to hyperbolic/harmonic
only (exponential already has constant decline).

### 1.5 Economic-limit EUR (what the demo reports)

The closed-form `∫₀^∞` only converges for exponential and hyperbolic with `b < 1`. In
practice — and for harmonic / `b≥1` — EUR is taken to an **economic limit rate** `q_ec`
(abandonment rate) or a **time horizon** `T`:

```
t_ec  = time where μ(t) = q_ec     (solve per-model, closed form)
EUR   = Q_already_produced + ∫_{t_last}^{t_ec} μ dt
```

The engine reports EUR three ways: to ∞ (when finite), to a user time horizon, and to an
economic-limit rate. This is more practical than the model's `exp(θ₁)` and works for all b.

## 2. Fitting (the "fit" in auto-fit)

Equinor fits in **log space** with a robust **p-norm loss** plus optional Gaussian prior
and time-decay weights. From `CurveLoss`:

```
L(θ) = Σ_i w_i · |log μ(t_i; θ) - log y_i|^p   +   α·(θ - μ_prior)ᵀ Σ⁻¹ (θ - μ_prior)
```

- `p ∈ [1, 2]`, default **1.4** — robust to outliers/noise vs. plain least squares (p=2).
- `w_i` = optional **half-life time-decay weights**: a point `H` time-units older is worth
  half as much. Normalized to sum to N. Recent data dominates the forecast.
- Gaussian prior (ridge-like) on θ for regularization; off by default in our parity tests.
- Optimized with BFGS + analytic gradient, Nelder-Mead fallback (we use a robust simplex +
  optional gradient path in TS).

Our TS engine implements this **exact loss** so fits match the reference numerically. The
default configuration for parity: `p = 1.4`, no prior, no half-life weighting.

## 3. Auto model selection (the "auto" in Auto DCA)

The "auto" layer fits all candidate models (Exponential, Hyperbolic, Harmonic) and picks
the best. Selection criteria (engine exposes all):

- **Expanding-window cross-validation** (primary) — fit on a growing prefix of the series,
  score log-RMSE on the next slice, repeat over several folds (default 5, train fractions
  0.5 → 0.9, 10% test slices), average. This rewards forecasting skill the way Equinor
  cross-validates hyperparameters, but — unlike a single train/test split — it is robust to
  late-life anomalies (infill drilling, recompletions, shut-ins) that would otherwise let a
  too-slow decline "win" by accidentally matching a non-decline uptick.
- **AICc** — corrected Akaike information criterion. Breaks near-ties (CV scores within ~5%)
  in favour of the better-fitting, more parsimonious model, and is the fallback when the
  series is too short to cross-validate (< 24 points).
- Reported diagnostics: **R²** and **RMSE** on log-rate, residual series, and a parameter
  **confidence band** from residual bootstrap.

> Why not a single hold-out split? On a mature field with a late production uptick, a single
> 70/30 split can rank Harmonic above Hyperbolic even though Hyperbolic fits better by R²,
> AICc *and* multi-fold CV — the split just happens to reward Harmonic's slow tail. Averaging
> several expanding-window folds removes that artifact. (Observed on the Gullfaks field.)

## 4. Diagnostics & confidence

- `R²`, `RMSE` computed on log-rate residuals `r_i = log μ(t_i) - log y_i`.
- Confidence band: linearize at the optimum, `Cov(θ) ≈ σ²·(JᵀWJ)⁻¹`, propagate to μ(t) for a
  ±band; bootstrap residual resampling as a robustness fallback.
- b-factor sanity flag: warn when `b > 1` (no finite EUR) or `b` pinned at a bound.

## 5. Parity contract (engine vs. reference)

For each golden case the TS engine must, on identical data with `p=1.4`, no prior, no
weights:

1. reach a loss `L` within `1e-6` (relative) of the reference minimum, and
2. produce `(q_i, D, b)` within `1e-3` (relative), and
3. match `μ(t)` on a dense grid within `1e-4` (relative).

Auto-selection is a discrete choice; it is validated by held-out forecast error agreeing in
direction, not by exact equality.
