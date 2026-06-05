/**
 * Parity tests: the rebuilt TS engine vs. Equinor's Python reference.
 *
 * For each golden case we refit with our engine (identical loss config: p=1.4, no prior,
 * uniform weights) and check that the fitted CURVE μ(t) and the loss match the reference.
 * The curve is the parametrization-independent ground truth.
 */

import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { fitModel } from '../src/fit.js';
import { Hyperbolic, Exponential } from '../src/models.js';

const here = dirname(fileURLToPath(import.meta.url));
const golden = (f: string) => JSON.parse(readFileSync(join(here, 'golden', f), 'utf8'));

const config = golden('config.json');
const GRID: number[] = config.grid;
const P: number = config.p;

function maxRelDev(a: number[], b: number[]): number {
  let m = 0;
  for (let i = 0; i < a.length; i++) {
    const denom = Math.max(Math.abs(b[i]), 1e-12);
    m = Math.max(m, Math.abs(a[i] - b[i]) / denom);
  }
  return m;
}

interface GoldenFit {
  model: string;
  params: { qi: number; b?: number; Di: number };
  loss: number;
  mu_grid: number[];
}
interface GoldenCase {
  name: string;
  t: number[];
  y: number[];
  truth?: Record<string, number>;
  fit_hyperbolic: GoldenFit;
  fit_exponential: GoldenFit;
}

const synthetic: GoldenCase[] = golden('synthetic.json');
const wells: GoldenCase[] = golden('sodir_wells.json');

describe('parity: synthetic cases (clean data → tight match)', () => {
  for (const c of synthetic) {
    it(`${c.name}: hyperbolic curve matches reference`, () => {
      const fit = fitModel(Hyperbolic, c.t, c.y, { p: P });
      const mu = Hyperbolic.eval(fit.u, GRID);
      const dev = maxRelDev(mu, c.fit_hyperbolic.mu_grid);
      // Our optimizer must be at least as good as the reference's minimum.
      expect(fit.loss).toBeLessThanOrEqual(c.fit_hyperbolic.loss * (1 + 1e-4) + 1e-9);
      expect(dev).toBeLessThan(5e-3);
    });

    it(`${c.name}: exponential curve matches reference`, () => {
      const fit = fitModel(Exponential, c.t, c.y, { p: P });
      const mu = Exponential.eval(fit.u, GRID);
      const dev = maxRelDev(mu, c.fit_exponential.mu_grid);
      expect(fit.loss).toBeLessThanOrEqual(c.fit_exponential.loss * (1 + 1e-4) + 1e-9);
      expect(dev).toBeLessThan(5e-3);
    });
  }
});

describe('parity: real SODIR wells', () => {
  let worstCurve = 0;
  for (const c of wells) {
    it(`${c.name}: hyperbolic curve within 1% of reference`, () => {
      const fit = fitModel(Hyperbolic, c.t, c.y, { p: P });
      const mu = Hyperbolic.eval(fit.u, GRID);
      const dev = maxRelDev(mu, c.fit_hyperbolic.mu_grid);
      worstCurve = Math.max(worstCurve, dev);
      // Engine reaches an equal-or-better loss minimum than the reference.
      expect(fit.loss).toBeLessThanOrEqual(c.fit_hyperbolic.loss * (1 + 1e-3) + 1e-6);
      expect(dev).toBeLessThan(1e-2);
    });
  }
  it('reports worst-case curve deviation across all wells', () => {
    // Visible in test output; the article cites this number.
    console.log(`  ↳ worst-case SODIR curve deviation: ${(worstCurve * 100).toFixed(4)}%`);
    expect(worstCurve).toBeLessThan(1e-2);
  });
});
