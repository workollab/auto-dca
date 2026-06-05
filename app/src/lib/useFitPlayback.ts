/**
 * Shared "watch it fit" playback timeline.
 *
 * One timeline, read by both the search view (FitAnimation, over the history range) and the
 * forecast chart (DeclineChart preview). Plays through each Arps family in canonical order,
 * exposing the current candidate + parameter vector each frame, then settles (live = null).
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import type { AutoSelection, ModelName } from '@workollab/auto-dca-engine';

export const ORDER: ModelName[] = ['exponential', 'harmonic', 'hyperbolic'];
export const COLOR: Record<ModelName, string> = {
  exponential: '#f5b454',
  harmonic: '#a78bfa',
  hyperbolic: '#6cb6ff',
};
export const LABEL: Record<ModelName, string> = {
  exponential: 'Exponential',
  harmonic: 'Harmonic',
  hyperbolic: 'Hyperbolic',
};

const MAX_FRAMES = 44;
const SEG_MS = 1600; // animation time per family

export interface Frame {
  u: number[];
  fun: number;
  iter: number;
}
export interface PlaybackCand {
  model: ModelName;
  frames: Frame[];
  finalLoss: number;
  totalIters: number;
  evals: number;
  isBest: boolean;
}
export interface Live {
  model: ModelName;
  u: number[];
  iter: number;
  loss: number;
  segIndex: number;
}
export interface Playback {
  cands: PlaybackCand[];
  totalEvals: number;
  playing: boolean;
  settled: boolean;
  /** Current candidate frame while playing; null once settled (show the best fit). */
  live: Live | null;
  segIndex: number;
  play: () => void;
}

function sample(trace: { x: number[]; fun: number; iter: number }[]): Frame[] {
  if (!trace || trace.length === 0) return [];
  if (trace.length <= MAX_FRAMES) return trace.map((s) => ({ u: s.x, fun: s.fun, iter: s.iter }));
  const out: Frame[] = [];
  for (let i = 0; i < MAX_FRAMES; i++) {
    const idx = Math.round((i / (MAX_FRAMES - 1)) * (trace.length - 1));
    out.push({ u: trace[idx].x, fun: trace[idx].fun, iter: trace[idx].iter });
  }
  return out;
}

export function useFitPlayback(selection: AutoSelection | null): Playback {
  const cands: PlaybackCand[] = useMemo(() => {
    if (!selection) return [];
    const byModel = new Map(selection.ranked.map((c) => [c.model, c]));
    return ORDER.map((name) => {
      const c = byModel.get(name)!;
      return {
        model: name,
        frames: sample(c.fit.trace ?? []),
        finalLoss: c.fit.loss,
        totalIters: c.fit.trace ? c.fit.trace[c.fit.trace.length - 1].iter : 0,
        evals: c.fit.funcEvals,
        isBest: selection.best.model === name,
      };
    }).filter((c) => c.frames.length > 0);
  }, [selection]);

  const totalEvals = cands.reduce((s, c) => s + c.evals, 0);
  const N = cands.length;
  const totalMs = N * SEG_MS;

  const [progress, setProgress] = useState(1);
  const [playing, setPlaying] = useState(false);
  const raf = useRef<number | null>(null);
  const startTs = useRef<number | null>(null);

  function cancel() {
    if (raf.current != null) cancelAnimationFrame(raf.current);
    raf.current = null;
  }
  function play() {
    cancel();
    setPlaying(true);
    startTs.current = null;
    const tick = (ts: number) => {
      if (startTs.current == null) startTs.current = ts;
      const p = Math.min((ts - startTs.current) / totalMs, 1);
      setProgress(p);
      if (p < 1) raf.current = requestAnimationFrame(tick);
      else setPlaying(false);
    };
    raf.current = requestAnimationFrame(tick);
  }

  // autoplay once per new selection
  useEffect(() => {
    play();
    return cancel;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cands]);

  const settled = progress >= 1;
  const segFloat = progress * N;
  const segIndex = Math.min(Math.floor(segFloat), N - 1);
  const local = settled ? 1 : segFloat - segIndex;
  const cur = cands[segIndex];
  const frameIdx = cur
    ? Math.min(Math.floor(local * (cur.frames.length - 1)), cur.frames.length - 1)
    : 0;
  const cf = cur?.frames[frameIdx];
  const live: Live | null =
    settled || !cur || !cf ? null : { model: cur.model, u: cf.u, iter: cf.iter, loss: cf.fun, segIndex };

  return { cands, totalEvals, playing, settled, live, segIndex, play };
}
