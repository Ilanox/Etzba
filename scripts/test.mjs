// Runs the tests in Israel's time zone (pay depends on local time).
//   npm test            unit tests (no packages needed)
//   npm run test:e2e    in a browser (needs: npm i, then npx playwright install chromium)
import { spawnSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
const dir = process.argv[2] === 'e2e' ? 'tests/e2e' : 'tests/unit';
const files = readdirSync(dir).filter(f => f.endsWith('.test.mjs')).map(f => `${dir}/${f}`);
const r = spawnSync(process.execPath, ['--test', '--test-concurrency=1', ...files], { stdio: 'inherit', env: { ...process.env, TZ: 'Asia/Jerusalem' } });
process.exit(r.status ?? 1);
