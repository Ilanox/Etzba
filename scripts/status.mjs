// Writes data/status.json for the developer dashboard: which commit is live, the test results it passed,
// and the versions of the data the phones download. Run by the website deploy; reads the counts from the environment.
//   node scripts/status.mjs <out file>
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { root, readJSON } from './lib.mjs';

const num = k => { const v = Number(process.env[k]); return Number.isFinite(v) ? v : null; };
const sha = process.env.COMMIT || process.env.GITHUB_SHA || '';   // COMMIT: a rollback publishes an older commit
const status = {
  commit: sha.slice(0, 7) || 'local',
  message: (process.env.COMMIT_MESSAGE || '').split('\n')[0].slice(0, 140),
  deployed: new Date().toISOString(),
  run: process.env.GITHUB_RUN_ID ? `https://github.com/${process.env.GITHUB_REPOSITORY}/actions/runs/${process.env.GITHUB_RUN_ID}` : '',
  tests: {
    unit: { pass: num('UNIT_PASS'), fail: num('UNIT_FAIL') },
    browser: { pass: num('E2E_PASS'), fail: num('E2E_FAIL') },
    translations: { texts: num('TR_TEXTS'), missing: num('TR_MISSING') },
  },
  data: {
    rules: readJSON('data/rules.json').version,
    packs: Object.fromEntries(readdirSync(`${root}/data/lang`).filter(f => f.endsWith('.json'))
      .map(f => [f.slice(0, -5), JSON.parse(readFileSync(`${root}/data/lang/${f}`, 'utf8')).version])),
    early: readJSON('data/early.json'),
  },
};
const out = process.argv[2] || `${root}/data/status.json`;
writeFileSync(out, JSON.stringify(status, null, 2) + '\n');
console.log(`status: ${status.commit}, unit ${status.tests.unit.pass}, browser ${status.tests.browser.pass}`);
