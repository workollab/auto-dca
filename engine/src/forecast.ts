/**
 * Forecasting and EUR (Estimated Ultimate Recovery).
 *
 * Supports **Modified Arps** (terminal decline): a hyperbolic/harmonic decline is followed
 * until its instantaneous nominal decline drops to a minimum `Dmin`, then switches to
 * exponential decline at that constant rate. This is the industry-standard guard against
 * hyperbolic decline over-predicting late-life rate and reserves. The switch is C¹-smooth
 * (rate and slope match), because it happens exactly where D(t) = Dmin.
 *
 * EUR is reported three ways:
 *   - to infinity (finite once terminal decline is applied; also finite for exponential and
 *     hyperbolic b<1 without it)
 *   - to a time horizon T
 *   - to an economic-limit rate q_ec (abandonment rate)
 */

import { MODELS, type DeclineModel, type ModelName } from './models.js';

export interface ForecastPoint {
  t: number;
  q: number;
  /** Cumulative production from t=0 to this t. */
  cum: number;
}

export interface ForecastOptions {
  /** Forecast horizon in time units (default: 3× the observed span). */
  horizon?: number;
  /** Number of points in the forecast curve. */
  steps?: number;
  /** Economic-limit (abandonment) rate. */
  economicLimit?: number;
  /**
   * Minimum terminal **nominal** decline per time unit (Modified Arps). When the hyperbolic
   * decline rate D(t) falls to this value, the curve switches to exponential at this rate.
   * Only applies to hyperbolic/harmonic models whose initial decline exceeds it.
   */
  terminalDecline?: number;
}

export interface EUR {
  /** ∫₀^∞ μ dt, or null if it diverges. */
  toInfinity: number | null;
  /** ∫₀^T μ dt for the forecast horizon. */
  toHorizon: number;
  /** ∫₀^t_ec μ dt where μ(t_ec)=q_ec, or null if no economic limit given/reached. */
  toEconomicLimit: number | null;
  /** Time at which the economic limit is reached (if any). */
  economicLimitTime: number | null;
}

export interface Forecast {
  model: ModelName;
  curve: ForecastPoint[];
  eur: EUR;
  /** Cumulative produced over the historical window [0, tLast]. */
  cumHistorical: number;
  /** Time where hyperbolic switches to terminal exponential decline (null if not applied). */
  terminalSwitchTime: number | null;
}

/** Terminal-decline-aware evaluators for a fitted model. Shared by forecast() and the band. */
export interface TerminalEval {
  /** Rate μ(t) with the hyperbolic→exponential terminal switch applied. */
  rate: (t: number) => number;
  /** Cumulative ∫₀ᵗ with the terminal switch applied. */
  cum: (t: number) => number;
  /** Time where μ(t)=q with the terminal switch applied. */
  timeAtRate: (q: number) => number;
  /** Switch time t* (null if terminal decline does not apply). */
  switchTime: number | null;
  /** EUR to infinity (finite once terminal decline applies). */
  eurInf: number | null;
}

/**
 * Build terminal-decline-aware evaluators for a fitted model. With no `terminalDecline`, or
 * for models/parameters where it doesn't apply, these fall back to the pure model.
 */
export function terminalEval(
  model: DeclineModel,
  u: number[],
  terminalDecline?: number,
): TerminalEval {
  const { Di, b } = model.toOriginal(u);
  let tSwitch: number | null = null;
  if (terminalDecline != null && terminalDecline > 0 && b > 0 && Di > terminalDecline) {
    const ts = (Di / terminalDecline - 1) / (b * Di);
    tSwitch = Number.isFinite(ts) && ts > 0 ? ts : null;
  }
  const Dlim = terminalDecline!;
  const qSwitch = tSwitch != null ? model.eval(u, [tSwitch])[0] : 0;
  const cumSwitch = tSwitch != null ? model.cumulative(u, [tSwitch])[0] : 0;
  return {
    switchTime: tSwitch,
    rate: (t) =>
      tSwitch != null && t > tSwitch ? qSwitch * Math.exp(-Dlim * (t - tSwitch)) : model.eval(u, [t])[0],
    cum: (t) =>
      tSwitch != null && t > tSwitch
        ? cumSwitch + (qSwitch / Dlim) * (1 - Math.exp(-Dlim * (t - tSwitch)))
        : model.cumulative(u, [t])[0],
    timeAtRate: (q) =>
      tSwitch != null && q < qSwitch ? tSwitch + Math.log(qSwitch / q) / Dlim : model.timeAtRate(u, q),
    eurInf: tSwitch != null ? cumSwitch + qSwitch / Dlim : model.eurInf(u),
  };
}

export function forecast(
  modelOrName: DeclineModel | ModelName,
  u: number[],
  tLast: number,
  opts: ForecastOptions = {},
): Forecast {
  const model = typeof modelOrName === 'string' ? MODELS[modelOrName] : modelOrName;
  const horizon = opts.horizon ?? Math.max(tLast * 3, tLast + 1);
  const steps = opts.steps ?? 120;
  const qEc = opts.economicLimit;

  const te = terminalEval(model, u, opts.terminalDecline);

  // economic-limit time, clamped to the horizon for the drawn curve
  let tEc: number | null = null;
  if (qEc != null && qEc > 0) {
    const t = te.timeAtRate(qEc);
    tEc = Number.isFinite(t) ? t : null;
  }
  const tEnd = tEc != null ? Math.min(tEc, horizon) : horizon;

  const curve: ForecastPoint[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = (tEnd * i) / steps;
    curve.push({ t, q: te.rate(t), cum: te.cum(t) });
  }

  const eur: EUR = {
    toInfinity: te.eurInf,
    toHorizon: te.cum(horizon),
    toEconomicLimit: tEc != null ? te.cum(tEc) : null,
    economicLimitTime: tEc,
  };

  return {
    model: model.name,
    curve,
    eur,
    cumHistorical: te.cum(tLast),
    terminalSwitchTime: te.switchTime,
  };
}
