/**
 * Nelder-Mead simplex optimizer — dependency-free, robust for the non-smooth p-norm loss.
 * Mirrors scipy's Nelder-Mead (the fallback Equinor uses), with multi-start.
 */

export interface NMOptions {
  maxIter?: number;
  xatol?: number;
  fatol?: number;
  /** Initial simplex step as a fraction of |x0_i| (or `nonzeroStep` when x0_i = 0). */
  step?: number;
  nonzeroStep?: number;
  /** Record the best vertex at each iteration (for the "watch it fit" animation). */
  trace?: boolean;
}

/** One recorded step of the optimizer's search. */
export interface TraceStep {
  iter: number;
  fun: number;
  x: number[];
}

export interface NMResult {
  x: number[];
  fun: number;
  iterations: number;
  converged: boolean;
  /** Number of loss-function evaluations. */
  funcEvals: number;
  /** Best-vertex trajectory, present when `trace` is set. */
  trajectory?: TraceStep[];
}

/** Minimize `f` from `x0` using the Nelder-Mead simplex method. */
export function nelderMead(
  rawF: (x: number[]) => number,
  x0: number[],
  opts: NMOptions = {},
): NMResult {
  const n = x0.length;
  const maxIter = opts.maxIter ?? 2000 * n;
  const xatol = opts.xatol ?? 1e-10;
  const fatol = opts.fatol ?? 1e-12;
  const step = opts.step ?? 0.05;
  const nonzeroStep = opts.nonzeroStep ?? 0.00025;

  // Count every loss evaluation (surfaced for the "fine-tuning" story).
  let funcEvals = 0;
  const f = (x: number[]) => {
    funcEvals++;
    return rawF(x);
  };
  const trajectory: TraceStep[] | undefined = opts.trace ? [] : undefined;

  // scipy's standard coefficients
  const rho = 1; // reflection
  const chi = 2; // expansion
  const psi = 0.5; // contraction
  const sigma = 0.5; // shrink

  // Build the initial simplex (n+1 vertices)
  let simplex: number[][] = [x0.slice()];
  for (let i = 0; i < n; i++) {
    const v = x0.slice();
    v[i] = v[i] !== 0 ? v[i] * (1 + step) : nonzeroStep;
    simplex.push(v);
  }
  let fvals = simplex.map(f);

  const order = () => {
    const idx = fvals.map((_, i) => i).sort((a, b) => fvals[a] - fvals[b]);
    simplex = idx.map((i) => simplex[i]);
    fvals = idx.map((i) => fvals[i]);
  };

  let iter = 0;
  order();
  if (trajectory) trajectory.push({ iter: 0, fun: fvals[0], x: simplex[0].slice() });
  for (; iter < maxIter; iter++) {
    // Convergence: simplex spread in x and f both below tolerance
    let xspread = 0;
    let fspread = 0;
    for (let i = 1; i <= n; i++) {
      for (let j = 0; j < n; j++) {
        xspread = Math.max(xspread, Math.abs(simplex[i][j] - simplex[0][j]));
      }
      fspread = Math.max(fspread, Math.abs(fvals[i] - fvals[0]));
    }
    if (xspread <= xatol && fspread <= fatol) break;

    // Centroid of all but the worst vertex
    const centroid = new Array<number>(n).fill(0);
    for (let i = 0; i < n; i++) {
      for (let j = 0; j < n; j++) centroid[j] += simplex[i][j];
    }
    for (let j = 0; j < n; j++) centroid[j] /= n;

    const worst = simplex[n];
    const reflect = centroid.map((c, j) => c + rho * (c - worst[j]));
    const fr = f(reflect);

    if (fr < fvals[0]) {
      // Expand
      const expand = centroid.map((c, j) => c + rho * chi * (c - worst[j]));
      const fe = f(expand);
      if (fe < fr) {
        simplex[n] = expand;
        fvals[n] = fe;
      } else {
        simplex[n] = reflect;
        fvals[n] = fr;
      }
    } else if (fr < fvals[n - 1]) {
      simplex[n] = reflect;
      fvals[n] = fr;
    } else {
      // Contraction
      let shrink = false;
      if (fr < fvals[n]) {
        // outside contraction
        const oc = centroid.map((c, j) => c + psi * rho * (c - worst[j]));
        const foc = f(oc);
        if (foc <= fr) {
          simplex[n] = oc;
          fvals[n] = foc;
        } else shrink = true;
      } else {
        // inside contraction
        const ic = centroid.map((c, j) => c - psi * (c - worst[j]));
        const fic = f(ic);
        if (fic < fvals[n]) {
          simplex[n] = ic;
          fvals[n] = fic;
        } else shrink = true;
      }
      if (shrink) {
        for (let i = 1; i <= n; i++) {
          simplex[i] = simplex[0].map((b, j) => b + sigma * (simplex[i][j] - b));
          fvals[i] = f(simplex[i]);
        }
      }
    }
    order();
    if (trajectory) trajectory.push({ iter: iter + 1, fun: fvals[0], x: simplex[0].slice() });
  }

  return {
    x: simplex[0],
    fun: fvals[0],
    iterations: iter,
    converged: iter < maxIter,
    funcEvals,
    trajectory,
  };
}

/** Run Nelder-Mead from several starts and keep the best minimum. */
export function multiStart(
  f: (x: number[]) => number,
  starts: number[][],
  opts: NMOptions = {},
): NMResult {
  let best: NMResult | null = null;
  let totalEvals = 0;
  for (const s of starts) {
    const r = nelderMead(f, s, opts);
    totalEvals += r.funcEvals;
    if (!best || r.fun < best.fun) best = r;
  }
  return { ...best!, funcEvals: totalEvals };
}
