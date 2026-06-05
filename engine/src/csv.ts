/**
 * CSV ingestion with column auto-detection.
 *
 * Accepts either (date, rate) or (t, rate) layouts. Dates are converted to elapsed time in
 * the chosen unit (default months). Returns a clean numeric series ready for the engine.
 */

export interface ParsedSeries {
  /** Elapsed time from the first point, in `tUnit`. */
  t: number[];
  /** Production rate. */
  q: number[];
  /** Original labels for each point (date string or index). */
  labels: string[];
  tUnit: 'months' | 'days' | 'unit';
  /** Which columns were detected. */
  columns: { time: string; rate: string };
}

export interface ParseOptions {
  tUnit?: 'months' | 'days' | 'unit';
  /** Explicit column names to override auto-detection. */
  timeColumn?: string;
  rateColumn?: string;
}

const DATE_HINTS = ['date', 'month', 'time', 'period', 'day', 'prfyear'];
const RATE_HINTS = ['rate', 'oil', 'gas', 'prod', 'q', 'bbl', 'boe', 'volume', 'sm3', 'mcf'];

/** Parse a CSV string into a numeric production series. */
export function parseCsv(text: string, opts: ParseOptions = {}): ParsedSeries {
  const rows = splitCsv(text);
  if (rows.length < 2) throw new Error('CSV needs a header row and at least one data row.');
  const header = rows[0].map((h) => h.trim());
  const lower = header.map((h) => h.toLowerCase());

  const timeIdx = opts.timeColumn
    ? header.indexOf(opts.timeColumn)
    : pickColumn(lower, DATE_HINTS, rows, true);
  const rateIdx = opts.rateColumn
    ? header.indexOf(opts.rateColumn)
    : pickColumn(lower, RATE_HINTS, rows, false);

  if (timeIdx < 0 || rateIdx < 0) {
    throw new Error(
      'Could not detect time and rate columns. Expected something like (date, rate).',
    );
  }

  const rawDates: string[] = [];
  const rawRates: number[] = [];
  const numericTimes: number[] = [];
  let datesAreNumeric = true;

  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (row.length <= Math.max(timeIdx, rateIdx)) continue;
    const rateStr = row[rateIdx]?.trim();
    const timeStr = row[timeIdx]?.trim();
    if (!rateStr || !timeStr) continue;
    const rate = Number(rateStr.replace(/[, ]/g, ''));
    if (!Number.isFinite(rate)) continue;
    rawDates.push(timeStr);
    rawRates.push(rate);
    const asNum = Number(timeStr);
    if (Number.isFinite(asNum)) numericTimes.push(asNum);
    else datesAreNumeric = false;
  }

  if (rawRates.length === 0) throw new Error('No numeric data rows found.');

  let t: number[];
  let tUnit: ParsedSeries['tUnit'];
  if (datesAreNumeric && numericTimes.length === rawRates.length) {
    const t0 = numericTimes[0];
    t = numericTimes.map((v) => v - t0);
    tUnit = opts.tUnit ?? 'unit';
  } else {
    const parsed = rawDates.map(parseDate);
    const valid = parsed.filter((d) => d != null) as number[];
    if (valid.length !== rawDates.length) {
      throw new Error('Some time values could not be parsed as dates or numbers.');
    }
    const t0 = parsed[0]!;
    tUnit = opts.tUnit ?? 'months';
    const perUnit = tUnit === 'days' ? 86400000 : 86400000 * 30.4375; // ms per day/month
    t = parsed.map((d) => (d! - t0) / perUnit);
  }

  return {
    t,
    q: rawRates,
    labels: rawDates,
    tUnit,
    columns: { time: header[timeIdx], rate: header[rateIdx] },
  };
}

function pickColumn(lower: string[], hints: string[], rows: string[][], preferFirst: boolean): number {
  // 1) header keyword match
  for (const h of hints) {
    const idx = lower.findIndex((c) => c.includes(h));
    if (idx >= 0) return idx;
  }
  // 2) fall back to a numeric column (rate) or the first column (time)
  if (preferFirst) return 0;
  for (let c = lower.length - 1; c >= 0; c--) {
    let numeric = 0;
    for (let r = 1; r < Math.min(rows.length, 8); r++) {
      if (Number.isFinite(Number((rows[r][c] ?? '').replace(/[, ]/g, '')))) numeric++;
    }
    if (numeric >= 1) return c;
  }
  return -1;
}

/** Minimal CSV splitter handling quoted fields and commas. */
function splitCsv(text: string): string[][] {
  const out: string[][] = [];
  const lines = text.replace(/\r\n?/g, '\n').replace(/^﻿/, '').split('\n');
  for (const line of lines) {
    if (line.trim() === '') continue;
    const fields: string[] = [];
    let cur = '';
    let inQ = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inQ) {
        if (ch === '"' && line[i + 1] === '"') {
          cur += '"';
          i++;
        } else if (ch === '"') inQ = false;
        else cur += ch;
      } else if (ch === '"') inQ = true;
      else if (ch === ',') {
        fields.push(cur);
        cur = '';
      } else cur += ch;
    }
    fields.push(cur);
    out.push(fields);
  }
  return out;
}

/** Parse a date string to epoch ms. Supports YYYY-MM, YYYY-MM-DD, MM/DD/YYYY, etc. */
function parseDate(s: string): number | null {
  const ym = /^(\d{4})[-/](\d{1,2})$/.exec(s);
  if (ym) return Date.UTC(Number(ym[1]), Number(ym[2]) - 1, 1);
  const ymd = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(s);
  if (ymd) return Date.UTC(Number(ymd[1]), Number(ymd[2]) - 1, Number(ymd[3]));
  const parsed = Date.parse(s);
  return Number.isNaN(parsed) ? null : parsed;
}
