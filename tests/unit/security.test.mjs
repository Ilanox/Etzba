import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { FILES, inlineHashes, policyHashes } from '../../scripts/csp.mjs';

test('every inline script on the website is allowed by its content security policy (run npm run csp after changing one)', () => {
  for (const f of FILES) {
    const html = readFileSync(new URL('../../' + f, import.meta.url), 'utf8');
    assert.ok(/http-equiv="Content-Security-Policy"/.test(html), f + ' has a policy');
    assert.deepEqual(policyHashes(html).sort(), inlineHashes(html).sort(), f);
  }
});

test('no third-party requests: no Google Fonts or other outside hosts in the pages', () => {
  for (const f of [...FILES, 'privacy.html', 'style.css']) {
    const t = readFileSync(new URL('../../' + f, import.meta.url), 'utf8');
    assert.ok(!/fonts\.googleapis|fonts\.gstatic|google-analytics|googletagmanager/.test(t), f);
  }
});
