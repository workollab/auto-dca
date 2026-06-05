/** CSV ingestion + end-to-end autoDCA on parsed data. */
import { describe, it, expect } from 'vitest';
import { parseCsv } from '../src/csv.js';
import { autoDCA } from '../src/index.js';

describe('parseCsv', () => {
  it('parses (date, rate) with YYYY-MM dates into elapsed months', () => {
    const csv = 'date,rate\n2020-01,1000\n2020-02,940\n2020-03,890\n2020-04,850';
    const p = parseCsv(csv);
    expect(p.columns).toEqual({ time: 'date', rate: 'rate' });
    expect(p.tUnit).toBe('months');
    expect(p.t[0]).toBe(0);
    expect(p.t[1]).toBeCloseTo(1, 1);
    expect(p.q).toEqual([1000, 940, 890, 850]);
  });

  it('parses numeric time columns as elapsed units', () => {
    const csv = 't,oil\n0,500\n1,460\n2,430\n3,400';
    const p = parseCsv(csv);
    expect(p.t).toEqual([0, 1, 2, 3]);
    expect(p.q[0]).toBe(500);
  });

  it('auto-detects oil column among several and handles quoted/comma numbers', () => {
    const csv = 'month,water,oil\n2021-01,"10","1,200"\n2021-02,12,1100\n2021-03,15,1010\n2021-04,18,950';
    const p = parseCsv(csv);
    expect(p.columns.rate).toBe('oil');
    expect(p.q[0]).toBe(1200);
  });

  it('throws a helpful error on unparseable input', () => {
    expect(() => parseCsv('hello world')).toThrow();
  });

  it('feeds cleanly into autoDCA end-to-end', () => {
    // synthetic exponential decline, monthly
    const rows = ['date,rate'];
    for (let m = 0; m < 36; m++) {
      const y = 2020 + Math.floor(m / 12);
      const mo = (m % 12) + 1;
      const q = 1000 * Math.exp(-0.05 * m);
      rows.push(`${y}-${String(mo).padStart(2, '0')},${q.toFixed(2)}`);
    }
    const p = parseCsv(rows.join('\n'));
    const r = autoDCA(p.t, p.q, { economicLimit: 50, band: false });
    expect(r.selection.best.fit.diagnostics.r2).toBeGreaterThan(0.99);
    expect(r.forecast.eur.toEconomicLimit).toBeGreaterThan(0);
  });
});
