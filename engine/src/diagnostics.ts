/**
 * Fit diagnostics: R², RMSE, residuals (all on log-rate), AICc, and a bootstrap
 * confidence band for the fitted curve.
 */

import type { DeclineModel } from './models.js';
import { makeLoss, type LossOptions } from './loss.js';
import { nelderMead } from './optimize.js';
import { terminalEval } from './forecast.js';

export interface Diagnostics {
  /** R² on log-rate. */
  r2: number;
  /** RMSE on log-rate. */
  rmse: number;
  /** Per-point residuals logμ - logY. */
  residuals: number[];
  /** Corrected Akaike information criterion (lower is better). */
  aicc: number;
  /** Number of free parameters. */
  k: number;
}

export function computeDiagnostics(
  model: DeclineModel,
  u: number[],
  t: number[],
  logY: number[],
): Diagnostics {
  const lm = model.evalLog(u, t);
  const n = t.length;
  const residuals = lm.map((v, i) => v - logY[i]);
  const meanY = logY.reduce((a, b) => a + b, 0) / n;
  let ssRes = 0;
  let ssTot = 0;
  for (let i = 0; i < n; i++) {
    ssRes += residuals[i] ** 2;
    ssTot += (logY[i] - meanY) ** 2;
  }
  const r2 = ssTot === 0 ? 0 : 1 - ssRes / ssTot;
  const rmse = Math.sqrt(ssRes / n);
  const k = model.nParams;
  // Gaussian-likelihood AIC on residuals, with small-sample correction
  const aic = n * Math.log(ssRes / n + 1e-300) + 2 * k;
  const denom = n - k - 1;
  const aicc = aic + (denom > 0 ? (2 * k * (k + 1)) / denom : Infinity);
  return { r2, rmse, residuals, aicc, k };
}

export interface ConfidenceBand {
  /** Grid the band is evaluated on. */
  t: number[];
  /** Lower percentile of μ(t) across bootstrap refits. */
  lower: number[];
  /** Upper percentile of μ(t). */
  upper: number[];
  /** Percentiles used, e.g. [0.1, 0.9] for an 80% band. */
  interval: [number, number];
}

/**
 * Residual-bootstrap confidence band: resample log-residuals, refit, collect μ(t) across
 * a grid, take percentiles. Honest for the robust (non-Gaussian) loss.
 */
export function bootstrapBand(
  model: DeclineModel,
  u: number[],
  t: number[],
  logY: number[],
  grid: number[],
  opts: {
    samples?: number;
    interval?: [number, number];
    seed?: number;
    /** Apply Modified-Arps terminal decline to each bootstrap curve (match the forecast). */
    terminalDecline?: number;
  } & LossOptions = {},
): ConfidenceBand {
  const samples = opts.samples ?? 120;
  const interval = opts.interval ?? [0.1, 0.9];
  const lm = model.evalLog(u, t);
  const resid = lm.map((v, i) => v - logY[i]);
  const rand = mulberry32(opts.seed ?? 12345);
  const n = t.length;
  const curves: number[][] = [];
  for (let s = 0; s < samples; s++) {
    const synthLogY = new Array<number>(n);
    for (let i = 0; i < n; i++) {
      const j = Math.floor(rand() * n);
      synthLogY[i] = lm[i] - resid[j]; // model + resampled noise
    }
    const loss = makeLoss(model, t, synthLogY, opts);
    const r = nelderMead(loss, u.slice(), { maxIter: 1500 });
    // Each resample has its own fit -> its own terminal switch, matching the forecast logic.
    const te = terminalEval(model, r.x, opts.terminalDecline);
    curves.push(grid.map((g) => te.rate(g)));
  }
  const lower = new Array<number>(grid.length);
  const upper = new Array<number>(grid.length);
  for (let g = 0; g < grid.length; g++) {
    const col = curves.map((c) => c[g]).sort((a, b) => a - b);
    lower[g] = percentile(col, interval[0]);
    upper[g] = percentile(col, interval[1]);
  }
  return { t: grid, lower, upper, interval };
}

function percentile(sorted: number[], q: number): number {
  if (sorted.length === 0) return NaN;
  const idx = q * (sorted.length - 1);
  const lo = Math.floor(idx);
  const hi = Math.ceil(idx);
  if (lo === hi) return sorted[lo];
  return sorted[lo] + (idx - lo) * (sorted[hi] - sorted[lo]);
}

/** Small deterministic PRNG so bands are reproducible. */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let tt = Math.imul(a ^ (a >>> 15), 1 | a);
    tt = (tt + Math.imul(tt ^ (tt >>> 7), 61 | tt)) ^ tt;
    return ((tt ^ (tt >>> 14)) >>> 0) / 4294967296;
  };
}
