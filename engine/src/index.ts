/**
 * @workollab/auto-dca-engine
 *
 * Browser-native decline-curve-analysis. Rebuilt from scratch, validated against Equinor's
 * `decline-curve-analysis` (MIT). Everything runs locally — production data never leaves
 * the caller's machine.
 *
 * High-level entry point: `autoDCA(t, q, options)`.
 */

export * from './models.js';
export * from './loss.js';
export * from './optimize.js';
export * from './diagnostics.js';
export * from './fit.js';
export * from './forecast.js';
export * from './auto.js';
export * from './csv.js';

import { cleanSeries } from './fit.js';
import { autoSelect, type AutoOptions, type AutoSelection } from './auto.js';
import { forecast, type Forecast, type ForecastOptions } from './forecast.js';
import { bootstrapBand, type ConfidenceBand } from './diagnostics.js';
import { MODELS } from './models.js';

export interface AutoDCAOptions extends AutoOptions, ForecastOptions {
  /** Compute a bootstrap confidence band on the forecast. Default true. */
  band?: boolean;
  /** Number of bootstrap resamples for the band. Default 120. */
  bandSamples?: number;
  /** Confidence interval for the band, e.g. [0.1, 0.9]. Default [0.1, 0.9]. */
  bandInterval?: [number, number];
}

export interface AutoDCAResult {
  /** The cleaned series actually fit (positive, sorted). */
  series: { t: number[]; q: number[] };
  selection: AutoSelection;
  forecast: Forecast;
  band: ConfidenceBand | null;
}

/**
 * One-call Auto DCA: clean → auto-select the best Arps model → forecast + EUR → confidence
 * band. This is what the demo app calls.
 */
export function autoDCA(t: number[], q: number[], options: AutoDCAOptions = {}): AutoDCAResult {
  const cleaned = cleanSeries(t, q);
  if (cleaned.t.length < 4) {
    throw new Error('Need at least 4 positive data points to fit a decline curve.');
  }
  const selection = autoSelect(cleaned.t, cleaned.y, options);
  const best = selection.best.fit;
  const tLast = cleaned.t[cleaned.t.length - 1];

  const fc = forecast(best.model, best.u, tLast, options);

  let band: ConfidenceBand | null = null;
  if (options.band !== false) {
    const grid = fc.curve.map((p) => p.t);
    band = bootstrapBand(MODELS[best.model], best.u, cleaned.t, cleaned.logY, grid, {
      samples: options.bandSamples,
      interval: options.bandInterval,
      p: options.p,
      halfLife: options.halfLife,
      terminalDecline: options.terminalDecline,
    });
  }

  return { series: { t: cleaned.t, q: cleaned.y }, selection, forecast: fc, band };
}
