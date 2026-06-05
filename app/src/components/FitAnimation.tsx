/**
 * "Watch it fit" search view — shows the engine trying each Arps family and fine-tuning
 * parameters over the HISTORY range. Driven by a shared playback timeline (so the forecast
 * chart below can stay in sync).
 */
import { useMemo } from 'react';
import { MODELS, type AutoSelection } from '@workollab/auto-dca-engine';
import type { XY } from './DeclineChart.js';
import { COLOR, LABEL, type Playback } from '../lib/useFitPlayback.js';

const W = 720;
const H = 300;
const M = { top: 16, right: 16, bottom: 30, left: 56 };
const innerW = W - M.left - M.right;
const innerH = H - M.top - M.bottom;

export default function FitAnimation({
  history,
  selection,
  playback,
  tUnit,
}: {
  history: XY[];
  selection: AutoSelection;
  playback: Playback;
  tUnit: string;
}) {
  const { cands, totalEvals, playing, settled, live, segIndex } = playback;

  const { sx, sy, grid, yTicks, xTicks } = useMemo(() => {
    const ts = history.map((p) => p.t);
    const qs = history.map((p) => p.q).filter((q) => q > 0);
    const tMax = Math.max(...ts, 1);
    const qMin = Math.min(...qs);
    const qMax = Math.max(...qs);
    const lo = Math.floor(Math.log10(qMin * 0.4));
    const hi = Math.ceil(Math.log10(qMax * 2.2));
    const sx = (t: number) => M.left + (Math.min(t, tMax) / tMax) * innerW;
    const sy = (q: number) => {
      const lq = Math.log10(Math.max(q, Math.pow(10, lo)));
      return M.top + innerH - ((Math.min(lq, hi) - lo) / (hi - lo)) * innerH;
    };
    const grid: number[] = [];
    for (let i = 0; i <= 80; i++) grid.push((tMax * i) / 80);
    const yTicks: { v: number; y: number }[] = [];
    for (let e = lo; e <= hi; e++) yTicks.push({ v: Math.pow(10, e), y: sy(Math.pow(10, e)) });
    const xTicks: { v: number; x: number }[] = [];
    for (let i = 0; i <= 5; i++) xTicks.push({ v: (tMax * i) / 5, x: sx((tMax * i) / 5) });
    return { sx, sy, grid, yTicks, xTicks };
  }, [history]);

  const curvePath = (model: keyof typeof MODELS, u: number[]) => {
    const ys = MODELS[model].eval(u, grid);
    let d = '';
    let started = false;
    for (let i = 0; i < grid.length; i++) {
      const q = ys[i];
      if (!(q > 0) || !Number.isFinite(q)) continue;
      d += `${started ? 'L' : 'M'}${sx(grid[i]).toFixed(1)},${sy(q).toFixed(1)}`;
      started = true;
    }
    return d;
  };

  const cur = cands[segIndex];
  const curParams = live ? MODELS[live.model].toOriginal(live.u) : null;

  return (
    <div className="card p-3">
      <div className="mb-1 flex items-center justify-between px-1">
        <h3 className="text-sm font-medium text-fg">
          Watch the engine fit
          <span className="ml-2 text-xs font-normal text-muted">
            {totalEvals.toLocaleString()} curve evaluations across 3 families
          </span>
        </h3>
        <button className="btn text-xs" onClick={playback.play} disabled={playing}>
          {playing ? 'fitting…' : '▶ replay'}
        </button>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full" role="img" aria-label="Curve fitting animation">
        {yTicks.map((tk, i) => (
          <g key={`y${i}`}>
            <line x1={M.left} x2={W - M.right} y1={tk.y} y2={tk.y} stroke="#1c212d" strokeWidth={1} />
            <text x={M.left - 8} y={tk.y + 3} textAnchor="end" fontSize="9" fill="#6b7280">
              {tk.v >= 1000 ? tk.v.toExponential(0) : tk.v >= 1 ? tk.v.toFixed(0) : tk.v.toPrecision(1)}
            </text>
          </g>
        ))}
        {xTicks.map((tk, i) => (
          <text key={`x${i}`} x={tk.x} y={H - M.bottom + 14} textAnchor="middle" fontSize="9" fill="#6b7280">
            {tk.v.toFixed(0)}
          </text>
        ))}

        {history
          .filter((p) => p.q > 0)
          .map((p, i) => (
            <circle key={i} cx={sx(p.t)} cy={sy(p.q)} r={1.7} fill="#6dd3a3" opacity={0.8} />
          ))}

        {/* ghost: completed families' final curves */}
        {!settled &&
          cands.slice(0, segIndex).map((c) => (
            <path
              key={`ghost-${c.model}`}
              d={curvePath(c.model, c.frames[c.frames.length - 1].u)}
              fill="none"
              stroke={COLOR[c.model]}
              strokeWidth={1.2}
              opacity={0.25}
            />
          ))}

        {/* settled: all final curves, winner emphasized */}
        {settled &&
          cands.map((c) => (
            <path
              key={`final-${c.model}`}
              d={curvePath(c.model, c.frames[c.frames.length - 1].u)}
              fill="none"
              stroke={COLOR[c.model]}
              strokeWidth={c.isBest ? 2.6 : 1.1}
              opacity={c.isBest ? 1 : 0.28}
            />
          ))}

        {/* live evolving curve */}
        {live && cur && (
          <path
            d={curvePath(live.model, live.u)}
            fill="none"
            stroke={COLOR[live.model]}
            strokeWidth={2.4}
            strokeDasharray="5 4"
          />
        )}
      </svg>

      {/* HUD */}
      <div className="mt-1 flex flex-wrap items-center gap-x-5 gap-y-1 px-2 font-mono text-[11px]">
        {live && curParams ? (
          <>
            <span className="text-fg">
              <span style={{ color: COLOR[live.model] }}>●</span> trying {LABEL[live.model]}
            </span>
            <span className="text-muted">iter {live.iter}</span>
            <span className="text-muted">b {curParams.b.toFixed(3)}</span>
            <span className="text-muted">
              Dᵢ {curParams.Di.toFixed(4)}/{tUnit.slice(0, 2)}
            </span>
            <span className="text-amber">loss {live.loss.toFixed(3)}</span>
          </>
        ) : (
          <>
            <span className="text-fg">
              best fit: <span style={{ color: COLOR[selection.best.model] }}>● {LABEL[selection.best.model]}</span>
            </span>
            <span className="text-muted">
              ranked by {selection.usedCV ? 'cross-validated forecast error' : 'AICc'}
            </span>
          </>
        )}
      </div>

      {/* per-family progress chips */}
      <div className="mt-2 grid grid-cols-3 gap-2 px-1">
        {cands.map((c, i) => {
          const done = settled || i < segIndex;
          const active = !settled && i === segIndex;
          return (
            <div
              key={c.model}
              className={`rounded-lg border px-2.5 py-1.5 text-[11px] transition-colors ${
                c.isBest && settled ? 'border-accent/50 bg-accent/10' : 'border-line'
              } ${active ? 'bg-ink-500' : ''}`}
            >
              <div className="flex items-center justify-between">
                <span style={{ color: COLOR[c.model] }}>{LABEL[c.model]}</span>
                {done && <span className="text-muted">{c.isBest ? '★ best' : '✓'}</span>}
                {active && <span className="text-muted">…</span>}
              </div>
              <div className="font-mono text-dim">
                {done ? `loss ${c.finalLoss.toFixed(2)} · ${c.totalIters} iters` : 'queued'}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
