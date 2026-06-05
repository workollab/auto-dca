/**
 * Precise parity report: TS engine vs. Python reference, per case.
 * Run after `npm run build`. Emits the numbers cited in the build log / article.
 */
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { fitModel, Hyperbolic, Exponential } from '../dist/index.js';

const here = dirname(fileURLToPath(import.meta.url));
const g = (f) => JSON.parse(readFileSync(join(here, '..', 'test', 'golden', f), 'utf8'));
const config = g('config.json');
const GRID = config.grid;
const P = config.p;

const maxRelDev = (a, b) => {
  let m = 0;
  for (let i = 0; i < a.length; i++) m = Math.max(m, Math.abs(a[i] - b[i]) / Math.max(Math.abs(b[i]), 1e-12));
  return m;
};

let worst = 0;
const report = (cases, modelObj, fitKey, header) => {
  console.log(`\n${header}`);
  console.log('  case            curveDev(ppm)   lossΔ(rel)     b(ours/ref)');
  for (const c of cases) {
    const ref = c[fitKey];
    const fit = fitModel(modelObj, c.t, c.y, { p: P });
    const mu = modelObj.eval(fit.u, GRID);
    const dev = maxRelDev(mu, ref.mu_grid);
    worst = Math.max(worst, dev);
    const lossRel = Math.abs(fit.loss - ref.loss) / Math.max(Math.abs(ref.loss), 1e-12);
    const bOurs = fit.params.b?.toFixed(3) ?? '—';
    const bRef = ref.params.b?.toFixed(3) ?? '—';
    console.log(
      `  ${c.name.padEnd(14)}  ${(dev * 1e6).toExponential(2).padStart(11)}   ${lossRel
        .toExponential(2)
        .padStart(10)}     ${bOurs}/${bRef}`,
    );
  }
};

report(g('synthetic.json'), Hyperbolic, 'fit_hyperbolic', 'SYNTHETIC — hyperbolic');
report(g('sodir_wells.json'), Hyperbolic, 'fit_hyperbolic', 'SODIR wells — hyperbolic');
console.log(`\nWORST-CASE curve deviation across all cases: ${(worst * 1e6).toFixed(3)} ppm (${(worst * 100).toExponential(2)}%)`);
