/**
 * Closed-form unit tests for the decline models: round-trip parametrization, cumulative vs.
 * numeric integral, EUR, economic-limit time, and degenerate-case consistency.
 */

import { describe, it, expect } from 'vitest';
import { Exponential, Hyperbolic, Harmonic } from '../src/models.js';
import { forecast } from '../src/forecast.js';

/** Trapezoidal integral of μ(t) on a fine grid for cross-checking closed forms. */
function numericCum(model: any, u: number[], T: number, n = 200000): number {
  const h = T / n;
  let s = 0;
  for (let i = 0; i < n; i++) {
    const a = model.eval(u, [i * h])[0];
    const b = model.eval(u, [(i + 1) * h])[0];
    s += ((a + b) / 2) * h;
  }
  return s;
}

describe('Exponential', () => {
  const u = Exponential.fromOriginal({ qi: 1000, Di: 0.1, b: 0 });
  it('round-trips engineering params', () => {
    const p = Exponential.toOriginal(u);
    expect(p.qi).toBeCloseTo(1000, 6);
    expect(p.Di).toBeCloseTo(0.1, 6);
    expect(p.b).toBe(0);
  });
  it('cumulative matches numeric integral', () => {
    expect(Exponential.cumulative(u, [20])[0]).toBeCloseTo(numericCum(Exponential, u, 20), 2);
  });
  it('EUR = C/k', () => {
    expect(Exponential.eurInf(u)!).toBeCloseTo(1000 / 0.1, 6);
  });
  it('economic-limit time solves μ(t)=q', () => {
    const t = Exponential.timeAtRate(u, 100);
    expect(Exponential.eval(u, [t])[0]).toBeCloseTo(100, 6);
  });
});

describe('Hyperbolic', () => {
  const u = Hyperbolic.fromOriginal({ qi: 1000, Di: 0.1, b: 0.6 });
  it('round-trips engineering params', () => {
    const p = Hyperbolic.toOriginal(u);
    expect(p.qi).toBeCloseTo(1000, 5);
    expect(p.Di).toBeCloseTo(0.1, 5);
    expect(p.b).toBeCloseTo(0.6, 5);
  });
  it('cumulative matches numeric integral', () => {
    expect(Hyperbolic.cumulative(u, [30])[0]).toBeCloseTo(numericCum(Hyperbolic, u, 30), 1);
  });
  it('EUR (b<1) = qi/(Di(1-b))', () => {
    expect(Hyperbolic.eurInf(u)!).toBeCloseTo(1000 / (0.1 * (1 - 0.6)), 4);
  });
  it('economic-limit time solves μ(t)=q', () => {
    const t = Hyperbolic.timeAtRate(u, 50);
    expect(Hyperbolic.eval(u, [t])[0]).toBeCloseTo(50, 6);
  });
});

describe('Harmonic', () => {
  const u = Harmonic.fromOriginal({ qi: 1000, Di: 0.1, b: 1 });
  it('cumulative matches numeric integral', () => {
    expect(Harmonic.cumulative(u, [40])[0]).toBeCloseTo(numericCum(Harmonic, u, 40), 1);
  });
  it('has no finite EUR (diverges)', () => {
    expect(Harmonic.eurInf(u)).toBeNull();
  });
});

describe('forecast + EUR reporting', () => {
  const u = Hyperbolic.fromOriginal({ qi: 1000, Di: 0.1, b: 0.6 });
  it('reports EUR to infinity, horizon, and economic limit', () => {
    const f = forecast(Hyperbolic, u, 12, { horizon: 240, economicLimit: 20 });
    expect(f.eur.toInfinity!).toBeGreaterThan(0);
    expect(f.eur.toHorizon).toBeGreaterThan(0);
    expect(f.eur.toEconomicLimit!).toBeGreaterThan(0);
    expect(f.eur.economicLimitTime!).toBeGreaterThan(0);
    // EUR to economic limit should be below EUR to infinity
    expect(f.eur.toEconomicLimit!).toBeLessThan(f.eur.toInfinity!);
  });
});

describe('terminal decline (Modified Arps)', () => {
  it('switches hyperbolic to exponential at D(t)=Dmin and lowers EUR', () => {
    const u = Hyperbolic.fromOriginal({ qi: 1000, Di: 0.1, b: 0.8 });
    const pure = forecast(Hyperbolic, u, 12, { horizon: 1200 });
    const mod = forecast(Hyperbolic, u, 12, { horizon: 1200, terminalDecline: 0.01 });
    expect(mod.terminalSwitchTime!).toBeGreaterThan(0);
    // terminal decline makes the tail steeper -> EUR to infinity is finite and lower
    expect(mod.eur.toInfinity!).toBeLessThan(pure.eur.toInfinity!);
    // rate is continuous across the switch (C1 by construction)
    const ts = mod.terminalSwitchTime!;
    const before = Hyperbolic.eval(u, [ts])[0];
    const after = forecast(Hyperbolic, u, 12, { horizon: 1200, terminalDecline: 0.01, steps: 4000 })
      .curve.reduce((best, p) => (Math.abs(p.t - ts) < Math.abs(best.t - ts) ? p : best)).q;
    expect(after).toBeCloseTo(before, 1);
  });

  it('gives harmonic a finite EUR (which otherwise diverges)', () => {
    const u = Harmonic.fromOriginal({ qi: 1000, Di: 0.1, b: 1 });
    expect(Harmonic.eurInf(u)).toBeNull();
    const f = forecast(Harmonic, u, 12, { horizon: 5000, terminalDecline: 0.01 });
    expect(f.terminalSwitchTime!).toBeGreaterThan(0);
    expect(f.eur.toInfinity!).toBeGreaterThan(0);
    expect(Number.isFinite(f.eur.toInfinity!)).toBe(true);
  });

  it('does not apply to exponential', () => {
    const u = Exponential.fromOriginal({ qi: 1000, Di: 0.1, b: 0 });
    const f = forecast(Exponential, u, 12, { horizon: 600, terminalDecline: 0.01 });
    expect(f.terminalSwitchTime).toBeNull();
  });
});
