import { fitModel, MODELS, cleanSeries } from '../dist/index.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));

const samples = JSON.parse(readFileSync(join(here,'../../app/public/samples/wells.json'),'utf8'));

function analyze(name){
  const w = samples.find(s => s.name === name);
  const c = cleanSeries(w.points.map(p=>p.t), w.points.map(p=>p.q));
  const n = c.t.length;
  const models = ['exponential','hyperbolic','harmonic'];
  const rmseHoldout=(m,frac)=>{
    const split=Math.floor(n*frac);
    const f=fitModel(m,c.t.slice(0,split),c.y.slice(0,split));
    const tt=c.t.slice(split),yy=c.y.slice(split);
    const pred=MODELS[m].evalLog(f.u,tt);
    let ss=0;for(let i=0;i<tt.length;i++)ss+=(pred[i]-Math.log(yy[i]))**2;
    return Math.sqrt(ss/tt.length);
  };
  const cvRmse=(m,folds=5,minFrac=0.5)=>{
    const errs=[];
    for(let k=0;k<folds;k++){
      const trainEnd=Math.floor(n*(minFrac+(1-minFrac-0.1)*(k/(folds-1))));
      const testEnd=Math.min(n,trainEnd+Math.floor(n*0.1));
      if(testEnd<=trainEnd)continue;
      const f=fitModel(m,c.t.slice(0,trainEnd),c.y.slice(0,trainEnd));
      const tt=c.t.slice(trainEnd,testEnd),yy=c.y.slice(trainEnd,testEnd);
      const pred=MODELS[m].evalLog(f.u,tt);
      let ss=0;for(let i=0;i<tt.length;i++)ss+=(pred[i]-Math.log(yy[i]))**2;
      errs.push(Math.sqrt(ss/tt.length));
    }
    return errs.reduce((a,b)=>a+b,0)/errs.length;
  };
  console.log(`\n=== ${name} (${n} pts) ===`);
  console.log('model        R2      RMSE   AICc      holdout70  CV(5fold)');
  let bestR2='', bestHO='', bestCV='', br2=-9, bho=9, bcv=9;
  for(const m of models){
    const f=fitModel(m,c.t,c.y), d=f.diagnostics;
    const ho=rmseHoldout(m,0.7), cv=cvRmse(m);
    if(d.r2>br2){br2=d.r2;bestR2=m;} if(ho<bho){bho=ho;bestHO=m;} if(cv<bcv){bcv=cv;bestCV=m;}
    console.log(`${m.padEnd(12)} ${d.r2.toFixed(4)} ${d.rmse.toFixed(3)} ${d.aicc.toFixed(1).padStart(8)}  ${ho.toFixed(3).padStart(8)}   ${cv.toFixed(3)}`);
  }
  console.log(`picks -> bestR2:${bestR2}  holdout70:${bestHO}  CV5fold:${bestCV}`);
}
for(const w of ['GULLFAKS','STATFJORD','OSEBERG','DRAUGEN']) analyze(w);
