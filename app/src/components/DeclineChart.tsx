/**
 * Hand-rolled SVG decline chart — no charting dependency.
 * Renders: historical production (dots), fitted+forecast curve (line), confidence band
 * (shaded), split marker between history and forecast, optional log-y scale.
 */
import { useMemo, useState } from 'react';
import { MODELS } from '@workollab/auto-dca-engine';
import { COLOR, LABEL, type Live } from '../lib/useFitPlayback.js';

export interface XY {
  t: number;
  q: number;
}

interface Props {
  history: XY[];
  forecast: XY[];
  band?: { t: number[]; lower: number[]; upper: number[] } | null;
  tLast: number;
  economicLimitTime?: number | null;
  /** Time where hyperbolic switches to terminal exponential decline. */
  terminalSwitchTime?: number | null;
  tUnit: string;
  rateUnit: string;
  /** When set (during the fit animation), preview this candidate's forecast instead. */
  preview?: Live | null;
}

const W = 720;
const H = 380;
const M = { top: 18, right: 18, bottom: 42, left: 64 };
const innerW = W - M.left - M.right;
const innerH = H - M.top - M.bottom;

export default function DeclineChart({
  history,
  forecast,
  band,
  tLast,
  economicLimitTime,
  terminalSwitchTime,
  tUnit,
  rateUnit,
  preview,
}: Props) {
  const [logY, setLogY] = useState(true);

  const { sx, sy, xTicks, yTicks, tMax } = useMemo(() => {
    const allT = [...history.map((p) => p.t), ...forecast.map((p) => p.t)];
    const allQ = [...history.map((p) => p.q), ...forecast.map((p) => p.q)];
    if (band) allQ.push(...band.lower.filter((v) => v > 0), ...band.upper);
    const tMax = Math.max(...allT, 1);
    const qPos = allQ.filter((v) => v > 0);
    let qMin = Math.min(...qPos);
    let qMax = Math.max(...allQ);
    if (!Number.isFinite(qMin)) qMin = 1e-3;
    if (!Number.isFinite(qMax)) qMax = 1;

    const sx = (t: number) => M.left + (t / tMax) * innerW;

    let sy: (q: number) => number;
    let yTicks: { v: number; y: number }[];
    if (logY) {
      const lo = Math.floor(Math.log10(qMin));
      const hi = Math.ceil(Math.log10(qMax));
      sy = (q: number) => {
        const lq = Math.log10(Math.max(q, Math.pow(10, lo)));
        return M.top + innerH - ((lq - lo) / (hi - lo)) * innerH;
      };
      yTicks = [];
      for (let e = lo; e <= hi; e++) yTicks.push({ v: Math.pow(10, e), y: sy(Math.pow(10, e)) });
    } else {
      const pad = (qMax - 0) * 0.05;
      sy = (q: number) => M.top + innerH - ((q - 0) / (qMax + pad)) * innerH;
      yTicks = [];
      const n = 5;
      for (let i = 0; i <= n; i++) {
        const v = ((qMax + pad) * i) / n;
        yTicks.push({ v, y: sy(v) });
      }
    }

    const xTicks: { v: number; x: number }[] = [];
    const nX = 6;
    for (let i = 0; i <= nX; i++) {
      const v = (tMax * i) / nX;
      xTicks.push({ v, x: sx(v) });
    }
    return { sx, sy, xTicks, yTicks, tMax };
  }, [history, forecast, band, logY]);

  const line = (pts: XY[]) =>
    pts
      .filter((p) => p.q > 0)
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${sx(p.t).toFixed(1)},${sy(p.q).toFixed(1)}`)
      .join(' ');

  const bandPath = useMemo(() => {
    if (!band) return '';
    const top = band.t.map((t, i) => `${sx(t).toFixed(1)},${sy(Math.max(band.upper[i], 1e-9)).toFixed(1)}`);
    const bot = band.t
      .map((t, i) => `${sx(t).toFixed(1)},${sy(Math.max(band.lower[i], 1e-9)).toFixed(1)}`)
      .reverse();
    return `M${top.join(' L')} L${bot.join(' L')} Z`;
  }, [band, sx, sy]);

  // Candidate forecast preview during the fit animation, drawn over the fixed chart domain.
  const previewPath = useMemo(() => {
    if (!preview) return '';
    const n = 100;
    let d = '';
    let started = false;
    for (let i = 0; i <= n; i++) {
      const t = (tMax * i) / n;
      const q = MODELS[preview.model].eval(preview.u, [t])[0];
      if (!(q > 0) || !Number.isFinite(q)) continue;
      d += `${started ? 'L' : 'M'}${sx(t).toFixed(1)},${sy(q).toFixed(1)}`;
      started = true;
    }
    return d;
  }, [preview, sx, sy, tMax]);

  const splitX = sx(tLast);
  const ecX = economicLimitTime != null && economicLimitTime <= tMax ? sx(economicLimitTime) : null;
  const tsX =
    !preview && terminalSwitchTime != null && terminalSwitchTime > 0 && terminalSwitchTime <= tMax
      ? sx(terminalSwitchTime)
      : null;

  const fmtT = (v: number) => (v >= 100 ? v.toFixed(0) : v.toFixed(1));
  const fmtQ = (v: number) =>
    v >= 1000 ? v.toExponential(0) : v >= 1 ? v.toFixed(0) : v.toPrecision(2);

  return (
    <div className="card p-3">
      <div className="mb-1 flex items-center justify-between px-1">
        <h3 className="text-sm font-medium text-fg">
          Production decline & forecast
          {preview && (
            <span className="ml-2 text-xs font-normal" style={{ color: COLOR[preview.model] }}>
              ● previewing {LABEL[preview.model]} · iter {preview.iter}
            </span>
          )}
        </h3>
        <button className="btn text-xs" onClick={() => setLogY((v) => !v)}>
          {logY ? 'Log scale' : 'Linear scale'}
        </button>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Decline curve chart">
        {/* gridlines */}
        {yTicks.map((tk, i) => (
          <g key={`y${i}`}>
            <line x1={M.left} x2={W - M.right} y1={tk.y} y2={tk.y} stroke="#2a2f3a" strokeWidth={1} />
            <text x={M.left - 8} y={tk.y + 3} textAnchor="end" fontSize="10" fill="#9aa0ab">
              {fmtQ(tk.v)}
            </text>
          </g>
        ))}
        {xTicks.map((tk, i) => (
          <g key={`x${i}`}>
            <line x1={tk.x} x2={tk.x} y1={M.top} y2={M.top + innerH} stroke="#1c212d" strokeWidth={1} />
            <text x={tk.x} y={H - M.bottom + 16} textAnchor="middle" fontSize="10" fill="#9aa0ab">
              {fmtT(tk.v)}
            </text>
          </g>
        ))}

        {/* forecast region shading */}
        <rect x={splitX} y={M.top} width={W - M.right - splitX} height={innerH} fill="#6cb6ff" opacity={0.04} />

        {/* confidence band (dimmed while previewing a candidate) */}
        {band && <path d={bandPath} fill="#6cb6ff" opacity={preview ? 0.04 : 0.14} />}

        {/* fitted + forecast line (best fit; faded to a reference while previewing) */}
        <path d={line(forecast)} fill="none" stroke="#6cb6ff" strokeWidth={2} opacity={preview ? 0.18 : 1} />

        {/* live candidate forecast preview */}
        {preview && previewPath && (
          <path d={previewPath} fill="none" stroke={COLOR[preview.model]} strokeWidth={2.4} strokeDasharray="5 4" />
        )}

        {/* history/forecast split */}
        <line x1={splitX} x2={splitX} y1={M.top} y2={M.top + innerH} stroke="#9aa0ab" strokeWidth={1} strokeDasharray="4 4" />
        <text x={splitX + 4} y={M.top + 12} fontSize="10" fill="#9aa0ab">
          forecast →
        </text>

        {/* economic limit */}
        {ecX != null && (
          <>
            <line x1={ecX} x2={ecX} y1={M.top} y2={M.top + innerH} stroke="#f5b454" strokeWidth={1} strokeDasharray="2 3" />
            <text x={ecX - 4} y={M.top + 12} textAnchor="end" fontSize="10" fill="#f5b454">
              econ. limit
            </text>
          </>
        )}

        {/* terminal-decline switch (hyperbolic -> exponential) */}
        {tsX != null && (
          <>
            <line x1={tsX} x2={tsX} y1={M.top} y2={M.top + innerH} stroke="#a78bfa" strokeWidth={1} strokeDasharray="2 3" />
            <text x={tsX + 4} y={M.top + 24} fontSize="10" fill="#a78bfa">
              terminal Dₘᵢₙ
            </text>
          </>
        )}

        {/* history dots */}
        {history
          .filter((p) => p.q > 0)
          .map((p, i) => (
            <circle key={i} cx={sx(p.t)} cy={sy(p.q)} r={2} fill="#6dd3a3" opacity={0.85} />
          ))}

        {/* axis labels */}
        <text x={M.left + innerW / 2} y={H - 4} textAnchor="middle" fontSize="11" fill="#6b7280">
          time ({tUnit})
        </text>
        <text
          x={14}
          y={M.top + innerH / 2}
          textAnchor="middle"
          fontSize="11"
          fill="#6b7280"
          transform={`rotate(-90 14 ${M.top + innerH / 2})`}
        >
          rate ({rateUnit})
        </text>
      </svg>
      <div className="mt-1 flex gap-4 px-2 text-[11px] text-muted">
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-2 rounded-full bg-oil" /> history
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-[2px] w-4 bg-accent" /> fit + forecast
        </span>
        <span className="flex items-center gap-1">
          <span className="inline-block h-2 w-3 bg-accent/30" /> 80% band
        </span>
      </div>
    </div>
  );
}
