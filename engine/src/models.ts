/**
 * Decline-curve models (Arps family), rebuilt from scratch.
 *
 * Each model is defined through its LOG-rate for numerical stability, and fit over an
 * UNBOUNDED parameter vector `u` (so the optimizer never fights box constraints), then
 * mapped back to the interpretable engineering parameters (qi, Di, b).
 *
 * Faithful to the math in Equinor's `decline-curve-analysis` (MIT). See docs/MATH_SPEC.md.
 */

export type ModelName = 'exponential' | 'hyperbolic' | 'harmonic';

/** Engineering parameters reported to the user. */
export interface OriginalParams {
  /** Initial rate q_i (same units as input rate). */
  qi: number;
  /** Initial nominal decline D_i (per unit time). */
  Di: number;
  /** Arps b-exponent. 0 = exponential, 1 = harmonic, (0,1) = hyperbolic. */
  b: number;
}

/** A decline model: maps an unbounded vector `u` to a positive, decreasing rate curve. */
export interface DeclineModel {
  readonly name: ModelName;
  /** Number of free parameters. */
  readonly nParams: number;
  /** log μ(t) for each t, given unbounded params u. */
  evalLog(u: number[], t: number[]): number[];
  /** μ(t) for each t. */
  eval(u: number[], t: number[]): number[];
  /** A reasonable starting point for the optimizer from data (t, y). */
  initialGuess(t: number[], y: number[]): number[];
  /** Map unbounded params -> engineering params (qi, Di, b). */
  toOriginal(u: number[]): OriginalParams;
  /** Map engineering params -> unbounded params. */
  fromOriginal(p: OriginalParams): number[];
  /** Cumulative production ∫₀ᵗ μ dτ for each t. */
  cumulative(u: number[], t: number[]): number[];
  /** EUR = ∫₀^∞ μ dτ, or null if the integral diverges (harmonic / b≥1). */
  eurInf(u: number[]): number | null;
  /** Smallest t ≥ 0 where μ(t) = q (economic-limit time). Infinity if never reached. */
  timeAtRate(u: number[], q: number): number;
}

const EPS = 1e-12;

/** Numerically stable log(1 + t·exp(x)) (ported from Equinor's log1pexp). */
export function log1pexp(t: number, x: number): number {
  // log(1 + t·e^x) = log(e^-x + t) + x  when x large; log1p(t·e^x) otherwise.
  if (x > 0) return Math.log(Math.exp(-x) + t) + x;
  return Math.log1p(t * Math.exp(x));
}

// ---------------------------------------------------------------------------
// Exponential: μ = C·exp(-k·t),  u = [logC, logk]
// ---------------------------------------------------------------------------
export const Exponential: DeclineModel = {
  name: 'exponential',
  nParams: 2,
  evalLog(u, t) {
    const logC = u[0];
    const k = Math.exp(u[1]);
    return t.map((ti) => logC - k * ti);
  },
  eval(u, t) {
    return this.evalLog(u, t).map(Math.exp);
  },
  initialGuess(t, y) {
    const { logQi, slope } = logLinearFit(t, y);
    const k = Math.max(slope <= 0 ? -slope : 1e-4, 1e-6);
    return [logQi, Math.log(k)];
  },
  toOriginal(u) {
    return { qi: Math.exp(u[0]), Di: Math.exp(u[1]), b: 0 };
  },
  fromOriginal(p) {
    return [Math.log(p.qi), Math.log(Math.max(p.Di, EPS))];
  },
  cumulative(u, t) {
    const C = Math.exp(u[0]);
    const k = Math.exp(u[1]);
    return t.map((ti) => (C / k) * (1 - Math.exp(-k * ti)));
  },
  eurInf(u) {
    const C = Math.exp(u[0]);
    const k = Math.exp(u[1]);
    return C / k;
  },
  timeAtRate(u, q) {
    const C = Math.exp(u[0]);
    const k = Math.exp(u[1]);
    if (q <= 0 || q >= C) return q >= C ? 0 : Infinity;
    return Math.log(C / q) / k;
  },
};

// ---------------------------------------------------------------------------
// Hyperbolic: μ = qi·(1 + b·Di·t)^(-1/b),  0<b<1,  u = [logQi, logDi, logit(b)]
// ---------------------------------------------------------------------------
function sigmoid(x: number): number {
  return x >= 0 ? 1 / (1 + Math.exp(-x)) : Math.exp(x) / (1 + Math.exp(x));
}
function logit(p: number): number {
  return Math.log(p) - Math.log1p(-p);
}

export const Hyperbolic: DeclineModel = {
  name: 'hyperbolic',
  nParams: 3,
  evalLog(u, t) {
    const logQi = u[0];
    const Di = Math.exp(u[1]);
    const b = sigmoid(u[2]); // (0,1)
    // log μ = logQi - (1/b)·log(1 + b·Di·t)
    return t.map((ti) => logQi - (1 / b) * log1pexp(b * Di * ti, 0));
  },
  eval(u, t) {
    return this.evalLog(u, t).map(Math.exp);
  },
  initialGuess(t, y) {
    const { logQi, slope } = logLinearFit(t, y);
    const Di = Math.max(slope <= 0 ? -slope : 1e-3, 1e-5);
    return [logQi, Math.log(Di), logit(0.5)]; // start at b = 0.5
  },
  toOriginal(u) {
    return { qi: Math.exp(u[0]), Di: Math.exp(u[1]), b: sigmoid(u[2]) };
  },
  fromOriginal(p) {
    const b = Math.min(Math.max(p.b, 1e-4), 1 - 1e-4);
    return [Math.log(p.qi), Math.log(Math.max(p.Di, EPS)), logit(b)];
  },
  cumulative(u, t) {
    const qi = Math.exp(u[0]);
    const Di = Math.exp(u[1]);
    const b = sigmoid(u[2]);
    // Q(t) = qi/(Di(1-b)) · (1 - (1+b·Di·t)^(1-1/b))
    const pref = qi / (Di * (1 - b));
    return t.map((ti) => pref * (1 - Math.pow(1 + b * Di * ti, 1 - 1 / b)));
  },
  eurInf(u) {
    const qi = Math.exp(u[0]);
    const Di = Math.exp(u[1]);
    const b = sigmoid(u[2]);
    if (b >= 1) return null;
    return qi / (Di * (1 - b));
  },
  timeAtRate(u, q) {
    const qi = Math.exp(u[0]);
    const Di = Math.exp(u[1]);
    const b = sigmoid(u[2]);
    if (q <= 0 || q >= qi) return q >= qi ? 0 : Infinity;
    // q = qi(1+b·Di·t)^(-1/b)  =>  t = ((qi/q)^b - 1)/(b·Di)
    return (Math.pow(qi / q, b) - 1) / (b * Di);
  },
};

// ---------------------------------------------------------------------------
// Harmonic: μ = qi/(1 + Di·t)  (Arps b=1),  u = [logQi, logDi]
// ---------------------------------------------------------------------------
export const Harmonic: DeclineModel = {
  name: 'harmonic',
  nParams: 2,
  evalLog(u, t) {
    const logQi = u[0];
    const Di = Math.exp(u[1]);
    return t.map((ti) => logQi - log1pexp(Di * ti, 0));
  },
  eval(u, t) {
    return this.evalLog(u, t).map(Math.exp);
  },
  initialGuess(t, y) {
    const { logQi, slope } = logLinearFit(t, y);
    const Di = Math.max(slope <= 0 ? -slope : 1e-3, 1e-5);
    return [logQi, Math.log(Di)];
  },
  toOriginal(u) {
    return { qi: Math.exp(u[0]), Di: Math.exp(u[1]), b: 1 };
  },
  fromOriginal(p) {
    return [Math.log(p.qi), Math.log(Math.max(p.Di, EPS))];
  },
  cumulative(u, t) {
    const qi = Math.exp(u[0]);
    const Di = Math.exp(u[1]);
    // Q(t) = (qi/Di)·ln(1 + Di·t)
    return t.map((ti) => (qi / Di) * Math.log1p(Di * ti));
  },
  eurInf() {
    return null; // diverges
  },
  timeAtRate(u, q) {
    const qi = Math.exp(u[0]);
    const Di = Math.exp(u[1]);
    if (q <= 0 || q >= qi) return q >= qi ? 0 : Infinity;
    return (qi / q - 1) / Di;
  },
};

export const MODELS: Record<ModelName, DeclineModel> = {
  exponential: Exponential,
  hyperbolic: Hyperbolic,
  harmonic: Harmonic,
};

/** Ordinary least-squares fit of log(y) = logQi - slope·t. Used for initial guesses. */
export function logLinearFit(t: number[], y: number[]): { logQi: number; slope: number } {
  const ly: number[] = [];
  const tt: number[] = [];
  for (let i = 0; i < t.length; i++) {
    if (y[i] > 0) {
      ly.push(Math.log(y[i]));
      tt.push(t[i]);
    }
  }
  const n = tt.length;
  if (n < 2) return { logQi: ly.length ? ly[0] : 0, slope: 1e-3 };
  const mt = tt.reduce((a, b) => a + b, 0) / n;
  const my = ly.reduce((a, b) => a + b, 0) / n;
  let num = 0;
  let den = 0;
  for (let i = 0; i < n; i++) {
    num += (tt[i] - mt) * (ly[i] - my);
    den += (tt[i] - mt) ** 2;
  }
  const m = den === 0 ? 0 : num / den; // d(log y)/dt, expected negative
  const intercept = my - m * mt;
  return { logQi: intercept, slope: -m };
}
