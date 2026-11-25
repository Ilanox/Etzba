// Things that reach the app from outside it: arrival at work (location) and taps on the widget or a notification.
import * as native from './native-bridge.js';
import { S, jobById } from './state.js';
import { tr } from './translate.js';
import * as dbg from './diagnostics.js';
import { go } from './nav.js';
import { openSheet, closeSheet } from './ui.js';
import { nm, hm, $ } from './util.js';
import { I } from './svg-icons.js';
import { onPunch } from './views/home.js';
import { devUnlock } from './views/dev-tools.js';

let geoSent = '';
export function syncGeo(force = false) {
  if (!native.geo.available()) return;
  const fences = S.jobs.filter(j => j.place && j.place.on !== false).map(j => ({ id: j.id, name: j.name, lat: j.place.lat, lng: j.place.lng, radius: j.place.radius || 300 }));
  const texts = { inTitle: tr('הגעת לעבודה?'), inBody: tr('{job} · להתחיל משמרת עכשיו?'), inAction: tr('להתחיל משמרת'),
    outTitle: tr('יצאת מהעבודה?'), outBody: tr('{job} · המשמרת עדיין רצה. לסיים אותה?'), outAction: tr('לסיים משמרת'), channel: tr('הגעה ויציאה מהעבודה') };
  const key = JSON.stringify([fences, texts, !!S.active, S.active?.jobId]);
  if (key === geoSent && !force) return;
  geoSent = key;
  native.geo.setFences(fences, texts).then(r => dbg.log('info', `geofences: ${fences.length}${r.registered ? '' : ' (not allowed)'}`));
  native.geo.setActive(!!S.active, S.active?.jobId);
}

export function appAction({ action, jobId, sig }) {
  dbg.log('info', 'app action ' + action);
  if (action === 'dev_unlock') return devUnlock(sig);
  if (action === 'toggle') {
    go('home');
    if (S.active) openSheet(`<h2>לסיים את המשמרת?</h2><p class="shsub">${nm(jobById(S.active.jobId).name)} · ${hm((Date.now() - new Date(S.active.start)) / 36e5)}</p>
      <div class="btnrow"><button class="btn primary" id="wa-end">${I.check}סיום משמרת</button><button class="btn soft" id="wa-no">עדיין לא</button></div>`, root => {
      $('#wa-end', root).onclick = () => { closeSheet(); if (S.active) onPunch(); };
      $('#wa-no', root).onclick = closeSheet;
    });
    else onPunch();
    return;
  }
  const job = S.jobs.find(j => j.id === jobId); if (!job) return;
  go('home');
  if (action === 'start' && !S.active) { S.settings.lastJob = job.id; onPunch(); return; }
  if ((action === 'end' || action === 'ask_end') && S.active) { onPunch(); return; }
  if (action === 'ask_start' && !S.active) openSheet(`<h2>הגעת לעבודה?</h2><p class="shsub">${nm(job.name)}</p>
    <div class="btnrow"><button class="btn primary" id="ga-yes">${I.check}להתחיל משמרת</button><button class="btn soft" id="ga-no">לא עכשיו</button></div>`, root => {
    $('#ga-yes', root).onclick = () => { closeSheet(); S.settings.lastJob = job.id; onPunch(); };
    $('#ga-no', root).onclick = closeSheet;
  });
}
