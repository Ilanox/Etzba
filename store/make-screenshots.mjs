// Store screenshots: the real app with sample data, framed with a caption. 1080×1920 (Google Play phone size).
//   node store/make-screenshots.mjs        (needs: npm i, npx playwright install chromium; Heebo font installed for the exact look)
import { chromium } from 'playwright';
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync } from 'node:fs';
import { mark } from '../js/svg-icons.js';
import { fileURLToPath } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url)), OUT = ROOT + 'store/screenshots/';
const PORT = 5391, URL_ = `http://localhost:${PORT}/`;
const NOW = new Date('2026-11-20T15:12:00+02:00');   // a Friday afternoon, Shabbat soon

const CAPTIONS = {
  he: [
    ['home', 'שמים אצבע כשנכנסים', 'ורואים כמה הרווחתם, תוך כדי המשמרת'],
    ['sum', 'כמה ייכנס לחשבון', 'ברוטו ונטו, עם מס הכנסה וביטוח לאומי'],
    ['shifts', 'כל המשמרות במקום אחד', 'מסודרות לפי שבועות, עם הסכום של כל אחת'],
    ['detail', 'כל דקה בתעריף הנכון', 'שעות נוספות, שבת, חג ולילה, לפי החוק בישראל'],
    ['rights', 'מה מגיע לך', 'הזכויות של עובדים לפי שעה, בשפה פשוטה'],
    ['job', 'מתאים לכל עבודה', 'שכר, נסיעות, שבוע של 5 או 6 ימים, וכמה עבודות'],
  ],
  en: [
    ['home', 'Tap in, tap out', 'and watch your pay add up during the shift'],
    ['sum', 'What reaches your account', 'gross and net, with income tax and National Insurance'],
    ['shifts', 'All your shifts in one place', 'by week, with what each one paid'],
    ['detail', 'Every minute at the right rate', 'overtime, Shabbat, holidays and nights, by Israeli law'],
    ['rights', 'Know your rights', 'what hourly workers are owed, in plain words'],
    ['job', 'Fits any job', 'pay, travel, 5- or 6-day weeks, and more than one job'],
  ],
};

function sampleState(lang) {
  const iso = (d, h, m) => { const x = new Date(d); x.setHours(h, m, 0, 0); return x.toISOString(); };
  const job = { id: 'cafe', name: lang === 'he' ? 'קפה רחביה' : 'Rehavia Café', color: '#E4572E', rate: 42, travel: 22.6, weekDays: 6, regHours: 8, shortDay: 5, shortHours: 7 };
  const job2 = { id: 'events', name: lang === 'he' ? 'אירועים' : 'Events', color: '#3D7EFF', rate: 48, travel: 0, weekDays: 5 };
  const shifts = []; let n = 0;
  // pattern by weekday: [start h, m, hours] — Sun..Sat
  const plan = { 0: [8, 0, 8.5], 1: [14, 0, 7.5], 3: [8, 0, 9.5], 4: [16, 30, 8], 5: [9, 0, 8.5], 6: [19, 0, 6] };
  for (let d = new Date('2026-10-01T12:00:00+03:00'); d < new Date('2026-11-20T00:00:00+02:00'); d.setDate(d.getDate() + 1)) {
    const p = plan[d.getDay()]; if (!p || (d.getDate() % 7 === 2)) continue;
    const s = new Date(iso(d, p[0], p[1])), e = new Date(+s + p[2] * 36e5 + (d.getDate() % 3) * 9e5);
    shifts.push({ id: 's' + n++, jobId: d.getDay() === 6 ? 'events' : 'cafe', start: s.toISOString(), end: e.toISOString(), breakMin: p[2] > 8 ? 30 : 0 });
  }
  // Knesset election day, 27.10.2026
  shifts.push({ id: 'elect', jobId: 'cafe', start: '2026-10-27T09:00:00+02:00', end: '2026-10-27T17:00:00+02:00', breakMin: 0 });
  return {
    settings: { lang, theme: 'dark', city: 'ירושלים', onboarded: true, lastJob: 'cafe', migSort: 1, migTravel: 1 },
    jobs: [job, job2], shifts, active: { jobId: 'cafe', start: '2026-11-20T08:58:00+02:00' }, ui: { sort: 'new', filter: 'all' },
  };
}

const server = spawn(process.execPath, ['scripts/serve.mjs'], { cwd: ROOT, env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
await new Promise(r => setTimeout(r, 600));
const browser = await chromium.launch(process.env.CHROME ? { executablePath: process.env.CHROME } : {});
const icon = 'data:image/png;base64,' + readFileSync(ROOT + 'resources/icon-only.png').toString('base64');

try {
  for (const lang of ['he', 'en']) {
    mkdirSync(OUT + lang, { recursive: true });
    const ctx = await browser.newContext({ viewport: { width: 390, height: 780 }, deviceScaleFactor: 2, colorScheme: 'dark', reducedMotion: 'reduce', timezoneId: 'Asia/Jerusalem', locale: lang === 'he' ? 'he-IL' : 'en-US', serviceWorkers: 'block' });
    await ctx.route(/^https?:\/\/(?!localhost)/, r => r.abort());
    const page = await ctx.newPage();
    await page.clock.install({ time: NOW });
    await page.goto(URL_);
    await page.evaluate(s => localStorage.setItem('etzba.v1', JSON.stringify(s)), sampleState(lang));
    await page.reload(); await page.waitForTimeout(1200);
    const shots = {};
    mkdirSync(ROOT + `site/img/${lang}`, { recursive: true });
    const snap = async k => {
      await page.waitForTimeout(500); shots[k] = (await page.screenshot()).toString('base64');
      await page.screenshot({ path: ROOT + `site/img/${lang}/${k}.jpg`, type: 'jpeg', quality: 86 });   // the plain screen, for the website
    };
    await snap('home');
    await page.click('[data-v=sum]'); await snap('sum');
    await page.click('[data-v=shifts]'); await snap('shifts');
    // a Friday that runs into Shabbat, scrolled to its pay breakdown
    await page.locator('#v-shifts .srow', { hasText: '13.11' }).first().click(); await page.waitForTimeout(500);
    await page.evaluate(() => document.querySelector('#f-explain').scrollIntoView({ block: 'center' })); await snap('detail');
    await page.keyboard.press('Escape'); await page.evaluate(() => document.querySelector('#scrim, .scrim')?.click()); await page.waitForTimeout(400);
    await page.click('[data-v=rights]'); await snap('rights');
    await page.click('[data-v=set]'); await page.waitForTimeout(300); await page.locator('[data-job]').first().click(); await snap('job');
    await ctx.close();

    // frame each one: caption on top, the screen below with rounded corners
    const frame = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
    for (const [i, [k, title, sub]] of CAPTIONS[lang].entries()) {
      await frame.setContent(`<!doctype html><html dir="${lang === 'he' ? 'rtl' : 'ltr'}"><body style="margin:0;width:1080px;height:1920px;overflow:hidden;font-family:Heebo,sans-serif;
        background:radial-gradient(120% 70% at 50% 0%,#3a2a22 0%,#1B1916 60%);color:#EFEAE0;text-align:center">
        <div style="padding:92px 60px 0"><div style="font-size:${title.length > 24 ? 64 : 76}px;font-weight:800;letter-spacing:-.5px;line-height:1.1">${title}</div>
        <div style="font-size:40px;color:#C9C2B5;margin-top:18px;line-height:1.3">${sub}</div></div>
        <div style="position:absolute;left:50%;top:400px;transform:translateX(-50%);width:780px;height:1560px;border-radius:56px;overflow:hidden;
          box-shadow:0 0 0 10px #2c2925,0 40px 90px rgba(0,0,0,.6)"><img src="data:image/png;base64,${shots[k]}" style="width:780px;height:1560px;display:block"></div>
      </body></html>`);
      await frame.waitForTimeout(150);
      await frame.screenshot({ path: `${OUT}${lang}/${i + 1}-${k}.png` });
    }
    // feature graphic 1024×500: the name and the promise lead; the fingerprint is a large, quiet shape behind
    await frame.setViewportSize({ width: 1024, height: 500 });
    const he = lang === 'he', fp = mark({ ink: '#EFEAE0', accent: '#FF6A3D', sw: 4.2 });
    await frame.setContent(`<!doctype html><html dir="${he ? 'rtl' : 'ltr'}"><body style="margin:0;width:1024px;height:500px;overflow:hidden;font-family:Heebo,sans-serif;position:relative;
      background:radial-gradient(70% 110% at ${he ? '18%' : '82%'} 55%,#3b261c 0%,#1B1916 62%);color:#EFEAE0">
      <div style="position:absolute;${he ? 'left' : 'right'}:40px;top:50%;transform:translateY(-50%) rotate(-6deg);width:400px;height:400px;opacity:.95">${fp.replace('<svg ', '<svg width="400" height="400" ')}</div>
      <div style="position:absolute;${he ? 'right' : 'left'}:84px;top:0;bottom:0;display:flex;flex-direction:column;justify-content:center;max-width:520px">
        <div style="font-size:${he ? 150 : 128}px;font-weight:900;line-height:.95;letter-spacing:${he ? 0 : -2}px">${he ? 'אצבע' : 'Etzba'}</div>
        <div style="font-size:38px;font-weight:600;margin-top:22px;line-height:1.25">${he ? 'משמרות ושכר לפי החוק בישראל' : 'Shifts and pay, by Israeli law'}</div>
        <div style="font-size:26px;color:#B9B0A2;margin-top:10px;line-height:1.35">${he ? 'שעות נוספות, שבת וחג, ברוטו ונטו' : 'Overtime, Shabbat and holidays, gross and net'}</div>
      </div></body></html>`);
    await frame.waitForTimeout(150);
    await frame.screenshot({ path: `${OUT}${lang}/feature-graphic.png` });
    await frame.close();
  }
  // app icon 512×512
  const p = await browser.newPage({ viewport: { width: 512, height: 512 } });
  await p.setContent(`<body style="margin:0"><img src="${icon}" style="width:512px;height:512px;display:block">`);
  await p.screenshot({ path: OUT + 'icon-512.png', omitBackground: false });
  console.log('✓ store/screenshots/');
} finally { await browser.close(); server.kill(); }
