/** Number / unit formatting helpers. */

export function fmt(n: number | null | undefined, sig = 4): string {
  if (n == null || !Number.isFinite(n)) return '—';
  const abs = Math.abs(n);
  if (abs !== 0 && (abs < 1e-3 || abs >= 1e6)) return n.toExponential(2);
  if (abs >= 1000) return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
  return Number(n.toPrecision(sig)).toString();
}

export function fmtPct(n: number): string {
  if (!Number.isFinite(n)) return '—';
  return `${(n * 100).toFixed(1)}%`;
}

/** Decline as a percentage per year given a per-(time-unit) nominal decline. */
export function annualDecline(Di: number, tUnit: string): string {
  const perYear = tUnit === 'months' ? Di * 12 : tUnit === 'days' ? Di * 365 : Di;
  // effective annual decline 1 - exp(-D)
  return fmtPct(1 - Math.exp(-perYear));
}

/** Convert an effective annual decline (%) to a nominal decline per time-unit. */
export function annualEffToNominal(annualPct: number, tUnit: string): number {
  const De = Math.min(Math.max(annualPct / 100, 0), 0.999);
  const aAnnual = -Math.log(1 - De); // nominal annual
  if (tUnit === 'days') return aAnnual / 365.25;
  if (tUnit === 'months') return aAnnual / 12;
  return aAnnual; // 'unit' fallback: interpret input as per-unit effective
}

export const MODEL_LABEL: Record<string, string> = {
  exponential: 'Exponential',
  hyperbolic: 'Hyperbolic',
  harmonic: 'Harmonic',
};
