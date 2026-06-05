/**
 * Auto model selection — the "auto" in Auto DCA.
 *
 * Fits Exponential, Hyperbolic and Harmonic, then ranks them by forecast skill measured with
 * **expanding-window cross-validation** (train on a growing prefix, score the next slice,
 * repeat over several folds, average). This is robust to late-life anomalies (infill
 * drilling, recompletions) that distort a single train/test split. AICc breaks near-ties and
 * is the fallback when the series is too short to cross-validate.
 */

import { MODELS, type ModelName, type OriginalParams } from './models.js';
import { fitModel, cleanSeries, type FitOptions, type FitResult } from './fit.js';

const CANDIDATES: ModelName[] = ['exponential', 'hyperbolic', 'harmonic'];

export interface Candidate {
  model: ModelName;
  fit: FitResult;
  /** Mean expanding-window cross-validation RMSE (log-rate). NaN if not scored. */
  cvRmse: number;
  /** Per-fold CV RMSE values. */
  cvFoldRmse: number[];
  /** Akaike weight relative to the best AICc (0..1, higher better). */
  aiccWeight: number;
  params: OriginalParams;
}

export interface AutoSelection {
  best: Candidate;
  ranked: Candidate[];
  /** Number of CV folds actually scored. */
  cvFolds: number;
  /** Whether selection used cross-validation (true) or fell back to AICc (false). */
  usedCV: boolean;
}

export interface AutoOptions extends FitOptions {
  /** Number of expanding-window CV folds (default 5). */
  cvFolds?: number;
  /** Smallest training fraction used by the first fold (default 0.5). */
  cvMinTrainFrac?: number;
  /** Fraction of the series used as each fold's test slice (default 0.1). */
  cvTestFrac?: number;
  /** Minimum points required to attempt CV (default 24). */
  minPointsForCV?: number;
  /** Relative gap below which two CV scores are a "tie" and AICc decides (default 0.05). */
  cvTieRel?: number;
}

/** Mean expanding-window CV RMSE for one model. Returns {mean, folds} (mean NaN if none). */
function crossValidate(
  name: ModelName,
  t: number[],
  y: number[],
  opts: AutoOptions,
): { mean: number; perFold: number[] } {
  const n = t.length;
  const folds = opts.cvFolds ?? 5;
  const minTrain = opts.cvMinTrainFrac ?? 0.5;
  const testFrac = opts.cvTestFrac ?? 0.1;
  const maxTrain = 1 - testFrac;
  const perFold: number[] = [];

  for (let k = 0; k < folds; k++) {
    const trainFrac = folds > 1 ? minTrain + (maxTrain - minTrain) * (k / (folds - 1)) : maxTrain;
    const trainEnd = Math.floor(n * trainFrac);
    const testEnd = Math.min(n, trainEnd + Math.max(1, Math.floor(n * testFrac)));
    if (trainEnd < 4 || testEnd <= trainEnd) continue;
    const fit = fitModel(name, t.slice(0, trainEnd), y.slice(0, trainEnd), { ...opts, trace: false });
    const tTest = t.slice(trainEnd, testEnd);
    const yTest = y.slice(trainEnd, testEnd);
    const predLog = MODELS[name].evalLog(fit.u, tTest);
    let ss = 0;
    for (let i = 0; i < tTest.length; i++) ss += (predLog[i] - Math.log(yTest[i])) ** 2;
    perFold.push(Math.sqrt(ss / tTest.length));
  }
  const mean = perFold.length ? perFold.reduce((a, b) => a + b, 0) / perFold.length : NaN;
  return { mean, perFold };
}

/** Run auto model selection on a cleaned, positive, sorted series. */
export function autoSelect(t: number[], y: number[], opts: AutoOptions = {}): AutoSelection {
  const n = t.length;
  const minPts = opts.minPointsForCV ?? 24;
  const tieRel = opts.cvTieRel ?? 0.05;
  const usedCV = n >= minPts;

  const candidates: Candidate[] = CANDIDATES.map((name) => {
    const fit = fitModel(name, t, y, opts);
    const cv = usedCV ? crossValidate(name, t, y, opts) : { mean: NaN, perFold: [] };
    return {
      model: name,
      fit,
      cvRmse: cv.mean,
      cvFoldRmse: cv.perFold,
      aiccWeight: 0,
      params: fit.params,
    };
  });

  // Akaike weights from AICc
  const minAicc = Math.min(...candidates.map((c) => c.fit.diagnostics.aicc));
  let zw = 0;
  for (const c of candidates) {
    const w = Math.exp(-0.5 * (c.fit.diagnostics.aicc - minAicc));
    c.aiccWeight = Number.isFinite(w) ? w : 0;
    zw += c.aiccWeight;
  }
  if (zw > 0) for (const c of candidates) c.aiccWeight /= zw;

  const cvScored = usedCV && candidates.every((c) => Number.isFinite(c.cvRmse));

  // Rank by CV RMSE; near-ties (within tieRel) are decided by AICc. Fall back to AICc when
  // CV is unavailable.
  const ranked = [...candidates].sort((a, b) => {
    if (cvScored) {
      const lo = Math.min(a.cvRmse, b.cvRmse);
      const rel = Math.abs(a.cvRmse - b.cvRmse) / (lo || 1);
      if (rel >= tieRel) return a.cvRmse - b.cvRmse;
      // tie → prefer better (lower) AICc
      return a.fit.diagnostics.aicc - b.fit.diagnostics.aicc;
    }
    return a.fit.diagnostics.aicc - b.fit.diagnostics.aicc;
  });

  const foldsScored = candidates.reduce((m, c) => Math.max(m, c.cvFoldRmse.length), 0);
  return { best: ranked[0], ranked, cvFolds: cvScored ? foldsScored : 0, usedCV: cvScored };
}

/** Convenience: clean a raw series, then auto-select. */
export function autoSelectRaw(t: number[], y: number[], opts: AutoOptions = {}): AutoSelection {
  const c = cleanSeries(t, y);
  return autoSelect(c.t, c.y, opts);
}
