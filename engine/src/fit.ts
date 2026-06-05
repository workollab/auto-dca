/**
 * Fit a single decline model to a production series.
 */

import { MODELS, type DeclineModel, type ModelName, type OriginalParams } from './models.js';
import { makeLoss, type LossOptions } from './loss.js';
import { multiStart, type TraceStep } from './optimize.js';
import { computeDiagnostics, type Diagnostics } from './diagnostics.js';

export interface FitOptions extends LossOptions {
  /** Extra starting points (in engineering params) to seed multi-start. */
  extraStarts?: OriginalParams[];
  /** Record the optimizer's search trajectory (for the "watch it fit" animation). */
  trace?: boolean;
}

export interface FitResult {
  model: ModelName;
  /** Unbounded parameter vector at the optimum. */
  u: number[];
  /** Engineering parameters (qi, Di, b). */
  params: OriginalParams;
  /** Final loss value. */
  loss: number;
  diagnostics: Diagnostics;
  /** Loss-function evaluations spent on this fit. */
  funcEvals: number;
  /** Optimizer convergence path (best vertex per iteration), if `trace` was set. */
  trace?: TraceStep[];
}

/** Clean a series: keep finite, strictly-positive rates and their times, sorted by t. */
export function cleanSeries(
  t: number[],
  y: number[],
): { t: number[]; y: number[]; logY: number[] } {
  const pairs: Array<[number, number]> = [];
  for (let i = 0; i < t.length; i++) {
    if (Number.isFinite(t[i]) && Number.isFinite(y[i]) && y[i] > 0) {
      pairs.push([t[i], y[i]]);
    }
  }
  pairs.sort((a, b) => a[0] - b[0]);
  return {
    t: pairs.map((p) => p[0]),
    y: pairs.map((p) => p[1]),
    logY: pairs.map((p) => Math.log(p[1])),
  };
}

/** Fit one model. `t`,`y` should already be cleaned (positive, sorted). */
export function fitModel(
  modelOrName: DeclineModel | ModelName,
  t: number[],
  y: number[],
  opts: FitOptions = {},
): FitResult {
  const model = typeof modelOrName === 'string' ? MODELS[modelOrName] : modelOrName;
  const logY = y.map(Math.log);
  const loss = makeLoss(model, t, logY, opts);

  const starts: number[][] = [model.initialGuess(t, y)];
  // A few spread b-values help the hyperbolic avoid local minima.
  if (model.name === 'hyperbolic') {
    const base = model.initialGuess(t, y);
    for (const b of [0.2, 0.5, 0.9]) {
      starts.push(model.fromOriginal({ ...model.toOriginal(base), b }));
    }
  }
  for (const s of opts.extraStarts ?? []) starts.push(model.fromOriginal(s));

  const res = multiStart(loss, starts, { xatol: 1e-10, fatol: 1e-12, trace: opts.trace });
  const diagnostics = computeDiagnostics(model, res.x, t, logY);
  return {
    model: model.name,
    u: res.x,
    params: model.toOriginal(res.x),
    loss: res.fun,
    diagnostics,
    funcEvals: res.funcEvals,
    trace: res.trajectory,
  };
}
