/** Model-comparison table — all three Arps candidates, best highlighted. */
import type { AutoSelection } from '@workollab/auto-dca-engine';
import { fmt, MODEL_LABEL } from '../lib/format.js';

export default function ModelTable({ selection }: { selection: AutoSelection }) {
  const bestModel = selection.best.model;
  return (
    <div className="card overflow-hidden">
      <div className="border-b border-line px-4 py-2.5 text-sm font-medium text-fg">
        Model comparison
        <span className="ml-2 text-xs font-normal text-muted">
          ranked by {selection.usedCV ? `${selection.cvFolds}-fold cross-validated forecast error` : 'AICc'}
        </span>
      </div>
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wider text-muted">
            <th className="px-4 py-2 font-medium">Model</th>
            <th className="px-3 py-2 font-medium">b</th>
            <th className="px-3 py-2 font-medium">R²</th>
            <th className="px-3 py-2 font-medium">CV RMSE</th>
            <th className="px-3 py-2 font-medium">AICc wt</th>
          </tr>
        </thead>
        <tbody className="font-mono">
          {selection.ranked.map((c) => {
            const best = c.model === bestModel;
            return (
              <tr
                key={c.model}
                className={`border-t border-line/60 ${best ? 'bg-accent/10' : ''}`}
              >
                <td className="px-4 py-2">
                  <span className={best ? 'text-accent' : 'text-fg'}>
                    {MODEL_LABEL[c.model]}
                  </span>
                  {best && <span className="ml-2 text-[10px] text-accent">● best</span>}
                </td>
                <td className="px-3 py-2 text-muted">{fmt(c.params.b, 3)}</td>
                <td className="px-3 py-2 text-muted">{fmt(c.fit.diagnostics.r2, 4)}</td>
                <td className="px-3 py-2 text-muted">
                  {Number.isFinite(c.cvRmse) ? fmt(c.cvRmse, 3) : '—'}
                </td>
                <td className="px-3 py-2 text-muted">{fmt(c.aiccWeight, 3)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
