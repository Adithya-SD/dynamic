// Compare two A/B snapshots (JSON from tools/ab_snippet.js run through tools/shoot.mjs): per preset mean and max difference, 0-255.
import fs from 'node:fs';
const [a, b] = process.argv.slice(2).map(f => JSON.parse(fs.readFileSync(f, 'utf8')));
let worst = 0;
for (const k of Object.keys(a)) {
  let sum = 0, max = 0;
  for (let i = 0; i < a[k].length; i++) { const d = Math.abs(a[k][i] - b[k][i]); sum += d; if (d > max) max = d; }
  const mean = sum / a[k].length; worst = Math.max(worst, mean);
  console.log(k.padEnd(12), 'mean', mean.toFixed(3).padStart(7), ' max', String(max).padStart(4));
}
console.log(worst < 1.5 ? 'SAME LOOK (mean difference under 1.5/255)' : 'LOOK CHANGED');
process.exit(worst < 1.5 ? 0 : 1);
