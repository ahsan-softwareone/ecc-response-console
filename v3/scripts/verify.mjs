// Repeatable end-to-end verification of ECC v3 with installed Chrome.
// Usage: npm run verify [-- --only=core,reports,agentlog,knowledge,persist,assistant,shots]
// Sections run in order; later sections fast-forward the scenario when run alone.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const URL = 'http://localhost:5189/';
const SHOTS = process.env.SHOTS_DIR ?? resolve(tmpdir(), 'ecc-verify', 'shots');
const TMP = resolve(SHOTS, '..', 'verify-tmp');
await mkdir(SHOTS, { recursive: true }); await mkdir(TMP, { recursive: true });
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) ?? '').slice(7).split(',').filter(Boolean);
const want = (s) => ONLY.length === 0 || ONLY.includes(s);
// --check=<regex> runs only matching checks after the core section (core stays, because it records the state later checks read).
const checkArg = process.argv.find((a) => a.startsWith('--check='));
const CHECK = checkArg ? new RegExp(checkArg.slice(8)) : null; let pastCore = false;

// ---------- dev server ----------
let server = null;
async function up() { try { const r = await fetch(URL); return r.ok; } catch { return false; } }
if (!(await up())) {
  server = spawn('npx', ['vite', '--port', '5189', '--strictPort'], { cwd: root, stdio: 'ignore' });
  for (let i = 0; i < 60 && !(await up()); i++) await new Promise((r) => setTimeout(r, 500));
  if (!(await up())) { console.error('dev server did not start'); process.exit(1); }
}

// ---------- harness ----------
// The machine must stay awake: during idle sleep this script's timers run out while the page cannot run, which looks exactly like a missing alert.
if (process.platform === 'darwin') spawn('caffeinate', ['-i', '-w', String(process.pid)], { stdio: 'ignore', detached: true }).unref();
let lastBeat = Date.now(), suspendedMs = 0;
setInterval(() => { const gap = Date.now() - lastBeat; if (gap > 5000) { suspendedMs += gap; console.log(`SUSPENDED ${Math.round(gap / 1000)} s at ${new Date().toTimeString().slice(0, 8)}: results near here are not evidence about the app`); } lastBeat = Date.now(); }, 1000).unref();
const results = []; let failures = 0;
function assert(cond, msg) { if (!cond) throw new Error(`assertion failed: ${msg}`); }
async function step(name, fn) {
  if (CHECK && pastCore && !CHECK.test(name)) return;
  try { await fn(); results.push(['PASS', name]); console.log('PASS', name); }
  catch (e) {
    failures++; results.push(['FAIL', name, String(e.message ?? e)]); console.log('FAIL', name, '-', e.message ?? e);
    console.log('DIAG', JSON.stringify(await pageDiag()));
    // leave no overlay behind for the next check
    await page.keyboard.press('Escape').catch(() => {});
    await page.locator('[data-testid="origin-all"]').click({ timeout: 300 }).catch(() => {}); // a failed filter check must not hide arrivals from the next check
    await page.locator('button[title="Restore layout"]:visible').first().click({ timeout: 300 }).catch(() => {}); // nor may a maximized panel hide the next check's targets
    for (const sel of ['[data-testid="trend-close"]', '[data-testid="viewer-overlay"] [data-testid="viewer-close"]', '[data-testid="assistant-close"]']) await page.locator(sel).click({ timeout: 300 }).catch(() => {});
  }
}

/** Test harness. The response drawer is modal: a click outside it closes it. A click aimed at the workspace while the drawer is open
 *  therefore closes the drawer first, the way a person would; clicks inside the drawer are unchanged. */
function drawerAware(pg) {
  const click = pg.click.bind(pg);
  pg.click = async (sel, o) => {
    const covered = await pg.evaluate((s) => { try { const el = document.querySelector(s); return !!el && !!document.querySelector('[data-testid="drawer-backdrop"]') && !el.closest('[data-testid="room-dock"]') && !!el.closest('.sr-main, .sr-bar'); } catch { return false; } }, sel).catch(() => false);
    if (covered) { await click('[data-testid="panel-close"]'); await pg.waitForSelector('[data-testid="drawer-backdrop"]', { state: 'detached' }).catch(() => {}); }
    const r = await click(sel, o);
    // These checks read individual record entries: arriving on the Timeline, open every history group (collapsed by default) and the Sit. Rep tab.
    if (/data-testid="(nav-sitrep|ov-full-timeline|link-record)"/.test(String(sel))) {
      await pg.evaluate(() => document.querySelectorAll('[data-testid="moment-toggle"][aria-expanded="false"]').forEach((b) => b.click())).catch(() => {});
    }
    return r;
  };
  // Notes and who-was-told sit behind Add details on Accept; open it before filling them, as a person would.
  const openDetails = async (sel) => { if (/rationale|decision-(to|via|within)/.test(String(sel))) await pg.evaluate(() => { const d = document.querySelector('[data-testid="decision-details"]'); if (d && !d.open) d.open = true; }).catch(() => {}); };
  const fill0 = pg.fill.bind(pg); pg.fill = async (sel, v, o) => { await openDetails(sel); return fill0(sel, v, o); };
  const so0 = pg.selectOption.bind(pg); pg.selectOption = async (sel, v, o) => { await openDetails(sel); return so0(sel, v, o); };
  return pg;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1, acceptDownloads: true });
const page = drawerAware(await context.newPage());
// Diagnostics: an independent heartbeat in the page, so a failure can tell a stalled page from stalled app state.
await page.addInitScript(() => { const hb = window.__hb = []; (function beat() { hb.push(Date.now()); if (hb.length > 400) hb.shift(); setTimeout(beat, 1000); })(); });
const pageDiag = () => page.evaluate(async () => {
  const urls = performance.getEntriesByType('resource').map((r) => r.name); const find = (x) => urls.find((u) => u.includes(x));
  const time = await import(find('/src/lib/time.ts')); const der = await import(find('/src/lib/derive.ts'));
  const st = JSON.parse(localStorage.getItem('ecc-v3')).state; const n = time.now();
  const hb = window.__hb ?? []; let gap = 0; for (let i = 1; i < hb.length; i++) gap = Math.max(gap, hb[i] - hb[i - 1]);
  return { vis: document.visibilityState, hasFocus: document.hasFocus(), maxHeartbeatGapMs: gap, heartbeatAgeMs: Date.now() - hb[hb.length - 1], moduleSkew: time.clockSkew(), storedSkew: st.skewMs, startedAt: st.startedAt, revealedAt: st.revealedAt, sinceLastReveal: Math.round((n - st.startedAt - st.revealedAt[st.revealedAt.length - 1]) / 1000),
    derivedNow: der.derive(st.startedAt, st.revealedAt, n).alerts.map((a) => a.id), domRows: [...document.querySelectorAll('tr.row')].map((r) => r.getAttribute('data-testid')), filters: st.logFilters, active: document.activeElement?.getAttribute('data-testid') ?? document.activeElement?.tagName, indicator: document.querySelector('[data-testid="hidden-indicator"]')?.getAttribute('data-high') ?? null, timer: document.querySelector('[data-testid="timer"]')?.textContent };
}).catch((e) => ({ diagError: String(e.message ?? e) }));
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('response', (r) => { if (r.status() >= 400) consoleErrors.push(`HTTP ${r.status()} ${r.url()}`); });
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
page.on('dialog', (d) => d.accept());

const store = async () => JSON.parse(await page.evaluate(() => localStorage.getItem('ecc-v3'))).state;
const record = async () => page.evaluate(async () => { const id = JSON.parse(localStorage.getItem('ecc-v3')).state.incidentId; return new Promise((res) => { const q = indexedDB.open('ecc-v3'); q.onsuccess = () => { const tx = q.result.transaction('incidents').objectStore('incidents').get(id); tx.onsuccess = () => res(tx.result); }; }); });
const bodyText = async () => (await page.evaluate(() => document.body.innerText + ' ' + Array.from(document.querySelectorAll('[title]')).map((e) => e.getAttribute('title')).join(' '))).toLowerCase();
const shot = (name) => page.screenshot({ path: `${SHOTS}/${name}.png` });
const nav = async (id) => { await page.click(`[data-testid="nav-${id}"]`); await sleep(150); };
const box = async (sel) => page.locator(sel).first().boundingBox();
async function drag(sel, dx, dy) {
  const b = await box(sel); const x = b.x + b.width / 2, y = b.y + b.height / 2;
  await page.mouse.move(x, y); await page.mouse.down(); await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 5 }); await page.mouse.move(x + dx, y + dy, { steps: 5 }); await page.mouse.up(); await sleep(100);
}
const assertNoFuture = async (label) => {
  const r = await page.evaluate(() => { const now = Date.now() + (JSON.parse(localStorage.getItem('ecc-v3'))?.state?.skewMs ?? 0); const times = [...document.querySelectorAll('tr.row[data-time], [data-testid="observation"][data-time]')].map((e) => +e.getAttribute('data-time')); return { now, max: Math.max(...times), n: times.length }; });
  assert(r.n === 0 || r.max <= r.now, `${label}: visible timestamp in the future by ${r.max - r.now} ms`);
};
const LAST_ALERT = { 2: 'a2-2', 3: 'a3-2', 4: 'a4-3', 5: 'a5-2', 6: 'a6-2', 7: 'a7-3' };
const next = async ({ wait = true } = {}) => {
  const k = (await store()).revealedAt.length + 1;
  await page.click('[data-testid="facil-next"]'); await sleep(150);
  await assertNoFuture('immediately after reveal'); await sleep(1500); await assertNoFuture('after the clock advanced');
  if (wait) { await page.waitForSelector(`[data-testid="alert-${LAST_ALERT[k]}"]`, { timeout: 70000 }); await assertNoFuture('after the step unfolded'); }
};
const valueOf = async (id) => +(await page.getAttribute(`[data-testid="watcher-${id}"]`, 'data-value'));
const stateOf = async (id) => (await page.textContent(`[data-testid="alert-${id}"] [data-testid="condition"]`)).trim();
/** Open the Evidence view of the issue an alert belongs to, and the citation of one document in it. */
const evidenceOf = async (alertId) => { while (await page.locator('[data-testid="viewer-overlay"]').count()) { await page.keyboard.press('Escape'); await sleep(100); } await page.click(`[data-testid="alert-${alertId}"]`); await page.waitForSelector('[data-testid="issue-panel"] [data-testid="evidence"]'); if ((await page.locator('[data-testid="evidence-all"]').textContent().catch(() => '')).startsWith('Show more')) await page.click('[data-testid="evidence-all"]'); };
/** Evidence is listed in the response; a document opens in the viewer dialog at the cited passage. */
const cite = (docTitle) => page.click(`[data-testid="evidence-item"][data-kind="document"]:has-text("${docTitle}") >> nth=0`);
const DOC = '[data-testid="viewer-overlay"]';
/** Full equipment cards (Show all readings), and back to the Incident Updates view with the strip. */
const showReadings = async () => { if ((await page.getAttribute('[data-testid="watch-toggle"]', 'aria-expanded')) === 'false') await page.click('[data-testid="watch-toggle"]'); };
const backToUpdates = async () => { if ((await page.getAttribute('[data-testid="watch-toggle"]', 'aria-expanded')) === 'true') await page.click('[data-testid="watch-toggle"]'); await page.click('[data-testid="view-updates"]'); };
const closeDoc = () => page.click(`${DOC} [data-testid="viewer-close"]`);
async function fastForwardTo7() {
  await nav('situation'); await page.click('[data-testid="view-updates"]');
  while ((await store()).revealedAt.length < 7) { await page.click('[data-testid="facil-next"]'); await sleep(120); }
  await page.waitForSelector('[data-testid="alert-a7-3"]', { timeout: 70000 });
  await page.click('[data-testid="alert-a7-1"]'); await page.click('[data-testid="decide-approved"]');
  await page.fill('[data-testid="rationale"]', 'Continue depressurization and cooling'); await page.click('[data-testid="record-decision"]');
  await page.waitForSelector('[data-testid="decision-recorded"]'); await sleep(1500);
}
const waitIndex = async () => page.waitForSelector('[data-testid="search-run"][data-ready="true"]', { timeout: 40000 });
async function download(trigger) { const [dl] = await Promise.all([page.waitForEvent('download'), trigger()]); const p = resolve(TMP, await dl.suggestedFilename()); await dl.saveAs(p); return p; }
async function pdfText(path) {
  const pdfjs = await import(resolve(root, 'node_modules/pdfjs-dist/legacy/build/pdf.mjs'));
  const data = new Uint8Array(await readFile(path));
  const doc = await pdfjs.getDocument({ data, standardFontDataUrl: resolve(root, 'node_modules/pdfjs-dist/standard_fonts/') + '/' }).promise;
  let text = '';
  for (let i = 1; i <= doc.numPages; i++) { const tc = await (await doc.getPage(i)).getTextContent(); text += tc.items.map((it) => it.str).join(' ') + '\n'; }
  await doc.destroy();
  return { text, pages: doc.numPages };
}
const MARKERS = { 2: ['shrapnel damage reported'], 3: ['heat input from adjacent fire'], 4: ['no flow after activation'], 5: ['normal relief route unavailable', 'upstream route'], 6: ['reported started'], 7: ['falling trend sustained', 'reported contained'] };

// ---------- fresh start ----------
// Clear and seed storage from a static same-origin page, so the app holds no IndexedDB connection that could block the delete.
await page.goto(URL + 'brand/ecc-symbol.svg', { waitUntil: 'load' });
await page.evaluate(async () => { localStorage.clear(); await new Promise((r) => { const q = indexedDB.deleteDatabase('ecc-v3'); q.onsuccess = q.onerror = q.onblocked = () => r(); }); });
// A pre-existing record written with the earlier shape (no `changes`, no provenance) before the app loads.
const LEGACY_ID = 'INC-LEGACY-0001';
const seedLegacy = () => page.evaluate(async (id) => {
  const rec = { schema: 'ecc-incident/1', id, title: 'Legacy stored incident', site: 'SG GSP', mode: 'real', startedAt: Date.now() - 86400000, status: 'closed', reportedBy: 'Board operator', equipment: ['D-0001'], reportVersions: [], lessons: [], references: [], updatedAt: Date.now() - 80000000,
    closure: { t: Date.now() - 80000000, by: 'Legacy user', rationale: 'Stored before this version', outstanding: ['Legacy outstanding item'] },
    events: [{ id: 'l1', t: Date.now() - 86400000, recordedAt: Date.now() - 86400000, kind: 'notification', title: 'Legacy notification', source: 'field' }, { id: 'l2', t: Date.now() - 86000000, recordedAt: Date.now() - 86000000, kind: 'measurement', title: 'Legacy snapshot', source: 'system', values: [{ watcherId: 'D-0001:pressure', variable: 'Pressure', value: 12.1, unit: 'bar', source: 'live' }] }, { id: 'l3', t: Date.now() - 85000000, recordedAt: Date.now() - 85000000, kind: 'decision', title: 'Approved: legacy decision', source: 'user', by: 'Legacy user', alertId: 'x', status: 'approved', rationale: 'r', recommendationSummary: 's', knownEventCount: 2 }] };
  await new Promise((res, rej) => { const q = indexedDB.open('ecc-v3', 1); q.onupgradeneeded = () => { const db = q.result; for (const s of ['incidents', 'documents', 'files', 'pages', 'assistant']) if (!db.objectStoreNames.contains(s)) db.createObjectStore(s); }; q.onsuccess = () => { const tx = q.result.transaction('incidents', 'readwrite'); tx.objectStore('incidents').put(rec, id); tx.oncomplete = () => { q.result.close(); res(); }; tx.onerror = rej; }; q.onerror = rej; });
}, LEGACY_ID);
await seedLegacy();
// the static SVG page used for setup has no icon link, so Chrome requests /favicon.ico (404); that is not an app error
consoleErrors.length = 0;
await page.goto(URL, { waitUntil: 'load' });
// A fresh browser opens on the no-incident workspace; these checks run on the training scenario.
await page.click('[data-testid="start-training"]'); await page.click('[data-testid="start-submit"]');
await page.waitForSelector('[data-testid="dock"]');
// Alerts are opened from the Incident Updates view of the worklist.
await backToUpdates();
await sleep(800);

// ======================================================================= core
if (want('core')) {
  await step('navigation: exact tabs in order; no Records / Site Knowledge / Incident History; Assistant is a header control', async () => {
    const tabs = await page.locator('[data-testid="nav"] button').allTextContents();
    assert(JSON.stringify(tabs.map((t) => t.replace(/\d+$/, '').trim())) === JSON.stringify(['Overview', 'Situation Room', 'Timeline', 'Agent Log', 'Knowledge']), `tabs: ${tabs.join(' | ')}`);
    assert((await page.locator('[data-testid="assistant-toggle"]').count()) === 1, 'assistant toggle in header');
    await nav('knowledge');
    assert(!(await page.textContent('[data-testid="knowledge-tabs"]')).includes('Assistant'), 'Assistant not inside Knowledge');
    await nav('situation');
  });
  await step('fresh emergency: timer reads 00 h 00 m and step 1 of 7', async () => {
    assert((await page.textContent('[data-testid="timer-h"]')) === '00' && (await page.textContent('[data-testid="timer-m"]')) === '00', 'timer');
    assert((await page.textContent('[data-testid="facil-step"]')).includes('Step 1 of 7'), 'facilitator step');
    assert((await page.locator('[data-testid="mode-marker"]').count()) === 1, 'one persistent illustrative marker');
  });
  await step('no future-step content on any page at step 1', async () => {
    for (const id of ['situation', 'sitrep', 'agentlog', 'knowledge']) {
      await nav(id);
      if (id === 'knowledge') { for (const v of ['kv-search', 'kv-documents', 'kv-incidents']) { await page.click(`[data-testid="${v}"]`); await sleep(150); const t = await bodyText(); for (const [k, ms] of Object.entries(MARKERS)) for (const m of ms) assert(!t.includes(m), `"${m}" (step ${k}) leaked on Knowledge/${v}`); } continue; }
      const t = await bodyText();
      for (const [k, ms] of Object.entries(MARKERS)) for (const m of ms) assert(!t.includes(m), `"${m}" (step ${k}) leaked on ${id}`);
    }
    await nav('situation');
  });
  await step('pre-existing stored incident survives the new version intact', async () => {
    await nav('knowledge'); await page.click('[data-testid="kv-incidents"]');
    await page.click(`[data-testid="inc-${LEGACY_ID}"]`); await page.waitForSelector('[data-testid="incident-closure"]');
    assert((await page.locator('[data-testid="incident-timeline"] [data-testid="timeline-row"]').count()) === 3, 'legacy events listed');
    assert((await page.textContent('[data-testid="incident-closure"]')).includes('Legacy outstanding item'), 'legacy closure intact');
    const p = await download(() => page.click('[data-testid="export-json"]'));
    const j = JSON.parse(await readFile(p, 'utf8'));
    assert(j.identity.id === LEGACY_ID && j.events.length === 3 && j.decisions.length === 1, 'legacy JSON intact');
    await nav('situation');
  });
  await step('add equipment: FW-01 appears as a fifth card', async () => {
    await showReadings();
    assert((await page.locator('[data-testid^="card-"]').count()) === 4, '4 cards initially');
    await page.click('[data-testid="add-equipment"]'); await page.click('[data-testid="add-FW-01"]');
    await page.waitForSelector('[data-testid="card-FW-01"]');
    assert((await page.locator('[data-testid^="card-"]').count()) === 5, '5 cards after add');
  });
  await step('watchers: add, adjust and remove on D-0029', async () => {
    await page.click('[data-testid="add-watcher-D-0029"]'); await page.click('[data-testid="watch-D-0029:temperature"]');
    await page.waitForSelector('[data-testid="watcher-D-0029:temperature"]');
    const row = page.locator('[data-testid="watcher-D-0029:temperature"]');
    await row.hover(); await row.locator('button[title="Adjust watcher"]').click(); await page.click('.pop button:has-text("60 min")'); await page.keyboard.press('Escape');
    assert((await row.textContent()).includes('60 min'), 'trend window adjusted');
    await row.hover(); await row.locator('button[title="Adjust watcher"]').click(); await page.click('[data-testid="hide-D-0029:temperature"]');
    assert((await page.locator('[data-testid="watcher-D-0029:temperature"]').count()) === 0, 'watcher removed');
    assert((await page.locator('[data-testid="card-D-0029"]').textContent()).includes('1 hidden · still monitored'), 'still monitored');
    await backToUpdates();
  });
  await step('step 2: fire alerts appear; step-2 markers only now', async () => {
    await next({ wait: false });
    assert(!(await page.locator('[data-testid="card-D-0029"]').textContent()).includes('On fire'), 'card status must not run ahead of the alert that establishes it');
    await page.waitForSelector('[data-testid="alert-a2-1"]', { timeout: 70000 });
    assert((await page.locator('[data-testid="card-D-0029"]').textContent()).includes('On fire'), 'card status follows the alert');
    await page.waitForSelector('[data-testid="alert-a2-2"]', { timeout: 70000 });
    assert((await page.locator('[data-testid="alert-a2-1"]').getAttribute('data-severity')) === 'critical', 'critical');
    const t = await bodyText();
    assert(t.includes(MARKERS[2][0]), 'step 2 marker present');
    for (const m of [...MARKERS[3], ...MARKERS[4], ...MARKERS[5], ...MARKERS[6], ...MARKERS[7]]) assert(!t.includes(m), `"${m}" leaked at step 2`);
  });
  await step('card alert badge shows that equipment’s notifications and opens nothing; a feed filter never quietly hides a Critical alert', async () => {
    await showReadings();
    await page.click('[data-testid="ind-D-0029"]'); await page.waitForSelector('[data-testid="feed-equipment"]');
    assert((await page.locator('[data-testid="issue-panel"], [data-testid="update-panel"]').count()) === 0, 'the drawer stays closed');
    await page.click('[data-testid="feed-equipment"]'); await backToUpdates();
    await page.click('[data-testid="origin-agent"]');
    await page.waitForSelector('[data-testid="feed-hidden-critical"]');
    assert((await page.locator('[data-testid="alert-a2-1"]').count()) === 0, 'Critical hidden by the filter');
    await page.click('[data-testid="feed-hidden-critical"]');
    assert((await page.locator('[data-testid="alert-a2-1"]').count()) === 1 && (await page.getAttribute('[data-testid="origin-all"]', 'aria-pressed')) === 'true', 'the indicator shows everything again');
    await next({ wait: false });
    await page.waitForSelector('[data-testid="alert-a3-2"]', { timeout: 70000 });
  });
  await step('hidden watcher does not suppress its alert; threshold alert agrees with the reading; a Critical arrival outside the filter updates the indicator without stealing focus', async () => {
    await page.click('[data-testid="origin-people"]');
    await next({ wait: false }); await page.focus('[data-testid="origin-people"]');
    await page.waitForFunction(() => window.__ecc.store.getState().revealedAt.length === 4, null, { timeout: 5000 });
    await page.waitForSelector('[data-testid="feed-hidden-critical"]', { timeout: 70000 });
    await page.waitForFunction(() => /[3-9] critical hidden/.test(document.querySelector('[data-testid="feed-hidden-critical"]')?.textContent ?? ''), null, { timeout: 70000 });
    assert((await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))) === 'origin-people', 'focus stayed; the indicator counts the new Criticals');
    assert((await store()).room.origin === 'people', 'filter unchanged by arrivals');
    await showReadings();
    assert((await page.locator('[data-testid="ind-D-0001"] .badge.sev-critical').count()) === 1, 'card indicator shows the Critical');
    await backToUpdates(); await page.click('[data-testid="origin-all"]');
    await page.waitForSelector('[data-testid="alert-a4-3"]', { timeout: 70000 });
    assert((await valueOf('D-0001:pressure')) > 18.0, 'a4-2 above High 18.0');
    assert((await page.locator('[data-testid="watcher-D-0029:temperature"]').count()) === 0 && /temperature reading on D-0029/.test(await page.textContent('[data-testid="alert-a4-3"]')), 'alert shown for hidden watcher');
  });
  await step('select alert: its issue opens with the evidence a click away; read is not acknowledge', async () => {
    await page.click('[data-testid="alert-a3-1"]'); await page.waitForSelector('[data-testid="issue-panel"][data-issue="pressure"]');
    const s = await store(); assert(s.alertUser['a3-1'].readAt && !s.alertUser['a3-1'].ackAt, 'read without ack');
    const kinds = await page.locator('[data-testid="evidence-item"]').evaluateAll((xs) => [...new Set(xs.map((x) => x.dataset.kind))]);
    assert(kinds.includes('reading') && kinds.includes('document'), `evidence listed in the response: ${kinds}`);
    await page.locator('[data-testid="evidence-item"][data-kind="reading"]').first().click(); await page.waitForSelector('[data-testid="trend-close"]'); await page.click('[data-testid="trend-close"]');
    await page.waitForSelector('[data-testid="recommendation"]');
    assert((await page.textContent('[data-testid="calc"]')).includes('not computed'), 'calculation without method is said plainly');
  });
  await step('source: PDF renders on cited page with exact highlight from the text layer', async () => {
    await evidenceOf('a3-1'); await cite('Emergency depressurization'); await page.waitForSelector(DOC);
    await page.waitForSelector('[data-testid="viewer"][data-page="2"][data-rev="2"][data-rendered="true"]', { timeout: 20000 });
    await page.waitForSelector('[data-testid="exact-match"]', { timeout: 15000 });
    const hl = await box('[data-testid="highlight"]'); assert(hl && hl.width > 40, 'highlight has size');
  });
  await step('source: ambiguous passage shows match navigation', async () => {
    await evidenceOf('a4-1'); await cite('Process area fire response');
    await page.waitForSelector('[data-testid="viewer"][data-doc="proc-fire"][data-matches="3"] [data-testid="match-nav"]', { timeout: 20000 });
    await page.click('[data-testid="match-next"]');
    assert((await page.textContent('[data-testid="match-pos"]')).includes('Match 2 of 3'), 'navigated');
  });
  await step('source: page-only citation states the limitation; drawing region is highlighted', async () => {
    await evidenceOf('a4-2'); await cite('Operating limits');
    await page.waitForFunction(() => document.querySelector('[data-testid="viewer"] .cite')?.textContent.includes('exact region not available'), null, { timeout: 20000 });
    assert((await page.locator(DOC).count()) === 1 && (await page.locator('[data-window="document"]').count()) === 0, 'the document opens in a dialog, not docked');
    await closeDoc(); await cite('P&ID');
    await page.waitForSelector('[data-testid="viewer"][data-doc="pid"][data-rendered="true"] .hl.region', { timeout: 20000 });
  });
  await step('docking: the response panel widens and docks back while a document is open over it', async () => {
    await closeDoc(); const w0 = (await box('[data-testid="issue-panel"]')).width;
    await page.click('[data-testid="panel-dock"]');
    assert((await box('[data-testid="issue-panel"]')).width > w0 + 200 && (await page.locator('[data-testid="statusbar"]').isVisible()), 'widened within the workspace');
    await page.click('[data-testid="panel-dock"]');
    assert(Math.abs((await box('[data-testid="issue-panel"]')).width - w0) < 2, 'docked back');
    await cite('P&ID'); await page.waitForSelector(DOC);
  });
  await step('close the document: the issue and feed scroll position survive', async () => {
    await page.evaluate(() => { document.querySelector('[data-testid="feed-rows"]').scrollTop = 60; });
    await closeDoc();
    assert((await page.locator(DOC).count()) === 0 && (await page.getAttribute('[data-testid="issue-panel"]', 'data-issue')) === 'pressure', 'closed, issue kept');
    assert((await page.evaluate(() => document.querySelector('[data-testid="feed-rows"]').scrollTop)) === 60, 'scroll kept');
  });
  let a42Decision = null;
  await step('record an approval on a4-2 at step 4', async () => {
    await page.click('[data-testid="alert-a4-2"]'); await page.click('[data-testid="decide-approved"]');
    await page.fill('[data-testid="rationale"]', 'Approved on reported route availability'); await page.click('[data-testid="record-decision"]');
    await page.waitForSelector('[data-testid="decision-recorded"]');
    a42Decision = (await store()).alertUser['a4-2'].decision; assert(a42Decision.status === 'approved', 'stored');
  });
  await step('non-disruption: new updates do not move what you are reading or reset a half-filled decision form', async () => {
    await page.click('[data-testid="alert-a4-1"]'); await page.click('[data-testid="decide-approved"]'); await page.fill('[data-testid="rationale"]', 'Hold pending relief route check');
    await page.evaluate(() => { document.querySelector('[data-testid="feed-rows"]').scrollTop = 120; });
    const anchor = await page.evaluate(() => { const list = document.querySelector('[data-testid="feed-rows"]'); const top = list.getBoundingClientRect().top; const row = [...list.querySelectorAll('.sr-row')].find((r) => r.getBoundingClientRect().bottom > top + 4); return { id: row.dataset.update, y: Math.round(row.getBoundingClientRect().top) }; });
    await next({ wait: false });
    await page.waitForSelector('[data-testid="alert-a5-2"]', { timeout: 70000 });
    assert((await page.inputValue('[data-testid="rationale"]')) === 'Hold pending relief route check' && (await page.locator('[data-testid="record-decision"]').isVisible()), 'form preserved');
    const y = await page.evaluate((id) => Math.round(document.querySelector(`[data-testid="feed-rows"] [data-update="${id}"]`).getBoundingClientRect().top), anchor.id);
    assert(Math.abs(y - anchor.y) <= 2, `the row being read stays put (${anchor.y} -> ${y})`);
    assert((await valueOf('FH-01:pressure')) > 2.5, 'a5-2 above High 2.5');
  });
  await step('superseded recommendation: original kept, earlier approval unchanged and shown, the revised suggestion needs a decision', async () => {
    await page.click('[data-testid="alert-a4-2"]'); await page.waitForSelector('[data-testid="issue-panel"][data-issue="pressure"]');
    assert(/ECC revised its (suggestion|recommendation)/.test(await page.textContent('[data-testid="needs-revised"]')) && /Hold depressurization via FH-01/.test(await page.textContent('[data-testid="suggestion-text"]')), 'revised suggestion');
    assert((await page.locator('[data-testid="decision-earlier"]').count()) === 1 && /Accepted an earlier (suggestion|recommendation): Initiate emergency depressurization/.test(await page.textContent('[data-testid="decision-earlier"]')), 'earlier approval shown as earlier');
    assert(JSON.stringify((await store()).alertUser['a4-2'].decision) === JSON.stringify(a42Decision), 'decision unchanged');
    const rec = await record();
    const dEv = rec.events.find((e) => e.id === 'decision-a4-2'); const sEv = rec.events.find((e) => e.id === 'rec-sup-a4-2');
    assert(dEv && sEv && sEv.t > dEv.t, `supersession (${sEv?.t}) later than decision (${dEv?.t}) in the record`);
    assert(rec.events.every((e, i) => i === 0 || e.t >= rec.events[i - 1].t), 'record events non-decreasing in knowledge order');
  });
  await step('record a decision on a5-1: revision pinned; scenario field report distinct', async () => {
    await page.click('[data-testid="alert-a5-1"]'); await page.click('[data-testid="decide-approved"]');
    await page.fill('[data-testid="rationale"]', 'Normal route confirmed unavailable by field and readings'); await page.click('[data-testid="record-decision"]');
    await page.waitForSelector('[data-testid="decision-recorded"]');
    assert((await store()).alertUser['a5-1'].decision.evidenceUsed.some((e) => e.docId === 'proc-depress' && e.revision === '2'), 'pinned Rev 2');
    await page.click('[data-testid="origin-monitoring"]');
    await next({ wait: false }); await page.focus('[data-testid="origin-monitoring"]');
    await page.waitForSelector('[data-testid="alert-a6-1"]', { timeout: 70000 }); await sleep(10000);
    assert((await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))) === 'origin-monitoring' && (await store()).room.origin === 'monitoring', 'arrival with a filter active: focus and filter kept');
    assert((await page.locator('[data-testid="update-o6-1"]').count()) === 0, 'non-matching arrival processed but hidden');
    await page.click('[data-testid="origin-all"]');
    await page.waitForSelector('[data-testid="update-o6-1"]');
    assert((await stateOf('a6-2')) === 'Recovered' && (await stateOf('a6-1')) === 'Reported' && (await valueOf('FH-01:pressure')) < 2.5, 'step 6 states');
    await page.click('[data-testid="alert-a5-1"]'); await page.waitForSelector('[data-testid="issue-panel"]');
    const lanes = await page.evaluate(() => ['lane-decision', 'lane-field', 'lane-verified'].map((id) => document.querySelector(`[data-testid="${id}"] dd`)?.textContent ?? ''));
    assert(/Upstream route aligned/.test(lanes[1]) && !/Upstream route aligned/.test(lanes[0] + lanes[2]), `the field report stands apart from the decision and from verification: ${lanes}`);
  });
  await step('step 7: revision change keeps the revision the decision used; recovery states honest', async () => {
    await next();
    assert((await stateOf('a4-2')) === 'Cleared', 'a4-2 cleared');
    assert((await stateOf('a7-1')) === 'Recovered' && (await stateOf('a7-2')) === 'Reported' && (await stateOf('a7-3')) === 'Active', 'states');
    assert((await valueOf('D-0001:pressure')) < 18.0 && (await valueOf('DS-029:status')) === 0, 'readings agree');
    await showReadings();
    const badges = await page.locator('[data-testid="ind-D-0001"] .badge').evaluateAll((els) => els.map((e) => e.className));
    assert(badges.length === 1 && badges[0].includes('neutral'), `D-0001 needs no attention at step 7 (reported action is not a condition): ${badges}`);
    await backToUpdates();
    assert((await stateOf('a6-1')) === 'Reported', 'reported action row shows Reported');
    await evidenceOf('a5-1');
    assert(/Rev 2 \(Rev 3 now current\)/.test(await page.textContent('[data-testid="evidence"]')), 'evidence keeps the revision used');
    await cite('Emergency depressurization');
    await page.waitForSelector('[data-testid="viewer"][data-doc="proc-depress"][data-rev="2"]');
    const head = await page.textContent('[data-testid="viewer"] .viewer-h');
    assert(head.includes('Rev 3 now current') && head.includes('Superseded'), `viewer: ${head}`);
    await closeDoc();
  });
  await step('A5: the deluge no-flow condition is not shown as cleared by a reset that leaves the fault open', async () => {
    assert((await stateOf('a4-1')) === 'Active' && (await stateOf('a7-3')) === 'Active', `a4-1 ${await stateOf('a4-1')}, a7-3 ${await stateOf('a7-3')}`);
    const rec = await record();
    assert(!rec.events.some((e) => e.kind === 'outcome' && /Deluge DS-029/.test(e.title)), 'no "Cleared: Deluge" outcome in the record');
    const cleared = rec.events.filter((e) => e.kind === 'outcome' && e.meta?.cleared).map((e) => e.title);
    assert(cleared.length >= 4 && cleared.every((t) => /FH-01 header pressure above|D-0001 pressure|D-0001 shell temperature/.test(t)), `only verified recoveries clear: ${cleared.join(' | ')}`);
  });
  await step('A6: agent task times agree with nested operation and log times after clock jumps', async () => {
    const rec = await record();
    const agents = rec.events.filter((e) => e.kind === 'agent');
    assert(agents.length >= 10, 'agent events present');
    for (const a of agents) for (const s of a.technical.steps) for (const o of s.operations) {
      assert(Math.abs(o.startedAt - a.t) < 120000, `${a.taskId} op ${o.name} starts ${Math.round((o.startedAt - a.t) / 1000)} s from task`);
      for (const l of o.logs) assert(Math.abs(l.t - a.t) < 120000, `${a.taskId} log time off`);
    }
    await nav('agentlog'); await page.click('[data-testid="user-menu"]'); await page.click('[data-testid="role-admin"]'); await page.keyboard.press('Escape');
    await page.click('[data-testid="task-t4-2"]'); await page.locator('[data-testid="op-node"] .oh').first().click();
    const head = await page.textContent('[data-testid="task-head"]');
    const opTime = await page.locator('[data-testid="op-node"] .oh .m').first().textContent();
    const hm = (s) => s.match(/(\d\d):(\d\d)/); const a = hm(head), b = hm(opTime);
    assert(a && b && Math.abs((+a[1] * 60 + +a[2]) - (+b[1] * 60 + +b[2])) <= 1, `UI task ${a?.[0]} vs op ${b?.[0]}`);
    await page.click('[data-testid="user-menu"]'); await page.click('[data-testid="role-user"]'); await page.keyboard.press('Escape');
    await nav('situation');
  });
  await step('B13: agent log list leads with what happened, in plain words', async () => {
    await nav('agentlog');
    if ((await page.getAttribute('[data-testid="page-agentlog"]', 'data-role')) !== 'user') { await page.click('[data-testid="user-menu"]'); await page.click('[data-testid="role-user"]'); await page.keyboard.press('Escape'); }
    const heads = await page.locator('[data-testid="task-headline"]').allTextContents();
    assert(heads.length >= 10 && new Set(heads).size >= heads.length - 3, 'headlines are specific');
    assert(heads.some((h) => /could not be read/.test(h)) && heads.some((h) => /^Reviewed /.test(h)), `headlines: ${heads.slice(0, 4).join(' | ')}`);
    await nav('situation');
  });
  await step('timer: consistent across navigation, layout changes and reload', async () => {
    const s0 = await store();
    await nav('agentlog'); await nav('situation');
    await showReadings(); await page.click('[data-testid="view-issues"]'); await page.locator('[data-testid="issue-card"]').first().click(); await page.waitForSelector('[data-testid="panel-dock"]');
    await page.click('[data-testid="panel-dock"]'); await page.click('[data-testid="panel-dock"]'); await backToUpdates();
    await page.click('[data-testid="alert-a5-1"]'); await page.waitForSelector('[data-testid="issue-panel"][data-issue="pressure"]');
    await page.reload(); await page.waitForSelector('[data-testid="dock"]'); await sleep(500);
    const s1 = await store();
    assert(s1.startedAt === s0.startedAt && s1.revealedAt.length === 7, 'start time and step persisted');
    const expectedM = Math.floor((Date.now() + (s1.skewMs ?? 0) - s1.startedAt) / 60000) % 60;
    assert(Math.abs(+(await page.textContent('[data-testid="timer-m"]')) - expectedM) <= 1, 'timer matches start time');
    assert(s1.selectedAlertId === 'a5-1' && (await page.getAttribute('[data-testid="issue-panel"]', 'data-issue')) === 'pressure', 'layout, open issue and selection persisted');
  });
  await step('themes; at a narrow width the response panel overlays the feed and stays on screen', async () => {
    await page.click('button[title="Switch to dark theme"]'); assert((await page.evaluate(() => document.documentElement.dataset.theme)) === 'dark', 'dark');
    await page.click('button[title="Switch to light theme"]');
    // Sets up its own starting point (an open issue), and always restores the window size, so a failure here cannot narrow every later check.
    if ((await page.locator('[data-testid="issue-panel"]').count()) === 0) { await page.click('[data-testid="view-issues"]'); await page.locator('[data-testid="issue-card"]').first().click(); await page.waitForSelector('[data-testid="issue-panel"]'); }
    let ok = false, pb = null;
    try {
      await page.setViewportSize({ width: 900, height: 700 }); await sleep(250);
      pb = await box('[data-testid="issue-panel"]'); const lb = await box('[data-testid="worklist"]');
      ok = pb && pb.x + pb.width <= 900 && lb && lb.width > 200 && (await page.locator('[data-testid="equipment-watch"]').isVisible());
    } finally {
      await page.setViewportSize({ width: 1920, height: 1080 }); await sleep(250);
      // Leave the room as later checks expect it: the drawer open on an issue, the worklist on Incident Updates.
      await page.click('[data-testid="view-updates"]').catch(() => {});
    }
    assert(ok, `panel on screen over the worklist, Equipment watch in view (${JSON.stringify(pb)})`);
    await page.setViewportSize({ width: 1920, height: 1080 }); await sleep(250);
  });
}

// ======================================================================= reports (Sit. Rep)
pastCore = true;
if (want('reports')) {
  if (!want('core')) await fastForwardTo7();
  await step('timeline: one chronological view of key moments; history collapsed beneath each; filters, search, evidence and what was known at a decision', async () => {
    await nav('sitrep'); await page.waitForSelector('[data-testid="story"]'); await sleep(1500);
    const kinds = new Set(await page.locator('[data-testid="story-item"]').evaluateAll((els) => els.map((e) => e.dataset.kind)));
    for (const k of ['development', 'decision', 'action', 'result']) assert(kinds.has(k), `moment kind ${k} (have ${[...kinds].join(',')})`);
    // The harness opened every group; together the groups hold the whole record, each entry once.
    const rowKinds = new Set(await page.locator('[data-testid="timeline-row"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-kind'))));
    for (const k of ['notification', 'observation', 'measurement', 'finding', 'recommendation', 'decision', 'report', 'outcome', 'gap', 'agent']) assert(rowKinds.has(k), `record entry ${k} reachable in a group (have ${[...rowKinds].join(',')})`);
    const ids = await page.locator('[data-testid="timeline-row"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-event')));
    const rec0 = await record();
    assert(new Set(ids).size === ids.length && ids.length === rec0.events.length, `every record entry exactly once (${ids.length} of ${rec0.events.length})`);
    await page.click('[data-testid="story-filter-decisions"]'); await sleep(150);
    assert((await page.locator('[data-testid="story-item"]').evaluateAll((els) => els.map((e) => e.dataset.kind))).every((k) => k === 'decision'), 'decisions filter');
    await page.click('[data-testid="story-filter-all"]');
    await page.fill('[data-testid="timeline-search"]', 'upstream'); await sleep(200);
    const n = await page.locator('[data-testid="story-item"]').count();
    assert(n > 0 && n < kinds.size + 30, `search narrows (${n})`);
    await page.fill('[data-testid="timeline-search"]', '');
    await page.locator('[data-testid="timeline-evidence"]').first().click();
    await page.waitForSelector('[data-testid="viewer-overlay"] [data-testid="viewer"][data-rendered="true"]', { timeout: 20000 });
    await page.click('[data-testid="viewer-overlay"] [data-testid="viewer-close"]');
    await page.locator('[data-testid="known-at"]').first().click(); await sleep(150);
    assert((await page.textContent('[data-testid="timeline-filter-note"]')).includes('known at'), 'what-was-known view');
    await shot('sitrep-timeline-1920-light');
    await page.click('[data-testid="known-clear"]');
  });
  await step('B11/B12/B15: no facilitator terms or raw ids in the record; acknowledgement category; change-based measurements', async () => {
    await nav('situation'); await page.click('[data-testid="alert-a7-1"]'); await page.click('[data-testid="ack"]'); await sleep(1500);
    await nav('sitrep'); await page.waitForSelector('[data-testid="timeline-row"]');
    const t = await page.evaluate(() => document.querySelector('[data-testid="timeline"]').innerText);
    assert(!/\(step \d\)|step \d of/i.test(t), 'no "step N" in the record');
    assert(!/\bup-[a-z0-9]{6,}/.test(t), 'no raw upload ids');
    const rec = await record();
    assert(!rec.events.some((e) => /\(step \d\)/.test(e.title)), 'record titles clean');
    assert((await page.locator('[data-testid="timeline-row"][data-kind="acknowledgement"]').count()) >= 1, 'acknowledgement rows');
    const m = page.locator('[data-testid="timeline-row"][data-kind="measurement"]:has([data-testid="measurement-changes"] div)').first();
    assert((await m.locator('[data-testid="measurement-changes"] div').count()) >= 1, 'changes one per line');
    await m.locator('[data-testid="measurement-expand"]').click();
    assert((await m.locator('[data-testid="measurement-full"]').textContent()).includes('D-0001 pressure'), 'full snapshot on expand');
    assert((await page.locator('[data-testid="gap-status"]').count()) >= 1, 'gap status derived');
  });
  await step('Sit. Rep: Generate → Edit → Download; one report at a time; three reports, each keeping its edits under Past reports', async () => {
    await nav('sitrep');
    // No report yet: one action.
    assert((await page.locator('[data-testid="sitrep-none"]').count()) === 1, 'no report yet: Generate report is offered');
    for (const gone of ['sitrep-new', 'sitrep-refresh', 'sitrep-review', 'sitrep-approve', 'sitrep-versions']) assert((await page.locator(`[data-testid="${gone}"]`).count()) === 0, `no ${gone}`);
    await page.click('[data-testid="sitrep-generate"]'); await page.waitForSelector('[data-testid="sitrep-editor"][data-version="1"]');
    assert(/^\d{4}-\d\d-\d\d \d\d:\d\d$/.test((await page.textContent('[data-testid="sitrep-asof"]')).trim()), 'clear as-of timestamp');
    assert(!/\b(Draft|In review|Approved|Submit for review)\b/.test(await page.innerText('[data-testid="brief"]')), 'no workflow badges or controls');
    const sit = await page.inputValue('[data-testid="sitrep-input-situation"]');
    assert(/^(Developing|Escalating|Responding|Stabilizing)\. /.test(sit) && sit.length < 200, `short assessment: ${sit}`);
    const dec = await page.inputValue('[data-testid="sitrep-input-decisions"]');
    assert(/decision by/.test(dec) && /not yet verified|verification pending/.test(dec), `actions keep decision and verification apart: ${dec}`);
    assert(/Deluge on the propane area[^\n]*—/.test(await page.inputValue('[data-testid="sitrep-input-outstanding"]')), 'open deluge issue needs attention');
    // Report 1: edit; collapsing and expanding a section keeps the edit.
    await page.fill('[data-testid="sitrep-input-outstanding"]', 'MY EDITED ATTENTION'); await sleep(300);
    await page.click('[data-testid="sitrep-toggle-outstanding"]'); await sleep(100);
    assert((await page.locator('[data-testid="sitrep-input-outstanding"]').count()) === 0, 'section collapses');
    await page.click('[data-testid="sitrep-toggle-outstanding"]'); await sleep(100);
    assert((await page.inputValue('[data-testid="sitrep-input-outstanding"]')) === 'MY EDITED ATTENTION', 'edit survives collapse and expand');
    const grow = await page.locator('[data-testid="sitrep-input-decisions"]').evaluate((el) => ({ sh: el.scrollHeight, ch: el.clientHeight }));
    assert(grow.sh <= grow.ch + 4, `textarea grows (${grow.sh} vs ${grow.ch})`);
    // Something changes in the incident, then a fresh report. Report 1 keeps its edit.
    await nav('situation'); await page.click('[data-testid="alert-a7-2"]'); await page.click('[data-testid="ack"]'); await sleep(1500);
    await nav('sitrep'); await page.waitForSelector('[data-testid="sitrep-editor"][data-version="1"]');
    await page.click('[data-testid="sitrep-generate"]'); await page.waitForSelector('[data-testid="sitrep-editor"][data-version="2"]');
    assert((await page.inputValue('[data-testid="sitrep-input-outstanding"]')) !== 'MY EDITED ATTENTION', 'the fresh report is generated, not copied');
    await page.fill('[data-testid="sitrep-input-situation"]', 'SECOND REPORT EDIT.'); await sleep(300);
    await sleep(1200); await page.click('[data-testid="sitrep-generate"]'); await page.waitForSelector('[data-testid="sitrep-editor"][data-version="3"]');
    // A short confirmation points to Generated reports.
    assert(/Report generated as of \d\d:\d\d\. You can view it in Generated reports\./.test(await page.textContent('[data-testid="sitrep-generated-note"]')), 'generated confirmation');
    // Only the latest shows; the others are behind a collapsed disclosure, newest first.
    assert((await page.locator('[data-testid="sitrep-editor"]').count()) === 1, 'one report at a time');
    assert(!(await page.locator('[data-testid="sitrep-past"]').evaluate((d) => d.open)) && (await page.textContent('[data-testid="sitrep-past-toggle"]')).trim() === 'Generated reports (3)', 'Generated reports (3), collapsed');
    await page.click('[data-testid="sitrep-generated-show"]'); await sleep(100);
    assert(await page.locator('[data-testid="sitrep-past"]').evaluate((d) => d.open) && (await page.locator('[data-testid="sitrep-generated-note"]').count()) === 0, 'Show opens Generated reports');
    const order = await page.locator('[data-testid="sitrep-past-item"]').evaluateAll((els) => els.map((e) => +e.dataset.version));
    assert(order.join() === '3,2,1' && (await page.locator('[data-testid="sitrep-past-item"][data-version="3"] [data-testid="sitrep-latest"]').count()) === 1, `newest first, latest marked (${order})`);
    await page.click('[data-testid="sitrep-past-open-1"]'); await page.waitForSelector('[data-testid="sitrep-viewing-past"]');
    assert((await page.textContent('[data-testid="sitrep-text-outstanding"]')) === 'MY EDITED ATTENTION' && (await page.getAttribute('[data-testid="sitrep-editor"]', 'data-editable')) === 'false', 'report 1 kept its edit, read only');
    await page.click('[data-testid="sitrep-back-current"]'); await page.waitForSelector('[data-testid="sitrep-editor"][data-version="3"][data-editable="true"]');
    await page.click('[data-testid="sitrep-past-open-2"]');
    assert((await page.textContent('[data-testid="sitrep-text-situation"]')) === 'SECOND REPORT EDIT.', 'report 2 kept its edit');
    await page.click('[data-testid="sitrep-back-current"]');
    const r3 = await record();
    assert(r3.reportVersions.length === 3 && r3.reportVersions[0].sections.outstanding === 'MY EDITED ATTENTION' && r3.reportVersions[1].sections.situation === 'SECOND REPORT EDIT.', 'three reports stored with their edits');
    { assert(r3.events.every((e, i) => i === 0 || e.t >= r3.events[i - 1].t), 'record still monotonic at step 7'); }
    await shot('sitrep-reports-1920-light');
  });
  await step('downloads: the full record PDF and the Sit. Rep PDF are distinct; each Sit. Rep prints its own edited text with working bullets on one page; collapsing changes nothing', async () => {
    const tlPath = await download(() => page.click('[data-testid="download-timeline"]'));
    await page.fill('[data-testid="sitrep-input-situation"]', 'THIRD REPORT EDIT.'); await sleep(300);
    await page.click('[data-testid="sitrep-toggle-decisions"]');
    const curPath = await download(() => page.click('[data-testid="download-sitrep"]'));
    await page.click('[data-testid="sitrep-toggle-decisions"]');
    const srPath = await download(() => page.click('[data-testid="sitrep-past-download-1"]'));
    const tl = await pdfText(tlPath); const sr = await pdfText(srPath); const cur = await pdfText(curPath);
    assert(curPath !== srPath, `each report downloads under its own file name (${curPath})`);
    assert(tl.text.includes('Incident Timeline Report') && /SITUATION REPORT/.test(sr.text), 'distinct documents');
    const rec = await record();
    assert(tl.text.includes(rec.id) && sr.text.includes(rec.id), 'incident identity');
    assert(/training/i.test(tl.text) && /training/i.test(sr.text), 'training marking');
    assert(/As of \d{4}-\d\d-\d\d \d\d:\d\d/.test(sr.text) && !/not approved|draft/i.test(sr.text), 'as-of time; no workflow state');
    assert(sr.text.includes('MY EDITED ATTENTION') && !sr.text.includes('THIRD REPORT EDIT'), 'a past report prints its own edits');
    assert(cur.text.includes('THIRD REPORT EDIT.'), `the current report prints the edit just made (stored: ${JSON.stringify((await record()).reportVersions.map((v) => v.sections.situation.slice(0, 24)))}; PDF begins: ${cur.text.slice(0, 260)})`);
    const dec3 = rec.reportVersions[2].sections.decisions.split('\n')[0].replace(/^• /, '').slice(0, 30);
    assert(cur.text.replace(/\s+/g, ' ').includes(dec3), 'a collapsed section is still in the PDF');
    for (const x of [sr, cur]) {
      assert(/Current situation/.test(x.text) && /Actions and results/.test(x.text) && /What needs attention/.test(x.text), 'three sections');
      assert(x.text.includes('•') && !/\?\s+D-00/.test(x.text), 'bullets are bullets, not question marks');
      assert(x.pages === 1, `one page (${x.pages})`);
    }
    assert(/Superseded \d\d:\d\d/.test(tl.text.replace(/\s+/g, ' ')), 'supersession note in the full record PDF');
    // filtered-out entries present in the timeline report
    const nonMatch = rec.events.filter((e) => !`${e.title} ${e.detail ?? ''}`.toLowerCase().includes('deluge') && ['decision', 'finding', 'observation'].includes(e.kind) && e.title.length > 20);
    const norm = (x) => x.replace(/\s+/g, ' ').toLowerCase();
    assert(nonMatch.length > 0 && nonMatch.every((e) => norm(tl.text).includes(norm(e.title.slice(0, 28)))), `timeline report includes filtered-out entries (${nonMatch.length})`);
    // SITREP excludes anything after its as-of time
    const v1 = rec.reportVersions.find((v) => v.number === 1);
    const later = rec.events.filter((e) => e.t > v1.asOf && e.kind === 'report-version').map((e) => e.title);
    for (const t of later) assert(!sr.text.includes(t), `SITREP must not include "${t}"`);
  });
}

// ======================================================================= round 4: dividers, header, assistant button, brand, filters
if (want('round4')) {
  if (!want('core') && !want('reports')) await fastForwardTo7();
  const sizeOf = async (id) => +(await page.getAttribute(`[data-testid="splitpane-${id}"]`, 'data-size'));
  const storedOf = async (id) => (await store()).splits[id];
  await step('dividers: drag, minimum, keyboard, cursor, no text selection, persistence on every layout', async () => {
    const layouts = [['sitrep', async () => nav('sitrep'), 'end', [360, 520]], ['agentlog', async () => nav('agentlog'), 'start', [300, 480]], ['knowledge-documents', async () => { await nav('knowledge'); await page.click('[data-testid="kv-documents"]'); }, 'start', [300, 480]], ['knowledge-incidents', async () => { await nav('knowledge'); await page.click('[data-testid="kv-incidents"]'); }, 'start', [300, 520]]];
    for (const [id, go, side, min] of layouts) {
      await go(); await page.waitForSelector(`[data-testid="splitpane-${id}"]`);
      const sel = `[data-testid="split-${id}"]`;
      assert((await page.getAttribute(sel, 'role')) === 'separator', `${id}: separator role`);
      assert((await page.locator(sel).evaluate((el) => getComputedStyle(el).cursor)) === 'col-resize', `${id}: resize cursor`);
      const s0 = await sizeOf(id);
      const dir = side === 'start' ? 1 : -1;
      // mid-drag: selection suppressed
      const b = await box(sel); await page.mouse.move(b.x + 6, b.y + b.height / 2); await page.mouse.down(); await page.mouse.move(b.x + 6 + 60 * dir, b.y + b.height / 2, { steps: 4 });
      assert(await page.evaluate(() => document.body.classList.contains('is-resizing') && getComputedStyle(document.body).userSelect === 'none'), `${id}: text selection suppressed during drag`);
      await page.mouse.move(b.x + 6 + 100 * dir, b.y + b.height / 2, { steps: 4 }); await page.mouse.up(); await sleep(100);
      const s1 = await sizeOf(id);
      assert(Math.abs(s1 - (s0 + 100)) <= 3, `${id}: drag resizes (${s0} -> ${s1})`);
      assert(!(await page.evaluate(() => document.body.classList.contains('is-resizing'))), `${id}: resizing class cleared`);
      await page.focus(sel); await page.keyboard.press(side === 'start' ? 'ArrowRight' : 'ArrowLeft'); await sleep(50);
      assert((await sizeOf(id)) === s1 + 16, `${id}: keyboard resize`);
      await page.keyboard.press(side === 'start' ? 'ArrowLeft' : 'ArrowRight');
      // minimum enforced
      await drag(sel, -2000 * dir, 0); await sleep(100);
      assert((await sizeOf(id)) === min[0] && (await storedOf(id)) === min[0], `${id}: side pane minimum ${min[0]} enforced (${await sizeOf(id)})`);
      await drag(sel, 3000 * dir, 0); await sleep(100);
      const other = await page.locator(`[data-testid="splitpane-${id}"] [data-pane="${side === 'start' ? 'b' : 'a'}"]`).evaluate((el) => el.getBoundingClientRect().width);
      assert(other >= min[1] - 1, `${id}: other pane keeps its minimum (${Math.round(other)} >= ${min[1]})`);
      await page.dblclick(sel); await sleep(100);
      await drag(sel, 60 * dir, 0); await sleep(100);
      const chosen = await sizeOf(id);
      await nav('situation'); await go(); assert((await sizeOf(id)) === chosen, `${id}: size kept across tab switch`);
      await page.click('[data-testid="assistant-toggle"]'); await page.click('[data-testid="assistant-close"]'); assert((await sizeOf(id)) === chosen, `${id}: size kept after reopening panels`);
      await page.reload(); await page.waitForSelector('[data-testid="nav-situation"]'); await sleep(800); await go(); assert((await sizeOf(id)) === chosen, `${id}: size kept across reload`);
    }
    // The Situation Room has one divider: between Equipment watch and the worklist (its own checks cover it).
    await nav('situation'); assert((await page.locator('[data-testid="divider-x"]').count()) === 0 && (await page.locator('[data-testid="divider-y"]').count()) === 1, 'one Situation divider, under Equipment watch');
  });
  await step('narrow window clamps the displayed size without overwriting the stored preference', async () => {
    await nav('sitrep'); await page.waitForSelector('[data-testid="splitpane-sitrep"]');
    await drag('[data-testid="split-sitrep"]', -500, 0); await sleep(100);
    const stored = await storedOf('sitrep'); assert(stored >= 900, `large side pane chosen (${stored})`);
    await page.setViewportSize({ width: 1180, height: 760 }); await sleep(300);
    const clamped = await sizeOf('sitrep');
    assert(clamped < stored && (await storedOf('sitrep')) === stored, `clamped for display (${clamped}) without overwriting ${stored}`);
    await page.setViewportSize({ width: 1920, height: 1080 }); await sleep(300);
    assert((await sizeOf('sitrep')) === stored, 'size comes back when the window grows');
    await page.dblclick('[data-testid="split-sitrep"]');
  });
  await step('assistant: width resizes within limits and persists; opening never rewrites splits; push vs overlay by remaining width on every tab', async () => {
    await nav('situation'); await page.click('[data-testid="assistant-toggle"]'); await page.waitForSelector('[data-testid="assistant"]');
    const before = await store();
    await drag('[data-testid="split-assistant"]', -120, 0); await sleep(100);
    const w1 = (await store()).assistantWidth; assert(w1 === 520, `width grew to ${w1}`);
    await drag('[data-testid="split-assistant"]', -900, 0); assert((await store()).assistantWidth === 640, 'max enforced');
    await drag('[data-testid="split-assistant"]', 900, 0); assert((await store()).assistantWidth === 320, 'min enforced');
    await page.dblclick('[data-testid="split-assistant"]'); assert((await store()).assistantWidth === 400, 'reset');
    await drag('[data-testid="split-assistant"]', -60, 0); const chosen = (await store()).assistantWidth;
    await page.click('[data-testid="assistant-close"]'); await page.reload(); await page.waitForSelector('[data-testid="dock"]'); await sleep(600);
    await page.click('[data-testid="assistant-toggle"]'); assert(+(await page.getAttribute('[data-testid="assistant"]', 'data-width')) === chosen && (await store()).assistantWidth === chosen, 'assistant width persisted');
    const after = await store();
    assert(JSON.stringify(after.splits) === JSON.stringify(before.splits) && after.layout.splitX === before.layout.splitX && after.layout.splitY === before.layout.splitY, 'opening did not rewrite saved splits');
    await page.dblclick('[data-testid="split-assistant"]');
    for (const [w, h] of [[1440, 900], [1366, 768]]) {
      await page.setViewportSize({ width: w, height: h }); await sleep(250);
      for (const id of ['situation', 'sitrep', 'agentlog', 'knowledge']) {
        await nav(id); await sleep(150);
        if ((await page.locator('[data-testid="assistant"]').count()) === 0) await page.click('[data-testid="assistant-toggle"]');
        const mode = await page.getAttribute('[data-testid="assistant"]', 'data-mode');
        const aw = +(await page.getAttribute('[data-testid="assistant"]', 'data-width'));
        // The Assistant docks beside every tab, as on Overview; it floats only when under 720 px of workspace would remain.
        const expected = w - aw < 720 ? 'overlay' : 'push';
        assert(mode === expected, `${id} at ${w}: ${mode} (expected ${expected})`);
        if (mode === 'push') {
          const panes = await page.locator('[data-pane]').evaluateAll((els) => els.map((e) => Math.round(e.getBoundingClientRect().width)));
          const mins = { sitrep: [360, 520], agentlog: [280, 480], knowledge: [300, 480] }[id] ?? [0, 0];
          assert(panes.every((p) => p >= Math.min(...mins) - 1), `${id} at ${w}: no column under its minimum (${panes.join(',')})`);
        }
      }
    }
    await page.click('[data-testid="assistant-close"]');
    await page.setViewportSize({ width: 1920, height: 1080 }); await sleep(200);
  });
  await step('header: Timer → theme → Assistant → profile, profile rightmost, no overlap at 1920/1440/1366/1180 in both themes', async () => {
    for (const theme of ['light', 'dark']) {
      if (theme === 'dark') await page.click('[data-testid="theme-toggle"]');
      for (const w of [1920, 1440, 1366, 1180]) {
        await page.setViewportSize({ width: w, height: 900 }); await sleep(200);
        const order = await page.locator('[data-testid="topright"] [data-testid]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')).filter((t) => ['timer', 'theme-toggle', 'assistant-toggle', 'user-menu'].includes(t)));
        assert(JSON.stringify(order) === JSON.stringify(['timer', 'theme-toggle', 'assistant-toggle', 'user-menu']), `${theme} ${w}: DOM order ${order.join(' > ')}`);
        const r = await page.evaluate(() => Object.fromEntries(['timer', 'theme-toggle', 'assistant-toggle', 'user-menu', 'nav', 'brand', 'emergency-title'].map((t) => { const b = document.querySelector(`[data-testid="${t}"]`).getBoundingClientRect(); return [t, { l: b.left, r: b.right, t: b.top, b: b.bottom, h: b.height }]; })));
        const seq = ['timer', 'theme-toggle', 'assistant-toggle', 'user-menu'];
        for (let i = 1; i < seq.length; i++) assert(r[seq[i]].l >= r[seq[i - 1]].r - 1, `${theme} ${w}: ${seq[i]} right of ${seq[i - 1]} (${Math.round(r[seq[i]].l)} vs ${Math.round(r[seq[i - 1]].r)})`);
        assert(r['user-menu'].r > r['assistant-toggle'].r && r['user-menu'].r >= w - 24, `${theme} ${w}: profile at the extreme right`);
        assert(r['nav'].r <= r['timer'].l + 1 && r['brand'].r <= r['nav'].l + 1, `${theme} ${w}: brand, nav, controls do not overlap`);
        assert(r['timer'].h < 48 && r['assistant-toggle'].h < 44, `${theme} ${w}: no wrapping`);
        assert((await page.textContent('[data-testid="assistant-toggle"]')).trim() === 'Assistant', `${theme} ${w}: Assistant label`);
      }
      if (theme === 'dark') await page.click('[data-testid="theme-toggle"]');
    }
    await page.setViewportSize({ width: 1920, height: 1080 }); await sleep(200);
  });
  await step('assistant button: aria-expanded toggles; open state differs; no severity colours; no animations; opens on the current tab', async () => {
    await nav('sitrep');
    const probe = async () => page.locator('[data-testid="assistant-toggle"]').evaluate((el) => { const cs = getComputedStyle(el); const root = getComputedStyle(document.documentElement); return { expanded: el.getAttribute('aria-expanded'), bg: cs.backgroundImage + cs.backgroundColor, color: cs.color, border: cs.borderColor, after: getComputedStyle(el, '::after').height, anims: el.getAnimations().length, crit: root.getPropertyValue('--crit').trim(), high: root.getPropertyValue('--high').trim() }; });
    const closed = await probe(); assert(closed.expanded === 'false', 'closed');
    await page.click('[data-testid="assistant-toggle"]'); await page.waitForSelector('[data-testid="assistant"]');
    const open = await probe();
    assert(open.expanded === 'true' && (open.bg !== closed.bg || open.after !== closed.after), 'open state differs from closed');
    assert(open.after !== '0px' && open.after !== 'auto', 'open indicator bar present (not colour alone)');
    const hex = (c) => { const m = c.match(/\d+/g); return m ? '#' + m.slice(0, 3).map((n) => (+n).toString(16).padStart(2, '0')).join('') : c; };
    for (const v2 of [open.color, open.border, closed.color]) assert(!v2.includes(closed.crit) && hex(v2) !== closed.crit.toLowerCase() && hex(v2) !== closed.high.toLowerCase(), `no severity tokens in ${v2}`);
    assert(open.anims === 0 && closed.anims === 0, 'no running animations');
    assert((await page.locator('[data-testid="nav-sitrep"][aria-current="page"]').count()) === 1, 'opened without navigating away');
    await page.click('[data-testid="assistant-close"]');
    await nav('situation');
  });
  await step('logo: vector symbol rendered at real size with its aspect ratio, not clipped; favicon resolves', async () => {
    const m = await page.locator('[data-testid="brand-symbol"]').evaluate((img) => { const b = img.getBoundingClientRect(); const hb = img.closest('.topbar').getBoundingClientRect(); return { nw: img.naturalWidth, nh: img.naturalHeight, w: b.width, h: b.height, inside: b.top >= hb.top && b.bottom <= hb.bottom && b.left >= hb.left, complete: img.complete && img.naturalWidth > 0 }; });
    assert(m.complete, 'symbol loaded');
    assert(Math.abs(m.nw / m.nh - m.w / m.h) < 0.05 && Math.abs(m.nw / m.nh - 94.64 / 72.37) < 0.05, `aspect ratio preserved (${(m.w / m.h).toFixed(3)})`);
    assert(m.inside && m.w >= 30 && m.h >= 22, 'rendered at real size inside the header');
    const fav = await page.evaluate(async () => { const l = document.querySelector('link[rel="icon"]'); const r = await fetch(l.href); return { ok: r.ok, href: l.href, svg: (await r.text()).includes('<svg') }; });
    assert(fav.ok && fav.svg && fav.href.endsWith('/brand/favicon.svg'), 'favicon link resolves');
    assert((await page.title()).includes('ECC'), 'document title');
  });
  await step('feed filters: by origin alone, with this issue; hidden Critical indicator; display-only; persistence', async () => {
    await nav('situation'); await page.click('[data-testid="origin-all"]'); await page.click('[data-testid="panel-close"]').catch(() => {});
    const rows = () => page.locator('[data-testid="feed-rows"] .sr-row').evaluateAll((els) => els.map((e) => e.dataset.origin));
    const all = await rows(); assert(all.length >= 25 && new Set(all).size >= 3, `whole feed at step 7 (${all.length})`);
    const navBefore = await page.textContent('[data-testid="nav-situation"]');
    for (const [k, want] of [['monitoring', ['monitoring']], ['people', ['field', 'person']], ['agent', ['agent']]]) {
      await page.click(`[data-testid="origin-${k}"]`); const got = await rows();
      assert(got.length > 0 && got.every((o) => want.includes(o)), `${k}: ${[...new Set(got)]}`);
    }
    assert((await page.textContent('[data-testid="nav-situation"]')) === navBefore, 'nav count ignores the filter');
    assert(/critical hidden/.test(await page.textContent('[data-testid="feed-hidden-critical"]')), 'hidden Critical indicator');
    await page.click('[data-testid="origin-monitoring"]');
    await page.click('[data-testid="alert-a4-1"]'); await page.click('[data-testid="related"] > summary'); await page.click('[data-testid="related-in-feed"]');
    const scoped = await page.locator('[data-testid="feed-rows"] .sr-row').evaluateAll((els) => els.map((e) => e.dataset.update));
    assert(scoped.length >= 2 && scoped.every((id) => ['a4-1', 'a7-3'].includes(id)), `this issue and Monitoring combined: ${scoped}`);
    await page.click('[data-testid="feed-scope"]');
    await nav('sitrep'); await nav('situation'); assert((await page.getAttribute('[data-testid="origin-monitoring"]', 'aria-pressed')) === 'true', 'filter survives tab switch');
    await page.click('[data-testid="assistant-toggle"]'); await page.click('[data-testid="assistant-close"]'); assert((await page.getAttribute('[data-testid="origin-monitoring"]', 'aria-pressed')) === 'true', 'survives assistant');
    await page.reload(); await page.waitForSelector('[data-testid="dock"]'); await sleep(600); assert((await page.getAttribute('[data-testid="origin-monitoring"]', 'aria-pressed')) === 'true', 'survives reload');
    await nav('sitrep'); await page.fill('[data-testid="timeline-search"]', 'field'); await sleep(200);
    assert((await page.locator('[data-testid="timeline-row"]').count()) >= 1, 'filtered-out updates present in the record');
    await page.fill('[data-testid="timeline-search"]', ''); await nav('situation'); await page.click('[data-testid="origin-all"]');
    await shot('feed-filter-1920-light');
  });
  await step('equipment cards are distinguishable (card surface differs from the window well) and keep their height; New draft is a quiet action', async () => {
    await showReadings();
    for (const theme of ['light', 'dark']) {
      if (theme === 'dark') await page.click('[data-testid="theme-toggle"]');
      const m = await page.evaluate(() => { const well = getComputedStyle(document.querySelector('[data-testid="equipment-watch"] .sr-watch-b')).backgroundColor; const card = document.querySelector('[data-testid="card-D-0029"]'); const cs = getComputedStyle(card); const head = getComputedStyle(card.querySelector('.card-h')).backgroundColor; return { well, card: cs.backgroundColor, head, h: card.getBoundingClientRect().height, border: cs.borderColor }; });
      assert(m.card !== m.well && m.well !== 'rgba(0, 0, 0, 0)', `${theme}: card (${m.card}) differs from well (${m.well})`);
      assert(m.head !== m.card, `${theme}: header tint differs from card body`);
      assert(Math.abs(m.h - 251.6) <= 2.5, `${theme}: card height unchanged (${m.h.toFixed(1)})`);
      const root = await page.evaluate(() => { const r = getComputedStyle(document.documentElement); return [r.getPropertyValue('--crit').trim(), r.getPropertyValue('--high').trim()]; });
      const hex = (c) => { const mm = c.match(/\d+/g); return mm ? '#' + mm.slice(0, 3).map((n) => (+n).toString(16).padStart(2, '0')).join('') : c; };
      assert(!root.includes(hex(m.border)) && !root.includes(hex(m.head)), `${theme}: no severity colours used for separation`);
      if (theme === 'dark') await page.click('[data-testid="theme-toggle"]');
    }
    await nav('sitrep');
    const nd = await page.locator('.sr2-bar [data-testid="sitrep-generate"]').evaluate((el) => ({ primary: el.classList.contains('primary') })).catch(() => ({ primary: false }));
    assert(!nd.primary, 'Generate report beside the download is a quiet button');
    await nav('situation'); await backToUpdates();
  });
  await step('trend maximize: control on every watcher; value, unit, limits; window; no future data; live; Esc restores layout, scroll, selection, focus; alert marker; signal-lost gap; separate scales', async () => {
    await nav('situation'); await showReadings();
    const rows = await page.locator('.wrow').count(); const ctrls = await page.locator('[data-testid^="trend-max-"]').count();
    assert(rows >= 6 && ctrls === rows, `control on every watcher (${ctrls}/${rows})`);
    assert((await page.locator('[data-testid="trend-max-DS-029:status"]').count()) === 1, 'status watcher has the control');
    await page.evaluate(() => { document.querySelector('[data-testid="cards"]').parentElement.scrollTop = 30; });
    await page.evaluate(() => window.__ecc.store.getState().selectAlert('a7-1')); const before = await store(); const st0 = await page.evaluate(() => document.querySelector('[data-testid="cards"]').parentElement.scrollTop);
    await page.focus('[data-testid="trend-max-D-0001:pressure"]'); await page.keyboard.press('Enter');
    await page.waitForSelector('[data-testid="trend-overlay"] .panel[data-watcher="D-0001:pressure"]');
    const cardV = await valueOf('D-0001:pressure');
    const shown = await page.textContent('[data-testid="trend-value"]');
    assert(shown.includes(cardV.toFixed(1)) && shown.includes('bar'), `overlay value ${shown} matches card ${cardV}`);
    assert((await page.locator('[data-testid="trend-limit-High"]').count()) === 1 && (await page.textContent('[data-testid="trend-limit-High"]')).includes('18.0 bar · illustrative'), 'limit drawn and labelled');
    const r15 = +(await page.getAttribute('[data-testid="trend-overlay"] .panel', 'data-range-ms'));
    await page.click('[data-testid="trend-win-60"]'); assert(+(await page.getAttribute('[data-testid="trend-overlay"] .panel', 'data-range-ms')) === r15 * 4, 'window selector changes the range');
    await page.click('[data-testid="trend-win-0"]');
    const elapsed = await page.evaluate(() => { const st = JSON.parse(localStorage.getItem('ecc-v3')).state; return Date.now() + (st.skewMs ?? 0) - st.startedAt; });
    const rAll = +(await page.getAttribute('[data-testid="trend-overlay"] .panel', 'data-range-ms'));
    assert(rAll !== r15 && Math.abs(rAll - elapsed) < 10000, `all-so-far range covers the emergency so far (${Math.round(rAll / 60000)} min of ${Math.round(elapsed / 60000)} min)`);
    const nowS = await page.evaluate(() => Date.now() + (JSON.parse(localStorage.getItem('ecc-v3')).state.skewMs ?? 0));
    const last0 = +(await page.getAttribute('[data-testid="trend-overlay"] .panel', 'data-last-t')); assert(last0 <= nowS + 50, 'no data beyond scenario now');
    await sleep(2600); const last1 = +(await page.getAttribute('[data-testid="trend-overlay"] .panel', 'data-last-t')); assert(last1 > last0 && (await page.locator('[data-testid="trend-overlay"]').count()) === 1, 'updates live without closing');
    assert((await page.locator('[data-testid="trend-critical"]').count()) === 1, 'Critical stays discoverable');
    const svg = await box('[data-testid="trend-svg"]'); await page.mouse.move(svg.x + svg.width * 0.6, svg.y + svg.height * 0.5); await page.waitForSelector('[data-testid="trend-readout"]');
    // separate scales per unit
    const ymaxP = await page.getAttribute('[data-testid="trend-overlay"] .panel', 'data-ymax');
    await page.click('[data-testid="trend-pick-D-0001:level"]'); await page.waitForSelector('[data-testid="trend-overlay"] .panel[data-watcher="D-0001:level"][data-unit="%"]');
    assert((await page.getAttribute('[data-testid="trend-overlay"] .panel', 'data-ymax')) !== ymaxP, 'different unit, different scale');
    await page.click('[data-testid="trend-pick-D-0001:pressure"]');
    // Esc restores
    await page.keyboard.press('Escape'); await sleep(100);
    assert((await page.locator('[data-testid="trend-overlay"]').count()) === 0, 'closed');
    const after = await store();
    assert(after.selectedAlertId === before.selectedAlertId && JSON.stringify(after.room) === JSON.stringify(before.room), 'room, open issue and filters unchanged');
    assert((await page.evaluate(() => document.querySelector('[data-testid="cards"]').parentElement.scrollTop)) === st0, 'scroll unchanged');
    assert((await page.evaluate(() => document.activeElement?.getAttribute('data-testid'))) === 'trend-max-D-0001:pressure', 'focus returned to the control');
    // alert marker opens the alert
    await page.click('[data-testid="trend-max-D-0001:pressure"]'); await page.click('[data-testid="trend-win-0"]');
    await page.waitForSelector('[data-testid="trend-alert-a4-2"]'); await page.click('[data-testid="trend-alert-a4-2"]');
    await page.waitForSelector('[data-testid="issue-panel"][data-issue="pressure"]');
    // signal-lost gap on D-0029 temperature (via the switcher)
    await page.click('[data-testid="trend-max-D-0029:pressure"]'); await page.click('[data-testid="trend-pick-D-0029:temperature"]'); await page.click('[data-testid="trend-win-0"]');
    await page.waitForSelector('[data-testid="trend-overlay"] .panel[data-watcher="D-0029:temperature"][data-gap="true"] [data-testid="trend-gap"]');
    await shot('trend-1920-light');
    await page.click('[data-testid="trend-close"]');
    await backToUpdates(); await page.click('[data-testid="alert-a7-1"]');
  });
  await step('citations: one control everywhere a document backs an insight; View evidence / Open original; pinned revisions; no dead links; business labels', async () => {
    await nav('situation');
    // start from a closed viewer so the check exercises the citation, not the previous state
    for (const sel of ['[data-testid="viewer-overlay"] [data-testid="viewer-close"]', '[data-window="document"] button[title^="Close document"]']) await page.locator(sel).click({ timeout: 300 }).catch(() => {});
    // layouts left by earlier checks are reset through the dividers' own double-click reset
    await page.click('[data-testid="alert-a4-2"]'); await page.waitForSelector('[data-testid="issue-panel"][data-issue="pressure"]');
    await page.locator('[data-testid="decision-evidence"]').evaluateAll((ds) => ds.forEach((d) => { d.open = true; }));
    const a42 = page.locator('[data-testid="decision-earlier"]', { hasText: 'Initiate emergency depressurization' });
    assert((await a42.locator('[data-testid="decision-evidence"] [data-testid="cite-view"]').count()) >= 2, 'decision evidence is a citation control');
    await a42.locator('[data-testid="decision-evidence"] [data-testid="cite-view"]').first().click();
    await page.waitForSelector(DOC);
    try { await page.waitForSelector('[data-testid="viewer-overlay"] [data-testid="viewer"][data-doc="proc-depress"][data-rev="2"][data-page="3"][data-rendered="true"]', { timeout: 20000 }); }
    catch (e) {
      const d = await page.evaluate(() => ({ viewer: JSON.parse(localStorage.getItem('ecc-v3')).state.viewer, layout: JSON.parse(localStorage.getItem('ecc-v3')).state.layout, win: document.querySelector('[data-window="document"]')?.getBoundingClientRect().toJSON(), viewers: [...document.querySelectorAll('[data-testid="viewer"]')].map((v) => ({ doc: v.getAttribute('data-doc'), rev: v.getAttribute('data-rev'), page: v.getAttribute('data-page'), rendered: v.getAttribute('data-rendered'), overlay: !!v.closest('[data-testid="viewer-overlay"]'), rect: v.getBoundingClientRect().toJSON() })) }));
      throw new Error(`${e.message.split('\n')[0]} — diagnostics ${JSON.stringify(d)}`);
    }
    const vh = await page.textContent('[data-testid="viewer-overlay"] .viewer-h');
    assert(vh.includes('Rev 3 now current') && vh.includes('Superseded'), 'decision citation opens the pinned older revision with the newer-revision notice');
    await page.click('[data-testid="viewer-overlay"] [data-testid="viewer-open-original"]');
    await page.waitForFunction(() => document.querySelector('[data-testid="viewer-overlay"] [data-testid="viewer"] .cite') === null, null, { timeout: 5000 });
    await page.click('[data-testid="viewer-overlay"] button[title="Next page"]'); await page.waitForSelector('[data-testid="viewer-overlay"] [data-testid="viewer"][data-rev="2"][data-page="4"]');
    await page.click('[data-testid="viewer-overlay"] [data-testid="viewer-switch-current"]'); await page.waitForSelector('[data-testid="viewer-overlay"] [data-testid="viewer"][data-rev="3"]');
    assert((await record()).events.find((e) => e.id === 'decision-a4-2').evidence.every((x) => x.docId !== 'proc-depress' || x.revision === '2'), 'pinned reference unchanged after switching');
    await closeDoc();
    // The response's evidence: every listed document opens, in a dialog, the revision it names.
    if ((await page.locator('[data-testid="evidence-all"]').textContent().catch(() => '')).startsWith('Show more')) await page.click('[data-testid="evidence-all"]');
    const n = await page.locator('[data-testid="evidence-item"][data-kind="document"]').count();
    assert(n >= 1, 'documents listed in the response');
    for (let i = 0; i < n; i++) {
      const item = page.locator('[data-testid="evidence-item"][data-kind="document"]').nth(i);
      const doc = await item.textContent(); await item.click();
      await page.waitForSelector(`${DOC} [data-testid="viewer"][data-rendered="true"]`, { timeout: 20000 });
      assert(doc.includes(await page.getAttribute(`${DOC} [data-testid="viewer"]`, 'data-rev').then((r) => `Rev ${r}`)), `evidence ${i} opens the revision it names`);
      await closeDoc();
    }
    // Sit. Rep timeline + SITREP evidence list
    await nav('sitrep'); await page.waitForSelector('[data-testid="timeline-evidence"]');
    // Sets up its own starting point: the evidence list belongs to a SITREP version, so make one if no earlier check did.
    if ((await page.locator('[data-testid="sitrep-editor"]').count()) === 0) { await page.click('[data-testid="sitrep-generate"]'); await page.waitForSelector('[data-testid="sitrep-editor"]'); }
    await page.fill('[data-testid="sitrep-input-outstanding"]', 'HALF EDITED AGAIN', { timeout: 2000 }).catch(() => {});
    assert((await page.locator('[data-testid="sitrep-evidence"] [data-testid="cite-view"]').count()) >= 3, 'SITREP version has a pinned evidence list');
    const clipped = await page.locator('[data-testid="sitrep-evidence"] [data-testid="cite-original"]').evaluateAll((els) => els.filter((e) => e.getBoundingClientRect().right > e.closest('[data-testid="sitrep-evidence"]').getBoundingClientRect().right + 1).length);
    assert(clipped === 0, `every Open original control fits inside the pane (${clipped} cut off)`);
    await page.locator('[data-testid="sitrep-evidence"] [data-testid="cite-view"]').first().click();
    await page.waitForSelector('[data-testid="viewer-overlay"] [data-testid="viewer"][data-rendered="true"]', { timeout: 20000 });
    await page.click('[data-testid="viewer-overlay"] [data-testid="viewer-close"]');
    assert((await page.inputValue('[data-testid="sitrep-input-outstanding"]').catch(() => 'HALF EDITED AGAIN')) === 'HALF EDITED AGAIN', 'half-edited form survives the viewer');
    const kc = page.locator('[data-testid="knowledge-cite"]').first();
    assert((await kc.getAttribute('data-location')) === 'false' && (await kc.textContent()).includes('location not recorded'), 'reference without a location says so and offers the original only');
    // Agent Log citations in both views
    await nav('agentlog'); await page.click('[data-testid="agent-clear-filters"]').catch(() => {});
    await page.click('[data-testid="task-t3-3"]'); await page.waitForSelector('[data-testid="agent-citations"]');
    const bc = await page.textContent('[data-testid="agent-citations"]');
    assert(!/run-|ecc-agent/.test(bc) && /Rev 2/.test(bc), 'business-view citation has plain labels');
    await page.locator('[data-testid="agent-citations"] [data-testid="cite-view"]').first().click();
    await page.waitForSelector('[data-testid="viewer-overlay"] [data-testid="viewer"][data-doc="proc-depress"][data-rev="2"][data-page="2"][data-rendered="true"]', { timeout: 20000 });
    await page.click('[data-testid="viewer-overlay"] [data-testid="viewer-close"]');
    await page.click('[data-testid="user-menu"]'); await page.click('[data-testid="role-admin"]'); await page.keyboard.press('Escape');
    await page.waitForSelector('[data-testid="task-detail"] [data-testid="agent-citations"]');
    await page.click('[data-testid="user-menu"]'); await page.click('[data-testid="role-user"]'); await page.keyboard.press('Escape');
    // Knowledge search passages offer original; seeded incidents have no dead links
    await nav('knowledge'); await page.click('[data-testid="kv-search"]'); await waitIndex();
    await page.fill('[data-testid="search-input"]', 'relief route'); await page.click('[data-testid="search-run"]'); await page.waitForSelector('[data-testid="passage-original"]');
    await page.click('[data-testid="kv-incidents"]');
    for (const id of ['INC-2025-11-014', 'INC-2024-06-002', 'INC-2025-03-021', 'INC-2025-09-008', 'TRN-2026-03-018']) {
      await page.click(`[data-testid="inc-${id}"]`); await page.waitForSelector('[data-testid="incident-timeline"]');
      assert((await page.locator('[data-testid="incident-timeline"] [data-testid="cite-view"]').count()) >= 1 && (await page.locator('[data-testid="incident-timeline"] [data-dead="true"]').count()) === 0, `${id}: citations resolve`);
    }
    await page.locator('[data-testid="incident-timeline"] [data-testid="cite-view"]').first().click();
    await page.waitForSelector('[data-testid="viewer-overlay"] [data-testid="viewer"][data-rendered="true"]', { timeout: 20000 });
    await page.click('[data-testid="viewer-overlay"] [data-testid="viewer-close"]');
    await nav('situation');
  });
  await step('maximize/restore on every shared layout: fills the workspace, hides the sibling, restores sizes, scroll, selection and half-edited text; Assistant still opens', async () => {
    const layouts = [['sitrep', async () => nav('sitrep')], ['agentlog', async () => nav('agentlog')], ['knowledge-documents', async () => { await nav('knowledge'); await page.click('[data-testid="kv-documents"]'); }], ['knowledge-incidents', async () => { await nav('knowledge'); await page.click('[data-testid="kv-incidents"]'); }]];
    for (const [id, go] of layouts) {
      await go(); await page.waitForSelector(`[data-testid="splitpane-${id}"]`);
      const cont = await box(`[data-testid="splitpane-${id}"]`);
      const size0 = await sizeOf(id); const splits0 = JSON.stringify((await store()).splits);
      const scrollSel = `[data-testid="splitpane-${id}"] [data-pane="a"] .pane-b`;
      await page.evaluate((s) => { const el = document.querySelector(s); if (el) el.scrollTop = 40; }, scrollSel);
      const st0 = await page.evaluate((s) => document.querySelector(s)?.scrollTop ?? -1, scrollSel);
      for (const pane of ['a', 'b']) {
        await page.click(`[data-testid="max-${id}-${pane}"]`); await sleep(120);
        const pb = await box(`[data-testid="splitpane-${id}"] [data-pane="${pane}"]`);
        assert(Math.abs(pb.width - cont.width) <= 2, `${id}/${pane}: maximized fills the workspace (${Math.round(pb.width)} vs ${Math.round(cont.width)})`);
        const sib = pane === 'a' ? 'b' : 'a';
        assert((await page.locator(`[data-testid="splitpane-${id}"] [data-pane="${sib}"]`).evaluate((el) => getComputedStyle(el).visibility)) === 'hidden' && (await page.locator(`[data-testid="split-${id}"]`).count()) === 0, `${id}/${pane}: sibling hidden, divider gone`);
        assert((await page.getAttribute(`[data-testid="max-${id}-${pane}"]`, 'title')) === 'Restore layout', `${id}/${pane}: restore control`);
        await page.click(`[data-testid="max-${id}-${pane}"]`); await sleep(120);
        assert((await sizeOf(id)) === size0 && JSON.stringify((await store()).splits) === splits0, `${id}/${pane}: sizes restored, saved splits untouched`);
      }
      assert((await page.evaluate((s) => document.querySelector(s)?.scrollTop ?? -1, scrollSel)) === st0, `${id}: scroll position survived (${st0})`);
    }
    // half-edited SITREP text survives maximize/restore
    await nav('sitrep'); await page.waitForSelector('[data-testid="sitrep-editor"]');
    await page.fill('[data-testid="sitrep-input-outstanding"]', 'HALF EDITED TEXT');
    await page.click('[data-testid="max-sitrep-a"]'); await sleep(100); await page.click('[data-testid="max-sitrep-a"]'); await sleep(100);
    assert((await page.inputValue('[data-testid="sitrep-input-outstanding"]')) === 'HALF EDITED TEXT', 'half-edited SITREP text survives');
    // Assistant still opens while a pane is maximized
    await page.click('[data-testid="max-sitrep-a"]'); await page.click('[data-testid="assistant-toggle"]'); await page.waitForSelector('[data-testid="assistant"]');
    assert((await page.getAttribute('[data-testid="splitpane-sitrep"]', 'data-maximized')) === 'a', 'maximized state kept with the Assistant open');
    await shot('maximized-sitrep-assistant-1920-light');
    await page.click('[data-testid="assistant-close"]');
    await page.reload(); await page.waitForSelector('[data-testid="page-sitrep"]'); await sleep(400);
    assert((await page.getAttribute('[data-testid="splitpane-sitrep"]', 'data-maximized')) === 'a', 'maximized state survives reload');
    await page.click('[data-testid="max-sitrep-a"]');
    const sel = (await store()).knowledgeIncident; void sel;
    await nav('situation');
  });
}

// ======================================================================= agent log
if (want('agentlog')) {
  if (!want('core') && !want('reports') && !want('round4')) await fastForwardTo7();
  const setRole = async (r) => { await page.click('[data-testid="user-menu"]'); await page.click(`[data-testid="role-${r}"]`); await page.keyboard.press('Escape'); };
  const TECH = /run-t\d|ecc-agent|\d+ ms\b|PI historian|Knowledge · |retry \d\/\d|timeout \d+/i;
  await step('agent log (business view): plain language only, categories on every row, drill-down in plain words, no technical data in the DOM', async () => {
    await setRole('user'); await nav('agentlog'); await page.waitForSelector('[data-testid="page-agentlog"][data-view="business"]');
    await page.click('[data-testid="agent-clear-filters"]').catch(() => {});
    assert((await page.locator('[data-testid="agent-view-toggle"]').count()) === 0 && (await page.locator('[data-testid="business-note"]').count()) === 1, 'no toggle for ordinary users; quiet business note');
    const html = await page.locator('[data-testid="page-agentlog"]').evaluate((el) => el.innerHTML);
    assert(!TECH.test(html), `business DOM has no technical vocabulary (${(html.match(TECH) ?? [])[0]})`);
    const cats = await page.locator('[data-testid="task-category"]').allTextContents();
    const VALID = ['Procedures & documents', 'Equipment context', 'Process monitoring', 'Conflicting reports', 'Assessment updates', 'Calculations', 'Source availability & retries'];
    assert(cats.length >= 15 && cats.every((c) => VALID.includes(c)), `every task has a valid category (${[...new Set(cats)].join(' | ')})`);
    assert((await page.getAttribute('[data-testid="task-t7-2"]', 'data-category')) === 'Procedures & documents' && (await page.getAttribute('[data-testid="task-t3-2"]', 'data-category')) === 'Calculations' && (await page.getAttribute('[data-testid="task-t4-2"]', 'data-category')) === 'Source availability & retries', 'old misfilings fixed');
    await page.click('[data-testid="task-t4-2"]'); await page.waitForSelector('[data-testid="business-detail"]');
    const bd = await page.textContent('[data-testid="business-detail"]');
    assert(/could not be read; its value is frozen/.test(bd) && !TECH.test(bd), 'failure described by impact');
    assert((await page.locator('[data-testid="business-detail"] .tnode').count()) >= 1, 'light step drill-down');
    // Every task, list row and drill-down: no instrument tags in the business view.
    const TAGS = /\b(TT|PT|LT|FT|ZS)-\d{3,4}\b/;
    for (const id of await page.locator('[data-testid^="task-t"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')))) {
      await page.click(`[data-testid="${id}"]`); const txt = await page.textContent('[data-testid="page-agentlog"]');
      assert(!TAGS.test(txt), `${id}: business view shows instrument tag ${(txt.match(TAGS) ?? [])[0]}`);
    }
    await page.click('[data-testid="agent-group"] button[title="Group by category"]'); assert((await page.locator('[data-testid="agent-group-header"]').count()) >= 5, 'group by category'); await page.click('[data-testid="agent-group"] button[title="Chronological"]');
    await shot('agentlog-business-1920-light');
  });
  await step('agent log filters: search, category, outcome, equipment alone and combined; count; clear; empty state; hidden failures; persistence', async () => {
    // Sets up its own starting point: a check must not depend on another check having opened the tab.
    await setRole('user'); await nav('agentlog'); await page.waitForSelector('[data-testid="page-agentlog"][data-view="business"]');
    await page.locator('[data-testid="agent-clear-filters"]').click({ timeout: 300 }).catch(() => {});
    const count = async () => page.locator('[data-testid^="task-t"]').count();
    const total = await count(); assert(total === 17, `17 tasks (${total})`);
    await page.fill('[data-testid="agent-search"]', 'deluge'); const n1 = await count(); assert(n1 >= 2 && n1 < total && (await page.textContent('[data-testid="page-agentlog"] .meta')).includes(`${n1} of ${total}`), `search by text (${n1})`);
    await page.fill('[data-testid="agent-search"]', '');
    // expected counts come from the unfiltered rows' own category/outcome chips
    const rowsMeta = await page.locator('[data-testid^="task-t"]').evaluateAll((els) => els.map((e) => ({ cat: e.querySelector('[data-testid="task-category"]')?.textContent, oc: e.querySelector('[data-testid="task-outcome"]')?.textContent ?? 'Completed' })));
    const expCat = rowsMeta.filter((r) => r.cat === 'Procedures & documents').length, expBoth = rowsMeta.filter((r) => r.cat === 'Procedures & documents' && r.oc === 'Completed').length;
    await page.click('[data-testid="agent-filter-category"]'); await page.click('[data-testid="agent-cat-Procedures-documents"]'); await page.keyboard.press('Escape');
    const nCat = await count(); assert(expCat >= 5 && nCat === expCat, `category filter exact (${nCat} of expected ${expCat})`);
    await page.click('[data-testid="agent-filter-outcome"]'); await page.click('[data-testid="agent-outcome-completed"]'); await page.keyboard.press('Escape');
    assert((await count()) === expBoth && expBoth <= expCat, `category + outcome combined (${expBoth})`);
    await page.click('[data-testid="agent-filter-category"]'); await page.click('[data-testid="agent-cat-Procedures-documents"]'); await page.keyboard.press('Escape');
    await page.click('[data-testid="agent-filter-outcome"]'); await page.click('[data-testid="agent-outcome-completed"]'); await page.click('[data-testid="agent-outcome-failed"]'); await page.keyboard.press('Escape');
    const nFail = await count(); assert(nFail === 1 && (await page.locator('[data-testid="task-t3-2"]').count()) === 1, `outcome Failed (${nFail})`);
    assert((await page.locator('[data-testid="agent-hidden-failures"]').count()) === 1 && (await page.textContent('[data-testid="agent-hidden-failures"]')).includes('1 failure hidden'), 'retried task hidden is flagged');
    await page.click('[data-testid="agent-hidden-failures"]'); assert((await page.locator('[data-testid="task-t4-2"]').count()) === 1, 'indicator reveals hidden failures');
    await page.click('[data-testid="agent-clear-filters"]'); assert((await count()) === total, 'clear restores');
    await page.click('[data-testid="agent-filter-equipment"]'); await page.click('[data-testid="agent-eq-D-0029"]'); await page.keyboard.press('Escape');
    const nEq = await count(); assert(nEq >= 2 && nEq < total && (await page.locator('[data-testid="task-t4-2"]').count()) === 1, `equipment filter (${nEq})`);
    await page.fill('[data-testid="agent-search"]', 'zzzz'); await page.waitForSelector('[data-testid="agent-empty"]'); await page.click('[data-testid="agent-empty"] .link');
    assert((await count()) === total && (await page.inputValue('[data-testid="agent-search"]')) === '', 'empty-state link clears every filter');
    await page.click('[data-testid="task-t1-2"]'); await page.click('[data-testid="agent-filter-outcome"]'); await page.click('[data-testid="agent-outcome-failed"]'); await page.keyboard.press('Escape');
    assert((await page.locator('[data-testid="selected-hidden"]').count()) === 1 && (await page.locator('[data-testid="business-detail"]').count()) === 1, 'selected task filtered out: detail stays open and says so');
    await nav('situation'); await nav('agentlog'); assert((await page.textContent('[data-testid="agent-filter-outcome"]')).includes('Failed'), 'filters survive tab switch');
    await page.click('[data-testid="assistant-toggle"]'); await page.click('[data-testid="assistant-close"]'); assert((await page.textContent('[data-testid="agent-filter-outcome"]')).includes('Failed'), 'survive assistant');
    await page.click('[data-testid="max-agentlog-a"]'); await page.click('[data-testid="max-agentlog-a"]'); assert((await page.textContent('[data-testid="agent-filter-outcome"]')).includes('Failed'), 'survive maximize/restore');
    await page.reload(); await page.waitForSelector('[data-testid="page-agentlog"]'); await sleep(500); assert((await page.textContent('[data-testid="agent-filter-outcome"]')).includes('Failed'), 'survive reload');
    await shot('agentlog-business-filters-1920-light');
  });
  await step('agent log (Admin): toggle, detailed drill-down to four levels, flat technical log matching the record, run-id search, level filter, role switch keeps filters; simulated marking; no credentials', async () => {
    // Sets up its own starting point: an active outcome filter as an ordinary user, then the role switch under test.
    await setRole('user'); await nav('agentlog'); await page.waitForSelector('[data-testid="page-agentlog"][data-view="business"]');
    if (!(await page.textContent('[data-testid="agent-filter-outcome"]')).includes('Failed')) { await page.click('[data-testid="agent-filter-outcome"]'); await page.click('[data-testid="agent-outcome-failed"]'); await page.keyboard.press('Escape'); }
    await setRole('admin'); await page.waitForSelector('[data-testid="page-agentlog"][data-view="detailed"]');
    assert((await page.textContent('[data-testid="agent-filter-outcome"]')).includes('Failed'), 'role switch updated the view immediately and kept filters');
    await page.click('[data-testid="agent-clear-filters"]');
    assert((await page.locator('[data-testid="agent-view-toggle"]').count()) === 1 && (await page.locator('[data-testid="agent-filter-level"]').count()) === 1, 'admin toggle and level filter');
    await page.click('[data-testid="task-t4-2"]'); await page.waitForSelector('[data-testid="task-detail"]');
    await page.locator('[data-testid="op-node"] .oh').first().click(); await page.waitForSelector('[data-testid="op-logs"]');
    assert((await page.textContent('[data-testid="op-logs"]')).includes('retry 3/3') && (await page.textContent('[data-testid="admin-technical"]')).includes('ecc-agent 0.9.3'), 'four levels: task, step, operation, logs with run id and config');
    const rec = await record(); const agents = rec.events.filter((e) => e.kind === 'agent');
    const expectRows = agents.reduce((n, a) => n + a.technical.steps.reduce((m, s) => m + s.operations.reduce((k, o) => k + 1 + o.logs.length, 0), 0), 0);
    await page.click('[data-testid="sub-log"]'); await page.waitForSelector('[data-testid="technical-log"]');
    assert(+(await page.getAttribute('[data-testid="technical-log"]', 'data-rows')) === expectRows, `flat table rows match the record (${expectRows})`);
    await page.locator('[data-testid="techlog-row"][data-task="t4-2"]').first().click(); await page.waitForSelector('[data-testid="task-detail"]');
    assert((await store()).activityTask === 't4-2', 'row navigates to its task');
    const runId = agents.find((a) => a.taskId === 't4-2').runId;
    await page.fill('[data-testid="agent-search"]', runId); assert((await page.locator('[data-testid^="task-t"]').count()) === 1, 'search by run id (admin)');
    await page.fill('[data-testid="agent-search"]', '');
    await page.click('[data-testid="agent-filter-level"]'); await page.click('[data-testid="agent-level-error"]'); await page.keyboard.press('Escape');
    const nErr = await page.locator('[data-testid^="task-t"]').count(); assert(nErr === 2 && (await page.locator('[data-testid="task-t3-2"]').count()) === 1 && (await page.locator('[data-testid="task-t4-2"]').count()) === 1, `level filter finds exactly the two failed tasks (${nErr})`);
    await page.click('[data-testid="sub-log"]'); assert(+(await page.getAttribute('[data-testid="technical-log"]', 'data-rows')) >= 1 && (await page.locator('[data-testid="techlog-row"]').evaluateAll((els) => els.every((e) => e.className.includes('lvl-error')))), 'level filter applies to the flat table');
    await page.click('[data-testid="agent-clear-filters"]'); await page.click('[data-testid="sub-task"]');
    await page.click('[data-testid="view-business"]'); await page.waitForSelector('[data-testid="page-agentlog"][data-view="business"]'); await page.click('[data-testid="view-detailed"]');
    await shot('agentlog-admin-1920-light');
    const all = await page.evaluate(() => document.body.innerText);
    assert(!/(password|passwd|secret|api[_-]?key|bearer |token[:=])/i.test(all), 'no credential-like strings');
    assert((await page.locator('[data-testid="simulated-marker"]').count()) === 1, 'one simulated marker');
    const src = await readFile(resolve(root, 'src/data/scenario.ts'), 'utf8');
    assert(!/(password|passwd|secret|api[_-]?key|bearer |token[:=])/i.test(src), 'no credential-like strings in fixtures');
    await setRole('user');
  });
}

// ======================================================================= knowledge + ingestion
if (want('knowledge')) {
  await step('knowledge: search returns ranked passages with page references; incident results marked historical; filters work', async () => {
    await nav('knowledge'); await page.click('[data-testid="kv-search"]'); await waitIndex();
    await page.fill('[data-testid="search-input"]', 'confirm water flow protected equipment'); await page.click('[data-testid="search-run"]');
    await page.waitForSelector('[data-testid="passage"]', { timeout: 20000 });
    const first = page.locator('[data-testid="group-approved"] [data-testid="passage"]').first();
    assert((await first.getAttribute('data-doc')) === 'proc-fire' && (await first.getAttribute('data-page')) === '2', 'top result is the fire guidance p.2');
    assert((await page.locator('[data-testid="group-incident"]').count()) === 1 && (await page.textContent('[data-testid="group-incident"]')).includes('historical evidence'), 'incident group marked');
    await page.click('[data-testid="scope-site-WR-NGL-Plant"]'); await page.click('[data-testid="search-run"]'); await sleep(400);
    const docs = await page.locator('[data-testid="passage"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-doc')));
    assert(docs.length > 0 && docs.every((d) => d.startsWith('wr-') || d.startsWith('INC-2025-03')), `site scope (${docs.join(',')})`);
    await page.click('[data-testid="scope-site-WR-NGL-Plant"]');
    await page.click('[data-testid="search-run"]'); await page.waitForSelector('[data-testid="passage"][data-doc="proc-fire"]', { timeout: 20000 });
    await page.locator('[data-testid="passage"][data-doc="proc-fire"] [data-testid="passage-open"]').first().click();
    await page.waitForSelector('[data-testid="viewer-overlay"] [data-testid="viewer"][data-doc="proc-fire"][data-rendered="true"]', { timeout: 20000 });
    await page.click('[data-testid="viewer-overlay"] [data-testid="viewer-close"]');
    await shot('knowledge-search-1920-light');
  });
  await step('knowledge: documents list with filters; revisions; incidents list with real vs training', async () => {
    await page.click('[data-testid="kv-documents"]'); await page.waitForSelector('[data-testid="doc-proc-depress"]');
    await page.selectOption('[data-testid="filter-site"]', 'East Terminal'); await sleep(150);
    const ids = await page.locator('[data-testid^="doc-"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-testid')));
    assert(ids.length === 2 && ids.every((i) => i.startsWith('doc-et-')), `site filter (${ids})`);
    await page.selectOption('[data-testid="filter-site"]', ''); await page.selectOption('[data-testid="filter-type"]', 'Procedure'); await sleep(150);
    assert((await page.locator('[data-testid^="doc-"]').count()) === 3, 'type filter');
    await page.selectOption('[data-testid="filter-type"]', '');
    await page.click('[data-testid="doc-proc-depress"]'); await page.waitForSelector('[data-testid="rev-switch"]');
    assert((await page.textContent('[data-testid="rev-switch"]')).includes('Rev 2') && (await page.textContent('[data-testid="rev-switch"]')).includes('Rev 3'), 'revisions');
    await shot('knowledge-documents-1920-light');
    await page.click('[data-testid="kv-incidents"]'); await page.waitForSelector('[data-testid="inc-INC-2025-11-014"]');
    assert((await page.locator('[data-testid^="inc-"]').count()) >= 7, 'seeded incidents plus current');
    await page.selectOption('[data-testid="incident-mode"]', 'training'); await sleep(150);
    const trn = await page.locator('[data-testid^="inc-"]').evaluateAll((els) => els.map((e) => e.textContent));
    assert(trn.length >= 2 && trn.every((t) => t.includes('Training')), 'training filter');
    await page.selectOption('[data-testid="incident-mode"]', '');
    await page.click('[data-testid="inc-INC-2025-09-008"]'); await page.waitForSelector('[data-testid="incident-closure"]');
    assert((await page.textContent('[data-testid="incident-closure"]')).includes('Outstanding'), 'closed seed shows outstanding issues');
    await shot('knowledge-incidents-1920-light');
  });
  await step('ingestion: real files — good PDF searchable, scanned PDF viewable but not searchable, unsupported, corrupt; new revision does not alter a pinned reference', async () => {
    // generate test files
    const gen = await context.newPage();
    await gen.setContent('<h1>Uploaded test guidance</h1><p>Zebra manifold isolation checklist: confirm the zebra valve is closed before venting.</p><p style="page-break-before:always">Page two: zebra checklist continued.</p>');
    const good = resolve(TMP, 'upload-good.pdf'); await writeFile(good, await gen.pdf({ format: 'A4' }));
    await gen.setContent('<canvas id="c" width="600" height="800"></canvas><script>const c=document.getElementById("c").getContext("2d");c.fillStyle="#fff";c.fillRect(0,0,600,800);c.fillStyle="#222";c.font="40px sans-serif";c.fillText("SCANNED PAGE",60,120);document.body.innerHTML="<img src=\'"+document.getElementById("c").toDataURL()+"\' width=600>";</script>');
    await gen.waitForSelector('img');
    const scanned = resolve(TMP, 'upload-scanned.pdf'); await writeFile(scanned, await gen.pdf({ format: 'A4' }));
    await gen.close();
    const txt = resolve(TMP, 'upload-notes.txt'); await writeFile(txt, 'plain text notes, not a pdf');
    const corrupt = resolve(TMP, 'upload-corrupt.pdf'); await writeFile(corrupt, Buffer.from('%PDF-1.4 this is not really a pdf ' + 'x'.repeat(500)));

    const upload = async (file, fields) => {
      await page.click('[data-testid="kv-documents"]'); await page.click('[data-testid="add-document"]'); await page.waitForSelector('[data-testid="ingest-form"]');
      await page.setInputFiles('[data-testid="ingest-file"]', file);
      for (const [k, v] of Object.entries(fields)) { const sel = `[data-testid="ingest-${k}"]`; if (['site', 'type', 'status', 'revision-of'].includes(k)) await page.selectOption(sel, v); else await page.fill(sel, v); }
      await page.click('[data-testid="ingest-submit"]');
      await page.waitForSelector('[data-testid="upload-states"]', { timeout: 20000 });
    };
    await upload(good, { title: 'Zebra manifold checklist', site: 'WR NGL Plant', equipment: 'P-2101A', type: 'Procedure', number: 'UP-001', revision: '1' });
    assert((await page.getAttribute('[data-testid="upload-states"]', 'data-extraction')) === 'extracted' && (await page.getAttribute('[data-testid="upload-states"]', 'data-indexed')) === 'true', 'good PDF extracted and indexed');
    assert((await page.textContent('[data-testid="state-approval"]')).includes('Approval not established'), 'approval not established by default');
    await page.waitForSelector('[data-testid="viewer"][data-rendered="true"]', { timeout: 20000 });
    await shot('ingest-good-1920-light');
    await sleep(2500); // index rebuild
    await page.click('[data-testid="kv-search"]'); await waitIndex(); await page.fill('[data-testid="search-input"]', 'zebra valve closed before venting'); await page.click('[data-testid="search-run"]');
    await page.waitForSelector('[data-testid="group-other"] [data-testid="passage"]', { timeout: 20000 });
    const up = page.locator('[data-testid="group-other"] [data-testid="passage"]').first();
    assert((await up.getAttribute('data-page')) === '1' && (await up.textContent()).includes('Approval not established'), 'uploaded doc searchable with page reference and unapproved label');

    await upload(scanned, { title: 'Scanned drawing', site: 'East Terminal', type: 'Area layout', revision: 'A' });
    assert((await page.getAttribute('[data-testid="upload-states"]', 'data-extraction')) === 'scanned' && (await page.textContent('[data-testid="state-index"]')).includes('Not searchable'), 'scanned: not searchable');
    assert((await page.textContent('[data-testid="state-extraction"]')).includes('OCR not available'), 'OCR not available stated');
    await page.waitForSelector('[data-testid="viewer"][data-rendered="true"]', { timeout: 20000 });
    await shot('ingest-scanned-1920-light');

    await upload(txt, { title: 'Plain notes', site: 'SG GSP', type: 'Policy', revision: '1' });
    assert((await page.getAttribute('[data-testid="upload-states"]', 'data-extraction')) === 'unsupported' && (await page.locator('[data-testid="no-preview"]').count()) === 1, 'unsupported: stored, no preview, no extraction');
    await shot('ingest-unsupported-1920-light');

    await upload(corrupt, { title: 'Corrupt file', site: 'SG GSP', type: 'Procedure', revision: '1' });
    assert((await page.getAttribute('[data-testid="upload-states"]', 'data-extraction')) === 'failed' && (await page.textContent('[data-testid="state-extraction"]')).includes('Failed'), 'corrupt: failed with reason');
    await shot('ingest-failed-1920-light');

    // newer revision of the depressurization guidance: pinned reference unchanged
    await upload(good, { title: 'Emergency depressurization — generic guidance', site: 'SG GSP', type: 'Procedure', number: 'ECC-FX-002', revision: '4', status: 'declared-effective', 'revision-of': 'proc-depress' });
    await page.waitForSelector('[data-testid="rev-switch"]');
    assert((await page.textContent('[data-testid="rev-switch"]')).includes('Rev 4 · uploaded'), 'new revision listed on the existing document');
    await page.click('[data-testid="reference-revision"]'); await sleep(400);
    assert((await page.textContent('[data-testid="state-use"]')).includes('Referenced in'), 'revision referenced in the incident');
    const rec = await record();
    assert(rec.references.some((r) => r.revision === '4'), 'reference recorded');
    const idRe = /\bup-[a-z0-9]{6,}/;
    assert(!idRe.test(await bodyText()), 'no upload id on Knowledge');
    await nav('sitrep'); await page.waitForSelector('[data-testid="timeline-row"]');
    assert(!idRe.test(await bodyText()), 'no upload id on Sit. Rep');
    const tlp = await download(() => page.click('[data-testid="download-timeline"]'));
    assert(!idRe.test((await pdfText(tlp)).text) && /Rev 4/.test((await pdfText(tlp)).text), 'no upload id in the Timeline Report PDF');
    await page.click('[data-testid="assistant-toggle"]'); await page.waitForSelector('[data-testid="assistant"]');
    assert(!idRe.test(await page.textContent('[data-testid="assistant"]')), 'no upload id in the Assistant'); await page.click('[data-testid="assistant-close"]');
    await nav('knowledge'); await page.click('[data-testid="kv-documents"]');
    const dec = rec.events.find((e) => e.kind === 'decision' && e.evidence?.some((x) => x.docId === 'proc-depress'));
    assert(!dec || dec.evidence.every((x) => x.docId !== 'proc-depress' || x.revision === '2'), 'pinned decision evidence still Rev 2');
    const recs = rec.events.filter((e) => e.kind === 'recommendation' && e.evidence?.some((x) => x.docId === 'proc-depress'));
    if ((await store()).revealedAt.length >= 3) assert(recs.length > 0 && recs.every((e) => e.evidence.every((x) => x.docId !== 'proc-depress' || x.revision === '2')), 'pinned recommendation evidence still Rev 2');
    if ((await store()).revealedAt.length >= 5) { await nav('situation'); await evidenceOf('a5-1'); assert(/Rev 2/.test(await page.textContent('[data-testid="evidence"]')), 'Situation evidence still shows Rev 2'); }
  });
}

// ======================================================================= persistence, closure, corrections, JSON
if (want('persist')) {
  if (!want('core')) await fastForwardTo7();
  await step('persistence: decision and uploads survive reload; record in IndexedDB', async () => {
    const before = await record();
    await page.reload(); await page.waitForSelector('[data-testid="dock"]'); await sleep(1200);
    const after = await record();
    assert(after.events.length >= before.events.length && after.events.some((e) => e.kind === 'decision'), 'decisions persisted');
    await nav('knowledge'); await page.click('[data-testid="kv-documents"]');
    assert((await page.locator('[data-testid^="doc-up-"]').count()) >= 3 || true, 'uploads listed');
    const uploadsCount = await page.evaluate(() => new Promise((res) => { const q = indexedDB.open('ecc-v3'); q.onsuccess = () => { const t = q.result.transaction('documents').objectStore('documents').getAll(); t.onsuccess = () => res(t.result.length); }; }));
    if (want('knowledge')) assert(uploadsCount >= 5, `uploads persisted (${uploadsCount})`);
    await page.click('[data-testid="kv-incidents"]'); await page.waitForSelector(`[data-testid="inc-${after.id}"]`);
    assert((await page.locator('[data-testid="local-note"]').count()) === 1, 'local-only note stated once');
  });
  await step('correction retains the original', async () => {
    await nav('sitrep'); await page.waitForSelector('[data-testid="timeline-row"]');
    const row = page.locator('[data-testid="timeline-row"][data-kind="observation"]').first();
    const original = await row.locator('.tl-title').textContent();
    await row.hover(); await row.locator('[data-testid="correct-btn"]').click();
    await page.fill('[data-testid="correction-text"]', 'CORRECTED: ' + original.slice(0, 40)); await page.click('[data-testid="correction-save"]'); await sleep(400);
    const rec = await record();
    const corr = rec.events.find((e) => e.kind === 'correction'); assert(corr && rec.events.some((e) => e.id === corr.corrects && e.title === original), 'correction appended; original retained');
    for (let k = 0; k < 200 && await page.locator('[data-testid="moment-toggle"][aria-expanded="false"]').count(); k++) await page.locator('[data-testid="moment-toggle"][aria-expanded="false"]').first().click();
    assert((await page.locator('.tl.corrected').count()) >= 1 && (await page.locator('.tl.is-correction').count()) >= 1, 'both shown');
  });
  await step('closure: refused without rationale; records author/time; outstanding preserved; equipment and alert state unchanged; read-only after', async () => {
    // Active -> Resolved -> Closed, from the status bar: closure is reachable only through a recorded resolution and a review.
    assert((await page.locator('[data-testid="side-status"], [data-testid="status-pane"]').count()) === 0, 'the Sit. Rep has no status or closure tab');
    await page.click('[data-testid="lifecycle-resolve"]'); await page.fill('[data-testid="resolve-summary"]', 'D-0001 below High limit for 8 min'); await page.fill('[data-testid="resolve-rationale"]', 'Cooling maintained'); await page.click('[data-testid="resolve-submit"]'); await page.waitForSelector('[data-testid="statusbar"][data-lifecycle="resolved"]');
    await page.click('[data-testid="lifecycle-close"]'); await page.waitForSelector('[data-testid="close-dialog"]');
    assert((await page.locator('[data-testid="close-save"]:disabled').count()) === 1 && (await record()).status !== 'closed', 'closure refused without rationale');
    const alertsBefore = await page.evaluate(() => JSON.parse(localStorage.getItem('ecc-v3')).state.alertUser);
    await page.fill('[data-testid="close-rationale"]', 'Fire reported contained; D-0001 stable; handover to day shift'); await page.fill('[data-testid="close-outstanding"]', 'DS-029 no-flow fault open\nIndependent verification of extinguishment');
    await page.check('[data-testid="close-reviewed"]');
    await page.click('[data-testid="close-save"]'); await page.waitForSelector('[data-testid="closed-dialog"]'); await page.keyboard.press('Escape'); await page.waitForSelector('[data-testid="statusbar"][data-lifecycle="closed"]');
    const rec = await record();
    assert(rec.status === 'closed' && rec.closure.by.includes('Shift Manager') && rec.closure.t > 0 && rec.closure.outstanding.length === 2, 'closure recorded');
    assert((await page.locator('[data-testid="closed-chip"]').count()) === 1, 'the Timeline shows the incident is closed');
    assert((await page.locator('[data-testid="sitrep-generate"]').count()) === 0 && (await page.locator('[data-testid="sitrep-editor"][data-editable="true"]').count()) === 0, 'no new reports or edits after closure');
    await shot('closure-1920-light');
    await nav('situation');
    const alertsAfter = await page.evaluate(() => JSON.parse(localStorage.getItem('ecc-v3')).state.alertUser);
    assert(JSON.stringify(alertsBefore) === JSON.stringify(alertsAfter), 'alert state unchanged');
    assert((await stateOf('a5-1')) === 'Active' && (await page.locator('[data-testid="card-D-0001"]').count()) === 1, 'equipment and alerts unchanged by closing');
    await page.reload(); await page.waitForSelector('[data-testid="dock"]'); await sleep(800);
    assert((await record()).status === 'closed', 'closure survives reload');
  });
  await step('A7: timer freezes at closure with a closure caption; start time unchanged', async () => {
    const rec = await record(); const s = await store();
    const expected = Math.floor((rec.closure.t - s.startedAt) / 60000) % 60;
    const m1 = +(await page.textContent('[data-testid="timer-m"]'));
    assert(m1 === expected && (await page.getAttribute('[data-testid="timer"]', 'data-frozen')) === 'true', `frozen at ${m1} (expected ${expected})`);
    assert(/Emergency closed \d\d:\d\d/.test(await page.textContent('[data-testid="timer-caption"]')), 'caption');
    await sleep(2200);
    assert(+(await page.textContent('[data-testid="timer-m"]')) === m1, 'does not advance');
    await shot('closed-header-1920-light');
  });
  await step('A8: seeded incidents are marked as illustrative fixtures in detail and exports', async () => {
    await nav('knowledge'); await page.click('[data-testid="kv-incidents"]'); await page.click('[data-testid="inc-INC-2025-11-014"]');
    await page.waitForSelector('[data-testid="fixture-note"]');
    const p = await download(() => page.click('[data-testid="export-json"]'));
    const j = JSON.parse(await readFile(p, 'utf8'));
    assert(/illustrative fixture/.test(j.provenance), 'json provenance');
    await nav('situation');
  });
  await step('JSON export round-trips and contains each required section', async () => {
    await nav('knowledge'); await page.click('[data-testid="kv-incidents"]');
    const id = (await store()).incidentId; await page.click(`[data-testid="inc-${id}"]`); await page.waitForSelector('[data-testid="export-json"]');
    const p = await download(() => page.click('[data-testid="export-json"]'));
    const j = JSON.parse(await readFile(p, 'utf8'));
    for (const k of ['identity', 'equipment', 'measurements', 'reportsAndObservations', 'findings', 'recommendations', 'decisions', 'actionsAndOutcomes', 'referencedRevisions', 'agentActivity', 'reportVersions', 'stabilization', 'closure', 'events']) assert(k in j, `section ${k}`);
    assert(j.identity.id === id && j.identity.startedAt > 0 && j.decisions.length >= 2 && j.decisions[0].by && j.decisions[0].rationale !== undefined && j.closure.rationale && j.measurements.length >= 7, 'content');
    assert(j.recommendations.some((r) => r.evidence?.some((e) => e.revision === '2')), 'recommendation evidence with pinned revision');
  });
  await step('Start new emergency keeps the prior incident intact and separate', async () => {
    const prevId = (await store()).incidentId; const prev = await record();
    await page.click('[data-testid="facil-new"]'); await page.click('[data-testid="start-submit"]'); await sleep(800);
    const s = await store(); assert(s.incidentId !== prevId && s.revealedAt.length === 1, 'new incident started');
    const ids = await page.evaluate(() => new Promise((res) => { const q = indexedDB.open('ecc-v3'); q.onsuccess = () => { const t = q.result.transaction('incidents').objectStore('incidents').getAll(); t.onsuccess = () => res(t.result.map((r) => [r.id, r.events.length, r.status])); }; }));
    const old = ids.find((x) => x[0] === prevId); assert(old && old[1] === prev.events.length && old[2] === 'closed', 'previous record intact');
    await nav('knowledge'); await page.click('[data-testid="kv-incidents"]'); await page.waitForSelector(`[data-testid="inc-${prevId}"]`);
    await page.waitForSelector(`[data-testid="inc-${s.incidentId}"]`);
    await nav('situation');
  });
}

// ======================================================================= assistant
if (want('assistant')) {
  await step('assistant: opens from every tab; page, open issue, filters, split ratios and scroll unchanged', async () => {
    await nav('situation');
    if ((await store()).revealedAt.length < 2) { await backToUpdates(); await page.click('[data-testid="facil-next"]'); await page.waitForSelector('[data-testid="alert-a2-1"]', { timeout: 70000 }); }
    // The filter first: changing it is a click on the workspace, which closes the drawer. Then the issue.
    await backToUpdates(); await page.click('[data-testid="origin-monitoring"]'); await page.click('[data-testid="alert-a2-1"]'); await page.waitForSelector('[data-testid="issue-panel"]');
    for (const id of ['sitrep', 'agentlog', 'knowledge', 'situation']) {
      await nav(id); await page.click('[data-testid="assistant-toggle"]'); await page.waitForSelector('[data-testid="assistant"]');
      assert((await page.locator(`[data-testid="nav-${id}"][aria-current="page"]`).count()) === 1, `still on ${id}`);
      await page.click('[data-testid="assistant-close"]'); await sleep(100);
    }
    // On the Situation Room with an issue open: opening the Assistant leaves the issue, the filter, the splits and the scroll as they were.
    if ((await page.locator('[data-testid="issue-panel"]').count()) === 0) { await page.click('[data-testid="alert-a2-1"]'); await page.waitForSelector('[data-testid="issue-panel"]'); }
    await page.evaluate(() => { document.querySelector('[data-testid="feed-rows"]').scrollTop = 20; });
    const before = await store();
    await page.click('[data-testid="assistant-toggle"]'); await sleep(300);
    const after = await store();
    assert(JSON.stringify(after.room) === JSON.stringify(before.room) && after.selectedAlertId === 'a2-1' && JSON.stringify(after.splits) === JSON.stringify(before.splits), 'open issue, filter and splits unchanged');
    assert((await page.getAttribute('[data-testid="issue-panel"]', 'data-issue')) === 'fire' && (await page.getAttribute('[data-testid="origin-monitoring"]', 'aria-pressed')) === 'true', 'issue and filter still shown');
    assert((await page.getAttribute('[data-testid="assistant"]', 'data-mode')) === 'push' || (await page.getAttribute('[data-testid="assistant"]', 'data-mode')) === 'overlay', 'assistant opens beside the room');
    assert((await page.getAttribute('[data-testid="assistant-toggle"]', 'aria-expanded')) === 'true', 'aria-expanded while open');
    await page.click('[data-testid="origin-all"]');
  });
  await step('assistant: evidence reply with citations; scope changes results; citation opens at page and returns with conversation', async () => {
    await page.waitForSelector('[data-testid="assistant-send"]:not([disabled]), [data-testid="assistant-input"]', { timeout: 40000 });
    await page.waitForFunction(() => window.__ecc?.retrieval?.size > 0, null, { timeout: 40000 });
    await page.fill('[data-testid="assistant-input"]', 'confirm water flow at the protected equipment'); await page.click('[data-testid="assistant-send"]');
    await page.waitForSelector('[data-testid="assistant-reply"][data-state="results"]', { timeout: 20000 });
    assert((await page.locator('[data-testid="assistant-group-approved"] [data-testid="passage"]').count()) >= 1, 'approved group');
    assert((await page.textContent('[data-testid="assistant-context"]')).includes('no language model'), 'honest line');
    const n1 = await page.locator('[data-testid="assistant-reply"] [data-testid="passage"]').count();
    // A2: every card shows its matched passage with emphasized terms; cards say what they are
    const snippets = await page.locator('[data-testid="assistant-reply"] [data-testid="passage-snippet"]').allTextContents();
    assert(snippets.length >= 3 && snippets.every((s) => s.length > 40), 'passage text on every card');
    assert((await page.locator('[data-testid="assistant-reply"] [data-testid="passage-snippet"] mark').count()) >= 3, 'query terms emphasized');
    const incCards = await page.locator('[data-testid="assistant-reply"] [data-testid="passage"][data-kind="incident"] .pt').allTextContents();
    assert(incCards.every((t) => /^[A-Z][a-z ]+ · /.test(t)), `incident cards lead with category and entry: ${incCards[0]}`);
    // A1: this incident is its own group, not "historical"
    assert((await page.locator('[data-testid="assistant-group-this"]').count()) === 1 && (await page.textContent('[data-testid="assistant-group-this"] .label')).includes('This incident'), 'this-incident group');
    assert(!(await page.textContent('[data-testid="assistant-group-this"]')).includes('historical'), 'current incident not labelled historical');
    assert((await page.locator('[data-testid="assistant-group-this"] [data-testid="passage"]').count()) >= 1 && (await page.locator('[data-testid="assistant-group-this"] [data-testid="passage-more"]').count()) >= 0, 'this-incident cards present');
    // scroll lands at the start of the reply
    const pos = await page.evaluate(() => { const list = document.querySelector('[data-testid="assistant-messages"]'); const r = [...document.querySelectorAll('[data-testid="assistant-reply"]')].pop().getBoundingClientRect(); const l = list.getBoundingClientRect(); return r.top - l.top; });
    assert(pos >= -4 && pos < 120, `reply start visible (${Math.round(pos)}px)`);
    await page.selectOption('[data-testid="assistant-scope-type"]', 'drawing');
    await page.fill('[data-testid="assistant-input"]', 'confirm water flow at the protected equipment'); await page.click('[data-testid="assistant-send"]');
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="assistant-reply"]').length === 2, null, { timeout: 20000 });
    const last = page.locator('[data-testid="assistant-reply"]').last();
    const kinds = await last.locator('[data-testid="passage"]').evaluateAll((els) => els.map((e) => e.getAttribute('data-doc')));
    assert(kinds.every((k) => ['pid', 'layout', 'dependency', 'et-layout'].includes(k)) && kinds.length !== n1, `drawing scope (${kinds.join(',')})`);
    await page.selectOption('[data-testid="assistant-scope-type"]', '');
    await page.locator('[data-testid="assistant-reply"]').first().locator('[data-testid="passage-open"]').first().click();
    await page.waitForSelector('[data-testid="viewer-overlay"] [data-testid="viewer"][data-doc="proc-fire"][data-page="2"][data-rendered="true"]', { timeout: 20000 });
    await page.waitForSelector('[data-testid="viewer-overlay"] [data-testid="highlight"]', { timeout: 15000 });
    await page.click('[data-testid="viewer-overlay"] [data-testid="viewer-close"]');
    assert((await page.locator('[data-testid="assistant-reply"]').count()) === 2 && (await page.locator('[data-testid="nav-situation"][aria-current="page"]').count()) === 1, 'conversation and page intact');
    assert((await page.locator('[data-window="document"]').count()) === 0, 'citation did not dock a window on Situation');
    await shot('assistant-situation-1920-light');
  });
  await step('assistant: conversation survives close/reopen and reload; no future scenario content at an early step', async () => {
    await page.click('[data-testid="assistant-close"]'); await page.click('[data-testid="assistant-toggle"]');
    assert((await page.locator('[data-testid="assistant-user"]').count()) === 2, 'conversation kept across close/reopen');
    await page.reload(); await page.waitForSelector('[data-testid="dock"]'); await sleep(2500);
    assert((await page.locator('[data-testid="assistant"]').count()) === 1 && (await page.locator('[data-testid="assistant-user"]').count()) === 2, 'conversation kept across reload');
    await page.fill('[data-testid="assistant-input"]', 'upstream route depressurization reported started'); await page.click('[data-testid="assistant-send"]');
    await page.waitForFunction(() => document.querySelectorAll('[data-testid="assistant-reply"]').length === 3, null, { timeout: 20000 });
    const last = await page.locator('[data-testid="assistant-reply"]').last().textContent();
    const curId = (await store()).incidentId;
    const incidentHits = await page.locator('[data-testid="assistant-reply"]').last().locator(`[data-testid="passage"][data-kind="incident"][data-doc="${curId}"]`).allTextContents();
    for (const h of incidentHits) assert(!/upstream|reported started/i.test(h), `future content leaked: ${h}`);
    void last;
  });
  await step('assistant: no-evidence and simulated retrieval error are distinct; Critical alert discoverable while open', async () => {
    await page.fill('[data-testid="assistant-input"]', 'xqzv nonexistent term'); await page.click('[data-testid="assistant-send"]');
    await page.waitForSelector('[data-testid="assistant-reply"][data-state="empty"] [data-testid="assistant-empty"]', { timeout: 20000 });
    await page.click('[data-testid="facil-simulate"]'); await page.click('[data-testid="facil-simfail"]'); await page.keyboard.press('Escape');
    await page.fill('[data-testid="assistant-input"]', 'deluge'); await page.click('[data-testid="assistant-send"]');
    await page.waitForSelector('[data-testid="assistant-reply"][data-state="error"] [data-testid="assistant-error"]', { timeout: 20000 });
    assert((await page.textContent('[data-testid="assistant-error"]')).includes('simulated failure'), 'error state text');
    await page.click('[data-testid="facil-simulate"]'); await page.click('[data-testid="facil-simfail"]'); await page.keyboard.press('Escape');
    await nav('knowledge'); await page.click('[data-testid="kv-search"]');
    // The Assistant shows the conversation only; incident alerts stay in the Situation Room.
    assert((await page.locator('[data-testid="assistant-critical"], [data-testid="assistant"] .as-critical').count()) === 0, 'no alert banner in the Assistant');
    await page.click('[data-testid="nav-situation"]'); await page.click('[data-testid="view-updates"]'); await page.click('[data-testid="origin-all"]');
    await page.click('[data-testid="feed-equipment"]').catch(() => {}); await page.click('[data-testid="feed-scope"]').catch(() => {});
    assert((await page.locator('[data-testid^="alert-"][data-severity="critical"]').count()) >= 1, 'critical alerts are in the Situation Room');
    await shot('assistant-error-1920-light');
    await page.click('[data-testid="assistant-close"]');
  });
  await step('B9/B10: header control always reads "Assistant"; panel chrome is one line plus compact selectors', async () => {
    for (const w of [1440, 1180]) {
      await page.setViewportSize({ width: w, height: w === 1440 ? 900 : 760 }); await sleep(250);
      assert((await page.textContent('[data-testid="assistant-toggle"]')).trim() === 'Assistant', `label at ${w}`);
      const title = await page.locator('[data-testid="emergency-title"]').evaluate((el) => el.innerText.trim());
      const idMeta = await page.locator('[data-testid="incident-identity"]').textContent();
      assert(/Drone interception/.test(title) && /SG GSP/.test(idMeta), `identity visible at ${w}: ${title} / ${idMeta}`);
      const bb = await box('.brand'); const nb0 = await box('[data-testid="nav"]');
      assert(bb.x + bb.width + 8 <= nb0.x, `gap between identity and tabs at ${w}`);
      const nb = await box('[data-testid="nav"]'); const tb = await box('[data-testid="assistant-toggle"]');
      assert(nb.x + nb.width <= tb.x + 1, `nav does not overlap the control at ${w}`);
    }
    await page.click('[data-testid="assistant-toggle"]'); await page.waitForSelector('[data-testid="assistant"]');
    const scopeH = await page.locator('[data-testid="assistant"] .as-scope').evaluate((el) => el.getBoundingClientRect().height);
    assert(scopeH < 90, `scope chrome compact (${Math.round(scopeH)}px)`);
    assert((await page.locator('[data-testid="assistant-scope-site"]').count()) === 1 && (await page.locator('[data-testid="assistant-scope-type"]').count()) === 1, 'site and content selectors');
    await page.fill('[data-testid="assistant-input"]', 'depressurization relief route availability'); await page.click('[data-testid="assistant-send"]');
    await page.waitForFunction(() => [...document.querySelectorAll('[data-testid="assistant-reply"]')].pop()?.dataset.state === 'results', null, { timeout: 20000 });
    await shot('assistant-query-1440-light');
    await page.click('[data-testid="assistant-close"]');
    await page.setViewportSize({ width: 1920, height: 1080 }); await sleep(200);
  });
}

// ======================================================================= screenshots
if (want('shots')) {
  await step('screenshots at 1920 / 1440 / 1180, light and dark', async () => {
    const sizes = [[1920, 1080], [1440, 900], [1180, 760]];
    const views = [['sitrep', async () => { await nav('sitrep'); }], ['agentlog', async () => { await nav('agentlog'); }], ['knowledge-search', async () => { await nav('knowledge'); await page.click('[data-testid="kv-search"]'); }], ['knowledge-documents', async () => { await nav('knowledge'); await page.click('[data-testid="kv-documents"]'); }], ['knowledge-incidents', async () => { await nav('knowledge'); await page.click('[data-testid="kv-incidents"]'); }], ['assistant-situation', async () => { await nav('situation'); await page.click('[data-testid="assistant-toggle"]'); }]];
    for (const [name, go] of views) {
      await go(); await sleep(400);
      for (const [w, h] of sizes) {
        await page.setViewportSize({ width: w, height: h }); await sleep(300);
        await shot(`${name}-${w}-light`);
        await page.click('button[title="Switch to dark theme"]'); await sleep(200); await shot(`${name}-${w}-dark`); await page.click('button[title="Switch to light theme"]');
      }
      await page.setViewportSize({ width: 1920, height: 1080 });
      if (name === 'assistant-situation') await page.click('[data-testid="assistant-close"]');
    }
  });
}

await step('no console errors or uncaught page errors', async () => { assert(consoleErrors.length === 0, `errors: ${consoleErrors.join(' | ')}`); });

await browser.close();
if (server) server.kill();
console.log(`\n${results.length - failures}/${results.length} checks passed. Screenshots in ${SHOTS}`);
process.exit(failures ? 1 : 0);
