/** Data input: bundled sample wells, drag-drop / file-pick CSV, or pasted CSV. */
import { useEffect, useRef, useState } from 'react';
import { parseCsv } from '@workollab/auto-dca-engine';

export interface Dataset {
  name: string;
  t: number[];
  q: number[];
  labels: string[];
  rateUnit: string;
  tUnit: string;
  volumeUnit: string;
  source?: string;
}

interface SampleFile {
  name: string;
  label: string;
  unit: string;
  source: string;
  t_unit: string;
  points: { t: number; date: string; q: number }[];
}

export default function Uploader({ onLoad }: { onLoad: (d: Dataset) => void }) {
  const [samples, setSamples] = useState<SampleFile[]>([]);
  const [dragging, setDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showPaste, setShowPaste] = useState(false);
  const [pasteText, setPasteText] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch('samples/wells.json')
      .then((r) => (r.ok ? r.json() : []))
      .then(setSamples)
      .catch(() => setSamples([]));
  }, []);

  function loadSample(s: SampleFile) {
    setError(null);
    onLoad({
      name: s.label,
      t: s.points.map((p) => p.t),
      q: s.points.map((p) => p.q),
      labels: s.points.map((p) => p.date),
      rateUnit: s.unit,
      tUnit: s.t_unit.includes('month') ? 'months' : 'unit',
      volumeUnit: s.unit.split('/')[0].trim(),
      source: s.source,
    });
  }

  function ingestCsv(text: string, name: string) {
    setError(null);
    try {
      const parsed = parseCsv(text);
      if (parsed.t.length < 4) throw new Error('Need at least 4 data rows.');
      onLoad({
        name,
        t: parsed.t,
        q: parsed.q,
        labels: parsed.labels,
        rateUnit: parsed.columns.rate,
        tUnit: parsed.tUnit,
        volumeUnit: `${parsed.columns.rate}·${parsed.tUnit}`,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not parse CSV.');
    }
  }

  function onFiles(files: FileList | null) {
    const f = files?.[0];
    if (!f) return;
    f.text().then((t) => ingestCsv(t, f.name.replace(/\.csv$/i, '')));
  }

  return (
    <div className="card p-4">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-medium text-fg">1 · Load production data</h3>
        <span className="rounded-md bg-oil/10 px-2 py-0.5 text-[11px] text-oil">
          ⬤ stays in your browser
        </span>
      </div>

      {samples.length > 0 && (
        <div className="mb-4">
          <div className="stat-label mb-1.5">Sample wells — North Sea (SODIR open data)</div>
          <div className="flex flex-wrap gap-2">
            {samples.map((s) => (
              <button key={s.name} className="btn text-xs" onClick={() => loadSample(s)}>
                {s.name.replace(' field (NCS)', '')}
              </button>
            ))}
          </div>
        </div>
      )}

      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          onFiles(e.dataTransfer.files);
        }}
        onClick={() => fileInput.current?.click()}
        className={`flex cursor-pointer flex-col items-center justify-center rounded-lg border border-dashed px-4 py-6 text-center transition-colors ${
          dragging ? 'border-accent bg-accent/5' : 'border-line hover:border-muted'
        }`}
      >
        <input
          ref={fileInput}
          type="file"
          accept=".csv,text/csv"
          className="hidden"
          onChange={(e) => onFiles(e.target.files)}
        />
        <div className="text-sm text-fg">Drop a CSV, or click to choose</div>
        <div className="mt-1 text-[11px] text-dim">
          columns auto-detected — e.g. <span className="font-mono">date, rate</span>
        </div>
      </div>

      <button
        className="mt-2 text-xs text-muted hover:text-fg"
        onClick={() => setShowPaste((v) => !v)}
      >
        {showPaste ? '− hide paste' : '＋ or paste CSV text'}
      </button>
      {showPaste && (
        <div className="mt-2">
          <textarea
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            rows={5}
            placeholder={'date,rate\n2020-01,1000\n2020-02,940\n...'}
            className="w-full rounded-lg border border-line bg-ink-800 p-2 font-mono text-xs text-fg outline-none focus:border-accent"
          />
          <button className="btn-accent mt-2 text-xs" onClick={() => ingestCsv(pasteText, 'Pasted data')}>
            Analyze pasted data
          </button>
        </div>
      )}

      {error && <div className="mt-2 text-xs text-danger">{error}</div>}
    </div>
  );
}
