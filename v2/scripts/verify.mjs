// Repeatable end-to-end verification of the ECC prototype with installed Chrome.
// Usage: npm run verify   (starts the dev server on 5188 if it is not running)
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
const URL = 'http://localhost:5188/';
const SHOTS = process.env.SHOTS_DIR ?? '/private/tmp/claude-502/-Users-ahsan-saeed-projects-ecc/1bbccf28-ffca-4660-92cc-0dff6372c1b9/scratchpad/shots';
await mkdir(SHOTS, { recursive: true });

// ---------- dev server ----------
let server = null;
async function up() { try { const r = await fetch(URL); return r.ok; } catch { return false; } }
if (!(await up())) {
  server = spawn('npx', ['vite', '--port', '5188', '--strictPort'], { cwd: root, stdio: 'ignore' });
  for (let i = 0; i < 60 && !(await up()); i++) await new Promise((r) => setTimeout(r, 500));
  if (!(await up())) { console.error('dev server did not start'); process.exit(1); }
}

// ---------- harness ----------
const results = [];
let failures = 0;
function assert(cond, msg) { if (!cond) throw new Error(`assertion failed: ${msg}`); }
async function step(name, fn) {
  try { await fn(); results.push(['PASS', name]); console.log('PASS', name); }
  catch (e) { failures++; results.push(['FAIL', name, String(e.message ?? e)]); console.log('FAIL', name, '-', e.message ?? e); }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1920, height: 1080 }, deviceScaleFactor: 1 });
const page = await context.newPage();
const consoleErrors = [];
page.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
page.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
page.on('dialog', (d) => d.accept());

const store = async () => JSON.parse(await page.evaluate(() => localStorage.getItem('ecc-v2'))).state;
const bodyText = async () => (await page.evaluate(() => document.body.innerText + ' ' + Array.from(document.querySelectorAll('[title]')).map((e) => e.getAttribute('title')).join(' '))).toLowerCase();
const shot = (name) => page.screenshot({ path: `${SHOTS}/${name}.png` });
const assertNoFuture = async (label) => {
  const r = await page.evaluate(() => {
    const now = Date.now();
    const times = [...document.querySelectorAll('tr.row[data-time], [data-testid="observation"][data-time]')].map((e) => +e.getAttribute('data-time'));
    return { now, max: Math.max(...times), n: times.length };
  });
  assert(r.n > 0 && r.max <= r.now, `${label}: visible timestamp in the future by ${r.max - r.now} ms`);
};
const LAST_ALERT = { 2: 'a2-2', 3: 'a3-2', 4: 'a4-3', 5: 'a5-2', 6: 'a6-2', 7: 'a7-3' };
// Reveal the next step and, unless told otherwise, wait until its last event has become visible.
const next = async ({ wait = true } = {}) => {
  const k = (await store()).revealedAt.length + 1;
  await page.click('[data-testid="facil-next"]'); await sleep(150);
  await assertNoFuture('immediately after reveal');
  await sleep(1500);
  await assertNoFuture('after the clock advanced');
  if (wait) { await page.waitForSelector(`[data-testid="alert-${LAST_ALERT[k]}"]`, { timeout: 70000 }); await assertNoFuture('after the step unfolded'); }
};
const valueOf = async (watcherId) => +(await page.getAttribute(`[data-testid="watcher-${watcherId}"]`, 'data-value'));
const stateOf = async (alertId) => (await page.textContent(`[data-testid="alert-${alertId}"] td.state`)).trim();
const box = async (sel) => (await page.locator(sel).first().boundingBox());
async function drag(sel, dx, dy) {
  const b = await box(sel);
  const x = b.x + b.width / 2, y = b.y + b.height / 2;
  await page.mouse.move(x, y); await page.mouse.down();
  await page.mouse.move(x + dx / 2, y + dy / 2, { steps: 5 }); await page.mouse.move(x + dx, y + dy, { steps: 5 });
  await page.mouse.up(); await sleep(100);
}

const MARKERS = { 2: ['shrapnel damage reported'], 3: ['heat input from adjacent fire'], 4: ['no flow after activation'], 5: ['normal relief route unavailable', 'upstream'], 6: ['reported started'], 7: ['falling trend sustained', 'reported contained'] };

// ---------- fresh start ----------
await page.goto(URL);
await page.evaluate(() => localStorage.clear());
await page.reload();
await page.waitForSelector('[data-testid="dock"]');

await step('fresh emergency: timer reads 00 h 00 m and step 1 of 7', async () => {
  assert((await page.textContent('[data-testid="timer-h"]')) === '00', 'hours');
  assert((await page.textContent('[data-testid="timer-m"]')) === '00', 'minutes');
  assert((await page.textContent('[data-testid="facil-step"]')).includes('Step 1 of 7'), 'facilitator step');
  assert((await page.locator('[data-testid="mode-marker"]').count()) === 1, 'one persistent illustrative marker');
});

await step('no future-step content on any page at step 1', async () => {
  for (const nav of ['Situation', 'Agent Activity', 'Knowledge', 'SITREP', 'Records']) {
    await page.click(`nav button:has-text("${nav}")`); await sleep(150);
    if (nav === 'Records') { await page.click('[data-testid="records-history"]'); await sleep(100); await page.click('[data-testid="records-current"]'); }
    const t = await bodyText();
    for (const [k, ms] of Object.entries(MARKERS)) for (const m of ms) assert(!t.includes(m), `"${m}" (step ${k}) leaked on ${nav}`);
  }
  await page.click('nav button:has-text("Situation")');
});

await step('add equipment: FW-01 appears as a fifth card', async () => {
  assert((await page.locator('[data-testid^="card-"]').count()) === 4, '4 cards initially');
  await page.click('[data-testid="add-equipment"]');
  await page.click('[data-testid="add-FW-01"]');
  await page.waitForSelector('[data-testid="card-FW-01"]');
  assert((await page.locator('[data-testid^="card-"]').count()) === 5, '5 cards after add');
});

await step('watchers: add, adjust and remove on D-0029', async () => {
  assert((await page.locator('[data-testid="watcher-D-0029:temperature"]').count()) === 0, 'temperature hidden by default');
  await page.click('[data-testid="add-watcher-D-0029"]');
  await page.click('[data-testid="watch-D-0029:temperature"]');
  await page.waitForSelector('[data-testid="watcher-D-0029:temperature"]');
  const row = page.locator('[data-testid="watcher-D-0029:temperature"]');
  await row.hover();
  await row.locator('button[title="Adjust watcher"]').click();
  await page.click('.pop button:has-text("60 min")');
  await page.keyboard.press('Escape');
  assert((await row.textContent()).includes('60 min'), 'trend window adjusted to 60 min');
  await row.hover();
  await row.locator('button[title="Adjust watcher"]').click();
  await page.click('[data-testid="hide-D-0029:temperature"]');
  assert((await page.locator('[data-testid="watcher-D-0029:temperature"]').count()) === 0, 'watcher removed');
  assert((await page.locator('[data-testid="card-D-0029"]').textContent()).includes('1 hidden · still monitored'), 'hidden watcher still monitored');
});

await step('step 2: fire alerts appear; step-2 markers only now', async () => {
  await next();
  await page.waitForSelector('[data-testid="alert-a2-1"]');
  assert((await page.locator('[data-testid="alert-a2-1"]').getAttribute('data-severity')) === 'critical', 'critical severity');
  const t = await bodyText();
  assert(t.includes(MARKERS[2][0]), 'step 2 marker present');
  for (const m of [...MARKERS[3], ...MARKERS[4], ...MARKERS[5], ...MARKERS[6], ...MARKERS[7]]) assert(!t.includes(m), `"${m}" leaked at step 2`);
});

await step('filter from card indicator; important alerts elsewhere stay discoverable; clear filter', async () => {
  await page.click('[data-testid="ind-D-0029"]');
  await page.waitForSelector('[data-testid="filterbar"]');
  const eqs = await page.locator('tr.row td.eq').allTextContents();
  assert(eqs.length > 0 && eqs.every((e) => e === 'D-0029'), 'only D-0029 rows shown');
  await next({ wait: false }); // step 3 adds a High alert on D-0001 while the filter is on (its rows are filtered out)
  await page.waitForSelector('[data-testid="hidden-note"]', { timeout: 70000 });
  const note = await page.textContent('[data-testid="hidden-note"]');
  assert(/1 alert rated Critical or High on other equipment/.test(note), `hidden note: ${note}`);
  assert((await page.locator('[data-testid="ind-D-0001"] .badge').count()) >= 1, 'D-0001 card indicator shows its alerts');
  await page.click('[data-testid="clear-filter"]');
  assert((await page.locator('[data-testid="filterbar"]').count()) === 0, 'filter cleared');
  assert((await page.locator('[data-testid="alert-a3-1"]').count()) === 1, 'D-0001 alert visible after clearing');
  await page.waitForSelector('[data-testid="alert-a3-2"]', { timeout: 70000 });
});

await step('hidden watcher does not suppress its alert (D-0029 temperature at step 4)', async () => {
  await next(); // step 4
  await page.waitForSelector('[data-testid="alert-a4-3"]');
  const v = await valueOf('D-0001:pressure');
  assert(v > 18.0, `a4-2 says above High 18.0; card shows ${v}`);
  assert((await page.locator('[data-testid="watcher-D-0029:temperature"]').count()) === 0, 'watcher still hidden');
  assert((await page.textContent('[data-testid="alert-a4-3"]')).includes('temperature signal lost'), 'alert text');
});

await step('select alert: response, observations and sources open; read is not acknowledge', async () => {
  await page.click('[data-testid="alert-a3-1"]');
  await page.waitForSelector('[data-testid="response-detail"][data-alert="a3-1"]');
  assert((await page.locator('[data-testid="alert-a3-1"]').getAttribute('class')).indexOf('unread') === -1, 'row marked read');
  const s = await store();
  assert(s.alertUser['a3-1'].readAt && !s.alertUser['a3-1'].ackAt, 'read without acknowledgement');
  assert((await page.locator('[data-testid="calc"]').textContent()).includes('not computed'), 'calculation without method says so');
  await page.click('[data-testid="tab-observations"]'); await page.waitForSelector('[data-testid="observations"]');
  await page.click('[data-testid="tab-sources"]'); await page.waitForSelector('[data-testid="sources"]');
  await page.click('[data-testid="tab-response"]'); await page.waitForSelector('[data-testid="recommendation"]');
});

await step('source: PDF renders on cited page with exact highlight from the text layer', async () => {
  await page.click('[data-testid="ev-proc-depress"]');
  await page.waitForSelector('[data-window="document"]');
  await page.waitForSelector('[data-testid="viewer"][data-page="2"][data-rev="2"][data-rendered="true"]', { timeout: 15000 });
  await page.waitForSelector('[data-testid="exact-match"]', { timeout: 15000 });
  const hl = await box('[data-testid="highlight"]');
  assert(hl && hl.width > 40 && hl.height > 6, 'highlight has size');
  const canvas = await page.evaluate(() => { const c = document.querySelector('[data-testid="viewer"] canvas'); return { w: c.width, h: c.height }; });
  assert(canvas.w > 300 && canvas.h > 300, 'canvas rendered');
  await shot('doc-exact-highlight');
});

await step('source: ambiguous passage shows match navigation, not a single arbitrary highlight', async () => {
  await page.click('[data-testid="alert-a4-1"]');
  await page.click('[data-testid="ev-proc-fire"]');
  await page.waitForSelector('[data-testid="viewer"][data-doc="proc-fire"][data-matches="3"] [data-testid="match-nav"]', { timeout: 15000 });
  assert((await page.locator('[data-testid="viewer"]').getAttribute('data-matches')) === '3', '3 matches found');
  assert((await page.textContent('[data-testid="match-pos"]')).includes('Match 1 of 3'), 'match position');
  await page.click('[data-testid="match-next"]');
  assert((await page.textContent('[data-testid="match-pos"]')).includes('Match 2 of 3'), 'navigated to match 2');
  await shot('doc-ambiguous');
});

await step('source: page-only citation states the limitation; drawing region is highlighted', async () => {
  await page.click('[data-testid="alert-a4-2"]');
  await page.click('[data-testid="ev-limits"]');
  await page.waitForSelector('[data-testid="viewer"][data-doc="limits"][data-page="2"]');
  await page.waitForFunction(() => document.querySelector('[data-testid="viewer"] .cite')?.textContent.includes('exact region not available'), null, { timeout: 15000 });
  await page.click('[data-testid="ev-pid"]');
  await page.waitForSelector('[data-testid="viewer"][data-doc="pid"][data-rendered="true"] .hl.region', { timeout: 15000 });
  const r = await box('[data-testid="viewer"] .hl.region');
  assert(r && r.width > 100, 'drawing region highlighted');
  await shot('doc-drawing-region');
});

await step('docking: drag both dividers', async () => {
  const before = await box('[data-col="monitoring"]');
  await drag('[data-testid="divider-x"]', -160, 0);
  const after = await box('[data-col="monitoring"]');
  assert(after.width < before.width - 100, `monitoring narrower (${before.width} -> ${after.width})`);
  const eqBefore = await box('[data-window="equipment"]');
  await drag('[data-testid="divider-y"]', 0, 90);
  const eqAfter = await box('[data-window="equipment"]');
  assert(eqAfter.height > eqBefore.height + 50, `equipment taller (${eqBefore.height} -> ${eqAfter.height})`);
  await drag('[data-testid="divider-x"]', 160, 0);
  await drag('[data-testid="divider-y"]', 0, -90);
});

await step('docking: swap sides and back', async () => {
  const m0 = await box('[data-col="monitoring"]'), r0 = await box('[data-col="response"]');
  assert(m0.x < r0.x, 'monitoring left by default');
  await page.click('[data-window="equipment"] button[title="Swap monitoring and response sides"]');
  const m1 = await box('[data-col="monitoring"]'), r1 = await box('[data-col="response"]');
  assert(m1.x > r1.x, 'monitoring on the right after swap');
  await shot('layout-swapped');
  await page.click('[data-window="response"] button[title="Swap monitoring and response sides"]');
  const m2 = await box('[data-col="monitoring"]');
  assert(m2.x < (await box('[data-col="response"]')).x, 'swapped back');
});

await step('docking: maximize the log and restore the previous layout', async () => {
  const splitBefore = (await store()).layout.splitX;
  await page.click('[data-window="log"] button[title="Maximize window"]');
  assert((await page.getAttribute('[data-testid="dock"]', 'data-maximized')) === 'log', 'log maximized');
  assert((await page.locator('[data-window="equipment"]').count()) === 0, 'other windows hidden');
  const lb = await box('[data-window="log"]');
  assert(lb.width > 1800, 'log fills the workspace');
  await shot('layout-maximized-log');
  await page.click('[data-window="log"] button[title="Restore layout"]');
  assert((await page.getAttribute('[data-testid="dock"]', 'data-maximized')) === '', 'restored');
  assert(Math.abs((await store()).layout.splitX - splitBefore) < 1e-6, 'split preserved');
  assert((await page.locator('[data-window="document"]').count()) === 1, 'third docked window still present');
});

await step('close the investigation: selection and log scroll position survive', async () => {
  await drag('[data-testid="divider-y"]', 0, 260); // shorter log so it scrolls
  await page.evaluate(() => { document.querySelector('[data-testid="log-scroll"]').scrollTop = 60; });
  const sel = (await store()).selectedAlertId;
  assert(sel === 'a4-2', 'a4-2 selected');
  await page.click('[data-window="document"] button[title^="Close document"]');
  assert((await page.locator('[data-window="document"]').count()) === 0, 'document window closed');
  assert((await store()).selectedAlertId === 'a4-2', 'selection kept');
  assert((await page.locator('[data-testid="alert-a4-2"]').getAttribute('aria-selected')) === 'true', 'row still selected');
  const st = await page.evaluate(() => document.querySelector('[data-testid="log-scroll"]').scrollTop);
  assert(st === 60, `log scroll kept (${st})`);
});

let a42Decision = null;
await step('record an approval on a4-2 at step 4 (to be superseded later)', async () => {
  await page.click('[data-testid="alert-a4-2"]');
  await page.click('[data-testid="decide-approved"]');
  await page.fill('[data-testid="rationale"]', 'Approved on reported route availability');
  await page.click('[data-testid="record-decision"]');
  await page.waitForSelector('[data-testid="decision-recorded"]');
  assert((await page.locator('[data-testid="decision-review-flag"]').count()) === 0, 'no review flag before supersession');
  a42Decision = (await store()).alertUser['a4-2'].decision;
  assert(a42Decision.status === 'approved', 'approval stored');
});

await step('non-disruption: new alerts do not move the log or reset a half-filled decision form', async () => {
  await page.click('[data-testid="alert-a4-1"]');
  await page.fill('[data-testid="rationale"]', 'Hold pending relief route check');
  await page.click('[data-testid="decide-deferred"]');
  await page.evaluate(() => { document.querySelector('[data-testid="log-scroll"]').scrollTop = 120; });
  const rowsBefore = await page.locator('tr.row').count();
  await next({ wait: false }); // step 5: its alerts arrive over the next ~30 s while the log stays scrolled
  await page.waitForFunction(() => document.querySelector('[data-testid="new-pill"]')?.textContent.includes('2 new alerts'), null, { timeout: 70000 });
  await assertNoFuture('after step 5 unfolded while scrolled');
  assert((await page.inputValue('[data-testid="rationale"]')) === 'Hold pending relief route check', 'rationale preserved');
  assert((await page.getAttribute('[data-testid="decide-deferred"]', 'aria-pressed')) === 'true', 'choice preserved');
  const st = await page.evaluate(() => document.querySelector('[data-testid="log-scroll"]').scrollTop);
  assert(st === 120, `scroll unchanged (${st})`);
  assert((await page.locator('tr.row').count()) === rowsBefore, 'rows not inserted while scrolled');
  const pill = await page.textContent('[data-testid="new-pill"]');
  assert(/2 new alerts/.test(pill), `pending affordance: ${pill}`);
  await page.click('[data-testid="new-pill"]');
  await sleep(500);
  assert((await page.locator('tr.row').count()) === rowsBefore + 2, 'pending alerts released');
  assert((await page.locator('[data-testid="alert-a5-1"]').count()) === 1, 'FH-01 alert visible');
  await drag('[data-testid="divider-y"]', 0, -260);
  const fh = await valueOf('FH-01:pressure');
  assert(fh > 2.5, `a5-2 says above High 2.5; card shows ${fh}`);
  await shot('situation-peak-1920-light');
});

await step('superseded recommendation: original kept and marked, no decision controls, earlier approval unchanged and flagged', async () => {
  await page.click('[data-testid="alert-a4-2"]');
  await page.waitForSelector('[data-testid="response-detail"][data-alert="a4-2"]');
  await page.waitForSelector('[data-testid="superseded"]');
  const note = await page.textContent('[data-testid="superseded-note"]');
  assert(note.includes('FH-01 flare header damaged'), `note links the superseding alert: ${note}`);
  assert((await page.textContent('[data-testid="recommendation"]')).includes('via the normal relief route'), 'original text still visible');
  assert((await page.locator('[data-testid="decision-form"]').count()) === 0, 'no decision form');
  assert((await page.locator('[data-testid="decision-recorded"]').count()) === 1, 'recorded decision still shown');
  assert((await page.locator('[data-testid="decision-review-flag"]').count()) === 1, 'decision flagged for review');
  const now = (await store()).alertUser['a4-2'].decision;
  assert(JSON.stringify(now) === JSON.stringify(a42Decision), 'decision unchanged after supersession');
  assert(now.evidenceUsed.some((e) => e.docId === 'proc-depress' && e.revision === '2'), 'revision used preserved');
  await page.click('[data-testid="alert-a3-1"]');
  await page.waitForSelector('[data-testid="superseded"]');
  assert((await page.locator('[data-testid="decision-form"]').count()) === 0 && (await page.locator('[data-testid="no-decision-superseded"]').count()) === 1, 'a3-1 superseded without decision: no controls');
  await page.click('nav button:has-text("Records")');
  await page.waitForSelector('[data-testid="record-current"]');
  const rec = await page.textContent('[data-testid="record-current"]');
  assert(rec.includes('superseded') && rec.includes('after this decision'), 'record shows supersession and decision review note');
  await page.click('nav button:has-text("Situation")');
});

await step('record a decision: evidence revision pinned; field report distinct from decision', async () => {
  await page.click('[data-testid="alert-a5-1"]');
  await page.click('[data-testid="decide-approved"]');
  await page.fill('[data-testid="rationale"]', 'Normal route confirmed unavailable by field and readings');
  await page.click('[data-testid="record-decision"]');
  await page.waitForSelector('[data-testid="decision-recorded"]');
  const s = await store();
  const dec = s.alertUser['a5-1'].decision;
  assert(dec.status === 'approved' && dec.evidenceUsed.some((e) => e.docId === 'proc-depress' && e.revision === '2'), 'decision pinned Rev 2');
  assert((await page.locator('[data-testid="field-report"]').count()) === 0, 'no field report yet');
  await next(); // step 6: scenario field report arrives
  await page.waitForSelector('[data-testid="field-report"]');
  assert((await page.textContent('[data-testid="field-report"]')).includes('Reported'), 'execution reported, not verified');
  assert((await page.locator('[data-testid="decision-review-flag"]').count()) === 1, 'a5-1 decision flagged after a6-1 superseded it');
  assert((await stateOf('a6-2')) === 'Recovered', `recovery row state: ${await stateOf('a6-2')}`);
  const fh = await valueOf('FH-01:pressure');
  assert(fh < 2.5, `a6-2 says back below High 2.5; card shows ${fh}`);
});

await step('step 7: revision change keeps the revision the decision used', async () => {
  await next();
  await page.waitForSelector('[data-testid="alert-a7-1"]');
  assert((await page.locator('[data-testid="alert-a4-2"]').textContent()).includes('Cleared'), 'a4-2 cleared by a7-1');
  assert((await stateOf('a7-1')) === 'Recovered' && (await stateOf('a7-2')) === 'Reported' && (await stateOf('a7-3')) === 'Active', `states: ${await stateOf('a7-1')} / ${await stateOf('a7-2')} / ${await stateOf('a7-3')}`);
  const p = await valueOf('D-0001:pressure');
  assert(p < 18.0, `a7-1 says below High 18.0; card shows ${p}`);
  const st = await valueOf('DS-029:status');
  assert(st === 0, `a7-3 says standby; card status value ${st}`);
  const badges = await page.locator('[data-testid="ind-D-0001"] .badge').evaluateAll((els) => els.map((e) => e.className));
  assert(badges.length === 1 && badges[0].includes('sev-high'), `D-0001 indicator counts only what needs attention: ${badges.join(',')}`);
  await page.click('[data-testid="alert-a5-1"]');
  await page.click('[data-testid="ev-proc-depress"]');
  await page.waitForSelector('[data-testid="viewer"][data-doc="proc-depress"][data-rev="2"]');
  const head = await page.textContent('[data-testid="viewer"] .viewer-h');
  assert(head.includes('Rev 3 now effective'), `viewer notes newer revision: ${head}`);
  assert(head.includes('Superseded'), 'Rev 2 shown as superseded');
  await page.click('[data-testid="tab-sources"]');
  assert((await page.textContent('[data-testid="sources"]')).includes('Rev 2 used · Rev 3 now effective'), 'sources tab shows pinned revision');
  await page.click('[data-testid="tab-response"]');
  assert((await page.textContent('[data-testid="facil-step"]')).includes('Step 7 of 7'), 'final step');
  await shot('situation-stabilizing-1920-light');
});

await step('timer: consistent across navigation, layout changes and reload', async () => {
  const s0 = await store();
  const h0 = await page.textContent('[data-testid="timer-h"]'), m0 = await page.textContent('[data-testid="timer-m"]');
  assert(+m0 >= 36 || +h0 > 0, `timer advanced to nominal step 7 time (${h0}:${m0})`);
  await page.click('nav button:has-text("Agent Activity")'); await sleep(100);
  await page.click('nav button:has-text("Situation")'); await sleep(100);
  await page.click('[data-window="equipment"] button[title="Maximize window"]'); await sleep(100);
  await page.click('[data-window="equipment"] button[title="Restore layout"]'); await sleep(100);
  await page.reload(); await page.waitForSelector('[data-testid="dock"]');
  const s1 = await store();
  assert(s1.startedAt === s0.startedAt, 'start time unchanged');
  assert(s1.revealedAt.length === 7, 'scenario step persisted');
  const expectedM = Math.floor((Date.now() - s1.startedAt) / 60000) % 60;
  const m1 = +(await page.textContent('[data-testid="timer-m"]'));
  assert(Math.abs(m1 - expectedM) <= 1, `timer matches start time (${m1} vs ${expectedM})`);
  assert((await page.locator('[data-window="document"]').count()) === 1 && (await store()).selectedAlertId === 'a5-1', 'layout and selection persisted across reload');
});

await step('agent activity: task -> step -> operation -> logs; link opens the alert', async () => {
  await page.click('nav button:has-text("Agent Activity")');
  await page.waitForSelector('[data-testid="page-activity"]');
  await page.click('[data-testid="task-t4-2"]');
  await page.click('[data-testid="op-o"]');
  await page.waitForSelector('[data-testid="op-logs"]');
  const logs = await page.textContent('[data-testid="op-logs"]');
  assert(logs.includes('retry 3/3'), 'retry logs visible');
  assert((await page.textContent('[data-testid="page-activity"]')).includes('ecc-agent 0.9.3'), 'config version shown');
  await shot('activity');
  await page.click('[data-testid="page-activity"] .ev:has-text("Signal lost")');
  await page.waitForSelector('[data-testid="response-detail"][data-alert="a4-3"]');
});

await step('knowledge: two revisions listed; shared viewer opens', async () => {
  await page.click('nav button:has-text("Knowledge")');
  await page.waitForSelector('[data-testid="page-knowledge"]');
  await page.fill('[data-testid="knowledge-search"]', 'depressurization');
  await page.click('[data-testid="doc-proc-depress"]');
  await page.waitForSelector('[data-testid="rev-switch"]');
  const sw = await page.textContent('[data-testid="rev-switch"]');
  assert(sw.includes('Rev 2 · superseded') && sw.includes('Rev 3 · effective'), `revisions: ${sw}`);
  await page.waitForSelector('[data-testid="page-knowledge"] [data-testid="viewer"][data-rendered="true"]', { timeout: 15000 });
  await shot('knowledge');
});

await step('sitrep: draft -> review -> approve -> export', async () => {
  await page.click('nav button:has-text("SITREP")');
  await page.waitForSelector('[data-testid="page-sitrep"]');
  await page.click('[data-testid="sitrep-review"]');
  await page.waitForSelector('[data-testid="sitrep-field-situation"]');
  await page.fill('[data-testid="sitrep-field-next"]', 'Next update in 30 minutes.');
  await page.click('[data-testid="sitrep-approve"]');
  await page.waitForSelector('[data-testid="sitrep-export"]');
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-testid="sitrep-export"]')]);
  assert((await dl.suggestedFilename()).endsWith('.md'), 'markdown export');
  await shot('sitrep');
});

await step('records: current record accumulates decisions; history distinguishes real vs training', async () => {
  await page.click('nav button:has-text("Records")');
  await page.waitForSelector('[data-testid="record-current"]');
  const t = await page.textContent('[data-testid="record-current"]');
  assert(t.includes('Approved: Hold depressurization via FH-01') && t.includes('ECC-FX-002 Rev 2'), 'decision with pinned evidence in record');
  assert(t.includes('SITREP 1 approved'), 'sitrep in record');
  await page.click('[data-testid="records-history"]');
  await page.fill('[data-testid="history-search"]', 'training');
  assert((await page.locator('[data-testid^="hist-"]').count()) === 2, 'two training records found by search');
  await page.click('[data-testid="hist-h-2026-03"]');
  assert((await page.locator('.pane-h .chip.mode-training').count()) >= 1, 'training chip');
  await page.fill('[data-testid="history-search"]', '');
  await page.click('[data-testid="hist-h-2025-11"]');
  assert((await page.locator('.pane-h .chip.mode-real').count()) >= 1, 'real incident chip');
  await shot('records-history');
});

await step('themes: dark and light', async () => {
  await page.click('nav button:has-text("Situation")');
  await page.click('button[title="Switch to dark theme"]');
  assert((await page.evaluate(() => document.documentElement.dataset.theme)) === 'dark', 'dark applied');
  const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  assert(bg !== 'rgb(236, 239, 244)', 'background changed');
  await shot('situation-stabilizing-1920-dark');
  await page.click('button[title="Switch to light theme"]');
  assert((await page.evaluate(() => document.documentElement.dataset.theme)) === 'light', 'light restored');
});

await step('focus mode when the viewport cannot fit both sides', async () => {
  await page.setViewportSize({ width: 900, height: 700 });
  await sleep(200);
  assert((await page.getAttribute('[data-testid="dock"]', 'data-focus')) === 'monitoring', 'focus mode on');
  await page.click('.focusbar button:has-text("Response")');
  assert((await page.locator('[data-window="response"]').count()) === 1 && (await page.locator('[data-window="equipment"]').count()) === 0, 'response focused');
  await shot('focus-mode-900');
  await page.setViewportSize({ width: 1920, height: 1080 });
  await sleep(200);
  assert((await page.getAttribute('[data-testid="dock"]', 'data-focus')) === '', 'focus mode off');
});

// ---------- screenshots at other sizes / stages ----------
await step('screenshots at 1440x900 and 1180x760, light and dark, early / peak / stabilizing', async () => {
  const sizes = [[1920, 1080], [1440, 900], [1180, 760]];
  // stabilizing (current step 7)
  for (const [w, h] of sizes) {
    await page.setViewportSize({ width: w, height: h }); await sleep(250);
    await shot(`stabilizing-${w}-light`);
    await page.click('button[title="Switch to dark theme"]'); await sleep(150);
    await shot(`stabilizing-${w}-dark`);
    await page.click('button[title="Switch to light theme"]');
  }
  // peak crisis (step 5) and early (step 2) by stepping back
  await page.click('[data-testid="facil-prev"]'); await page.click('[data-testid="facil-prev"]'); await sleep(200);
  await page.click('[data-testid="alert-a5-1"]');
  for (const [w, h] of sizes) {
    await page.setViewportSize({ width: w, height: h }); await sleep(250);
    await shot(`peak-${w}-light`);
    await page.click('button[title="Switch to dark theme"]'); await sleep(150);
    await shot(`peak-${w}-dark`);
    await page.click('button[title="Switch to light theme"]');
  }
  for (let i = 0; i < 3; i++) await page.click('[data-testid="facil-prev"]');
  await sleep(200);
  await page.click('[data-testid="alert-a2-1"]');
  for (const [w, h] of sizes) {
    await page.setViewportSize({ width: w, height: h }); await sleep(250);
    await shot(`early-${w}-light`);
    await page.click('button[title="Switch to dark theme"]'); await sleep(150);
    await shot(`early-${w}-dark`);
    await page.click('button[title="Switch to light theme"]');
  }
  await page.setViewportSize({ width: 1920, height: 1080 });
});

await step('fresh-state screenshots: peak and stabilizing at 1920 and 1440, light and dark', async () => {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const p2 = await ctx.newPage();
  p2.on('console', (m) => { if (m.type() === 'error') consoleErrors.push(m.text()); });
  p2.on('pageerror', (e) => consoleErrors.push(`pageerror: ${e.message}`));
  await p2.goto(URL); await p2.evaluate(() => localStorage.clear()); await p2.reload(); await p2.waitForSelector('[data-testid="dock"]');
  const adv = async () => { await p2.click('[data-testid="facil-next"]'); await sleep(200); };
  const shots = async (stage) => {
    for (const w of [1920, 1440]) {
      await p2.setViewportSize({ width: w, height: w === 1920 ? 1080 : 900 }); await sleep(300);
      await p2.screenshot({ path: `${SHOTS}/fresh-${stage}-${w}-light.png` });
      await p2.click('button[title="Switch to dark theme"]'); await sleep(200);
      await p2.screenshot({ path: `${SHOTS}/fresh-${stage}-${w}-dark.png` });
      await p2.click('button[title="Switch to light theme"]'); await sleep(100);
    }
  };
  for (let i = 0; i < 4; i++) await adv(); // step 5
  await p2.waitForSelector('[data-testid="alert-a5-2"]', { timeout: 70000 });
  await p2.click('[data-testid="alert-a5-1"]');
  await p2.click('[data-testid="ev-proc-depress"]');
  await p2.waitForSelector('[data-testid="viewer"][data-doc="proc-depress"][data-rendered="true"] [data-testid="exact-match"]', { timeout: 15000 });
  await shots('peak');
  await adv(); await adv(); // step 7
  await p2.waitForSelector('[data-testid="alert-a7-3"]', { timeout: 70000 });
  await p2.click('[data-testid="alert-a7-1"]');
  await p2.waitForSelector('[data-testid="response-detail"][data-alert="a7-1"]');
  await shots('stabilizing');
  await ctx.close();
});

await step('no console errors or uncaught page errors', async () => {
  assert(consoleErrors.length === 0, `errors: ${consoleErrors.join(' | ')}`);
});

await browser.close();
if (server) server.kill();
console.log(`\n${results.length - failures}/${results.length} checks passed. Screenshots in ${SHOTS}`);
process.exit(failures ? 1 : 0);
