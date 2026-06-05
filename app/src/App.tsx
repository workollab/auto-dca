import { useEffect, useMemo, useState } from 'react';
import { autoDCA, type AutoDCAResult } from '@workollab/auto-dca-engine';
import Uploader, { type Dataset } from './components/Uploader.js';
import DeclineChart from './components/DeclineChart.js';
import FitAnimation from './components/FitAnimation.js';
import ResultCards from './components/ResultCards.js';
import ModelTable from './components/ModelTable.js';
import { useFitPlayback } from './lib/useFitPlayback.js';
import { fmt, annualEffToNominal } from './lib/format.js';

export default function App() {
  const [dataset, setDataset] = useState<Dataset | null>(null);
  const [econLimit, setEconLimit] = useState<number | ''>('');
  const [terminalOn, setTerminalOn] = useState(true);
  const [terminalPct, setTerminalPct] = useState(6); // effective % / yr
  const [result, setResult] = useState<AutoDCAResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const playback = useFitPlayback(result?.selection ?? null);

  // When a new dataset loads, prefill a sensible economic limit (2% of peak rate).
  useEffect(() => {
    if (!dataset) return;
    const peak = Math.max(...dataset.q);
    setEconLimit(Number((peak * 0.02).toPrecision(2)));
  }, [dataset]);

  const computeKey = useMemo(
    () =>
      dataset
        ? `${dataset.name}|${dataset.t.length}|${econLimit}|${terminalOn}|${terminalPct}`
        : '',
    [dataset, econLimit, terminalOn, terminalPct],
  );

  useEffect(() => {
    if (!dataset) return;
    setError(null);
    try {
      const terminalDecline =
        terminalOn && terminalPct > 0 ? annualEffToNominal(terminalPct, dataset.tUnit) : undefined;
      const r = autoDCA(dataset.t, dataset.q, {
        economicLimit: typeof econLimit === 'number' && econLimit > 0 ? econLimit : undefined,
        terminalDecline,
        band: true,
        bandSamples: 120,
        trace: true,
      });
      setResult(r);
    } catch (e) {
      setResult(null);
      setError(e instanceof Error ? e.message : 'Could not fit this series.');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [computeKey]);

  function downloadForecast() {
    if (!result || !dataset) return;
    const rows = [['t', 'rate', 'cumulative', 'kind']];
    result.series.t.forEach((t, i) =>
      rows.push([fmt(t, 6), fmt(result.series.q[i], 6), '', 'history']),
    );
    result.forecast.curve.forEach((p) =>
      rows.push([fmt(p.t, 6), fmt(p.q, 6), fmt(p.cum, 6), 'forecast']),
    );
    const csv = rows.map((r) => r.join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${dataset.name.replace(/\W+/g, '_')}_forecast.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="mx-auto min-h-full max-w-6xl px-4 py-6">
      {/* header */}
      <header className="mb-6 flex flex-col gap-1 border-b border-line pb-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <div className="flex items-center gap-2">
            <span className="font-mono text-sm text-oil">workollab</span>
            <span className="text-dim">/</span>
            <h1 className="text-xl font-semibold tracking-tight text-fg">Auto DCA</h1>
          </div>
          <p className="mt-1 text-sm text-muted">
            Decline-curve analysis for oil &amp; gas wells — auto Arps fit, forecast &amp; EUR,
            entirely in your browser.
          </p>
        </div>
        <a
          href="https://workollab.com"
          target="_blank"
          rel="noreferrer"
          className="text-xs text-muted hover:text-accent"
        >
          workollab.com →
        </a>
      </header>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[360px_1fr]">
        {/* left column: input + controls */}
        <div className="space-y-4">
          <Uploader onLoad={setDataset} />

          {dataset && (
            <div className="card p-4">
              <h3 className="mb-3 text-sm font-medium text-fg">2 · Economic limit</h3>
              <label className="stat-label">Abandonment rate ({dataset.rateUnit})</label>
              <input
                type="number"
                value={econLimit}
                min={0}
                step="any"
                onChange={(e) =>
                  setEconLimit(e.target.value === '' ? '' : Number(e.target.value))
                }
                className="mt-1 w-full rounded-lg border border-line bg-ink-800 px-3 py-1.5 font-mono text-sm text-fg outline-none focus:border-accent"
              />
              <p className="mt-2 text-[11px] text-dim">
                EUR is integrated until the rate drops to this value.
              </p>
            </div>
          )}

          {dataset && (
            <div className="card p-4">
              <div className="mb-3 flex items-center justify-between">
                <h3 className="text-sm font-medium text-fg">3 · Terminal decline</h3>
                <label className="flex cursor-pointer items-center gap-1.5 text-xs text-muted">
                  <input
                    type="checkbox"
                    checked={terminalOn}
                    onChange={(e) => setTerminalOn(e.target.checked)}
                    className="accent-accent"
                  />
                  Apply
                </label>
              </div>
              <label className="stat-label">Minimum decline (% / yr, effective)</label>
              <input
                type="number"
                value={terminalPct}
                min={0}
                max={99}
                step="any"
                disabled={!terminalOn}
                onChange={(e) => setTerminalPct(e.target.value === '' ? 0 : Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-line bg-ink-800 px-3 py-1.5 font-mono text-sm text-fg outline-none focus:border-accent disabled:opacity-40"
              />
              <p className="mt-2 text-[11px] text-dim">
                Modified Arps: hyperbolic decline switches to exponential once it slows to this
                rate — the SPE-standard guard against over-forecasting reserves.
              </p>
            </div>
          )}

          <div className="card p-4 text-[12px] leading-relaxed text-muted">
            <h3 className="mb-2 text-sm font-medium text-fg">How it works</h3>
            <p>
              We fit Arps decline models (exponential, hyperbolic, harmonic) in log-space with a
              robust p-norm loss, then auto-select the model with the best{' '}
              <span className="text-fg">cross-validated</span> forecast skill (expanding-window,
              robust to late-life anomalies). The shaded band is a residual-bootstrap 80% interval.
            </p>
            <p className="mt-2">
              The engine is a from-scratch TypeScript rebuild of Equinor's open{' '}
              <span className="text-fg">decline-curve-analysis</span>, validated to within{' '}
              <span className="font-mono text-oil">0.02&nbsp;ppm</span> of the reference on real
              North Sea fields.
            </p>
          </div>
        </div>

        {/* right column: results */}
        <div className="space-y-4">
          {!dataset && (
            <div className="card flex h-full min-h-[320px] flex-col items-center justify-center p-8 text-center">
              <div className="text-fg">Pick a sample well or drop a CSV to begin.</div>
              <div className="mt-2 max-w-md text-sm text-muted">
                Nothing is uploaded. The entire decline-curve fit runs locally on your machine —
                your production data never leaves the browser.
              </div>
            </div>
          )}

          {error && (
            <div className="card border-danger/40 bg-danger/5 p-4 text-sm text-danger">{error}</div>
          )}

          {result && dataset && (
            <>
              <div className="flex items-center justify-between">
                <div className="text-sm text-fg">
                  <span className="text-muted">Well:</span> {dataset.name}
                  <span className="ml-2 text-xs text-dim">
                    {result.series.t.length} points
                    {dataset.source ? ` · ${dataset.source}` : ''}
                  </span>
                </div>
                <button className="btn-accent text-xs" onClick={downloadForecast}>
                  ↓ forecast CSV
                </button>
              </div>

              <FitAnimation
                history={result.series.t.map((t, i) => ({ t, q: result.series.q[i] }))}
                selection={result.selection}
                playback={playback}
                tUnit={dataset.tUnit}
              />

              <DeclineChart
                history={result.series.t.map((t, i) => ({ t, q: result.series.q[i] }))}
                forecast={result.forecast.curve}
                band={result.band}
                tLast={result.series.t[result.series.t.length - 1]}
                economicLimitTime={result.forecast.eur.economicLimitTime}
                terminalSwitchTime={result.forecast.terminalSwitchTime}
                tUnit={dataset.tUnit}
                rateUnit={dataset.rateUnit}
                preview={playback.live}
              />

              <ResultCards
                result={result}
                rateUnit={dataset.rateUnit}
                tUnit={dataset.tUnit}
                volumeUnit={dataset.volumeUnit}
                terminalNote={
                  terminalOn && result.forecast.terminalSwitchTime != null
                    ? `${terminalPct}%/yr terminal · switch @ ${fmt(result.forecast.terminalSwitchTime, 3)} ${dataset.tUnit}`
                    : terminalOn
                      ? `${terminalPct}%/yr terminal (not reached)`
                      : 'pure Arps (no terminal)'
                }
              />

              <ModelTable selection={result.selection} />
            </>
          )}
        </div>
      </div>

      {/* footer */}
      <footer className="mt-10 border-t border-line pt-4 text-[11px] leading-relaxed text-dim">
        <p>
          Built by <a href="https://workollab.com" className="text-muted hover:text-accent">Workollab</a> — agentic
          AI &amp; software for small operators. Engine rebuilt from scratch from Equinor's{' '}
          <a
            href="https://github.com/equinor/decline-curve-analysis"
            className="text-muted hover:text-accent"
          >
            decline-curve-analysis
          </a>{' '}
          (MIT). Sample wells: SODIR / Norwegian Offshore Directorate open data (NLOD). This is a
          technical demo, not reserves advice.
        </p>
      </footer>
    </div>
  );
}
