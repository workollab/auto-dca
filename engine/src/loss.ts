/**
 * Loss function — faithful to Equinor's CurveLoss.
 *
 *   L(u) = Σ_i w_i · |log μ(t_i; u) − log y_i|^p   (+ optional prior)
 *
 * Default parity config: p = 1.4, uniform weights, no prior. Optional half-life
 * time-decay weights up-weight recent data (the forecast-relevant tail).
 */

import type { DeclineModel } from './models.js';

export interface LossOptions {
  /** p-norm exponent in [1, 2]. Default 1.4 (Equinor default), robust to noise. */
  p?: number;
  /** Half-life (in time units) for exponential time-decay weights. Null = uniform. */
  halfLife?: number | null;
  /** Per-point user weights (multiplied with half-life weights). */
  weights?: number[] | null;
}

/** Compute normalized half-life weights, matching Equinor's `_weight`. */
export function halfLifeWeights(w: number[], halfLife: number | null | undefined): number[] {
  const n = w.length;
  const sumW = w.reduce((a, b) => a + b, 0);
  if (halfLife == null) {
    // uniform: ones/len * sum(w)
    return w.map(() => sumW / n);
  }
  // reverse cumulative sum, then 2^(-cumsum/halfLife), normalized to sum to sum(w)
  const revCumsum = new Array<number>(n);
  let acc = 0;
  for (let i = n - 1; i >= 0; i--) {
    acc += w[i];
    revCumsum[i] = acc;
  }
  const raw = revCumsum.map((c) => Math.pow(2, -c / halfLife));
  const sumRaw = raw.reduce((a, b) => a + b, 0);
  return raw.map((r) => (r / sumRaw) * sumW);
}

/** Build a loss function L(u) for a model over data (t, logY). */
export function makeLoss(
  model: DeclineModel,
  t: number[],
  logY: number[],
  opts: LossOptions = {},
): (u: number[]) => number {
  const p = opts.p ?? 1.4;
  const userW = opts.weights ?? t.map(() => 1);
  const wHl = halfLifeWeights(userW, opts.halfLife ?? null);
  const w = userW.map((wi, i) => wi * wHl[i]);
  return (u: number[]) => {
    const lm = model.evalLog(u, t);
    let s = 0;
    for (let i = 0; i < t.length; i++) {
      s += w[i] * Math.pow(Math.abs(lm[i] - logY[i]), p);
    }
    return Number.isFinite(s) ? s : 1e18;
  };
}
