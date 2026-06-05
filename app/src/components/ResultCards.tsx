/** Summary cards: chosen model, Arps parameters, EUR (three ways), fit diagnostics. */
import type { AutoDCAResult } from '@workollab/auto-dca-engine';
import { fmt, annualDecline, MODEL_LABEL } from '../lib/format.js';

interface Props {
  result: AutoDCAResult;
  rateUnit: string;
  tUnit: string;
  volumeUnit: string;
  /** Short description of the terminal-decline setting in effect. */
  terminalNote?: string;
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div>
      <div className="stat-label">{label}</div>
      <div className="font-mono text-lg text-fg">{value}</div>
      {sub && <div className="text-[11px] text-dim">{sub}</div>}
    </div>
  );
}

export default function ResultCards({ result, rateUnit, tUnit, volumeUnit, terminalNote }: Props) {
  const { selection, forecast } = result;
  const fit = selection.best.fit;
  const p = fit.params;
  const eur = forecast.eur;

  return (
    <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
      <div className="card p-4">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-medium text-fg">Best model</h3>
          <span className="rounded-md bg-accent/15 px-2 py-0.5 text-xs text-accent">
            {MODEL_LABEL[fit.model]}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Stat label="qᵢ (initial rate)" value={`${fmt(p.qi)}`} sub={rateUnit} />
          <Stat label="b (Arps exponent)" value={fmt(p.b, 3)} />
          <Stat label="Dᵢ (nominal)" value={`${fmt(p.Di, 3)} /${tUnit.slice(0, 2)}`} />
          <Stat label="Effective decline" value={annualDecline(p.Di, tUnit)} sub="per year" />
        </div>
      </div>

      <div className="card p-4">
        <div className="mb-3 flex items-baseline justify-between gap-2">
          <h3 className="text-sm font-medium text-fg">EUR — Estimated Ultimate Recovery</h3>
          {terminalNote && (
            <span className="text-[10px] text-violet" title="Modified Arps terminal decline">
              {terminalNote}
            </span>
          )}
        </div>
        <div className="space-y-3">
          <Stat
            label="To economic limit"
            value={eur.toEconomicLimit != null ? fmt(eur.toEconomicLimit) : '—'}
            sub={
              eur.economicLimitTime != null
                ? `${volumeUnit} · reached at ${fmt(eur.economicLimitTime, 3)} ${tUnit}`
                : 'set an economic limit rate'
            }
          />
          <Stat
            label="To infinity"
            value={eur.toInfinity != null ? fmt(eur.toInfinity) : 'diverges'}
            sub={eur.toInfinity != null ? volumeUnit : 'harmonic / b≥1 — use a limit'}
          />
          <Stat label="To horizon" value={fmt(eur.toHorizon)} sub={volumeUnit} />
        </div>
      </div>

      <div className="card p-4">
        <h3 className="mb-3 text-sm font-medium text-fg">Fit quality</h3>
        <div className="grid grid-cols-2 gap-3">
          <Stat label="R² (log-rate)" value={fmt(fit.diagnostics.r2, 4)} />
          <Stat label="RMSE (log)" value={fmt(fit.diagnostics.rmse, 3)} />
          <Stat
            label="Selected by"
            value={selection.usedCV ? 'Cross-val' : 'AICc'}
            sub={selection.usedCV ? `${selection.cvFolds}-fold CV` : 'short series'}
          />
          <Stat label="Cum. to date" value={fmt(forecast.cumHistorical)} sub={volumeUnit} />
        </div>
      </div>
    </div>
  );
}
