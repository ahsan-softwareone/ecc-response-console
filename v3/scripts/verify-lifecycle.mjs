// Focused checks for the incident lifecycle, agent controls, saving, history and window management.
// Usage: node scripts/verify-lifecycle.mjs [--only=a,b,...]   Needs the dev server on 5189.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { resolve } from 'node:path';

const URL = 'http://localhost:5189/';
const OUT = process.env.SHOTS_DIR ?? '/tmp/ecc-lifecycle';
await mkdir(OUT, { recursive: true });
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) ?? '').slice(7).split(',').filter(Boolean);
const want = (s) => !ONLY.length || ONLY.includes(s);
if (process.platform === 'darwin') spawn('caffeinate', ['-i', '-w', String(process.pid)], { stdio: 'ignore', detached: true }).unref();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const assert = (c, m) => { if (!c) throw new Error(`assertion failed: ${m}`); };
let pass = 0, fail = 0;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];

async function fresh({ w = 1440, h = 900, reducedMotion } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, acceptDownloads: true, reducedMotion });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('favicon')) errors.push(m.text()); });
  page.on('dialog', (d) => d.accept());
  await page.goto(URL); await page.waitForSelector('[data-testid="no-incident"]');
  return page;
}
const T = (id) => `[data-testid="${id}"]`;
const state = (p) => p.evaluate(() => { const s = window.__ecc.store.getState(); return { id: s.incidentId, mode: s.incidentMode, dialog: s.dialog, nav: s.nav, hidden: s.hiddenPanels, rec: s.records[s.incidentId] ?? null, records: s.records, save: s.save }; });
const stored = (p, id) => p.evaluate((rid) => new Promise((res, rej) => { const q = indexedDB.open('ecc-v3'); q.onerror = () => rej(q.error); q.onsuccess = () => { const g = q.result.transaction('incidents').objectStore('incidents').get(rid); g.onsuccess = () => res(g.result ?? null); g.onerror = () => rej(g.error); }; }), id);
const agentState = (p) => p.getAttribute(T('agent-status'), 'data-state');
const startTraining = async (p) => { await p.click(T('start-training')); await p.click(T('start-submit')); await p.waitForSelector(T('dock')); };
const openAgent = async (p) => { await p.click(T('agent-status')); await p.waitForSelector(T('agent-summary')); };
const download = async (p, trigger) => { const [d] = await Promise.all([p.waitForEvent('download'), trigger()]); const f = resolve(OUT, await d.suggestedFilename()); await d.saveAs(f); return f; };
const next = async (p, n = 1) => { for (let i = 0; i < n; i++) { await p.click(T('facil-next')); await sleep(120); } };
async function step(name, fn) {
  if (!want(name.split(':')[0])) return;
  try { await fn(); pass++; console.log('PASS', name); } catch (e) { fail++; console.log('FAIL', name, '-', String(e.message ?? e).split('\n')[0]); }
}

await step('a: create incident, saved before anything else; reload recovers the same record; times stay distinct', async () => {
  const p = await fresh();
  assert((await p.textContent(T('agent-label'))) === 'Agent inactive', 'inactive with no incident');
  assert((await p.getAttribute(T('agent-status'), 'data-busy')) === 'false', 'no reassuring activity with no incident');
  for (const id of ['start-incident', 'start-training', 'browse-history']) assert(await p.locator(T(id)).count() === 1, id);
  await p.click(T('start-incident'));
  assert(await p.locator(`${T('start-submit')}:disabled`).count() === 1, 'title and notification required');
  await p.fill(T('start-title'), 'Hydrocarbon odour near separator');
  await p.fill(T('start-notification'), 'Operator reports odour near D-0001.');
  await p.click(T('start-eq-D-0001'));
  await p.fill(T('start-location'), 'Inlet area');
  const early = await p.evaluate(() => { const d = new Date(Date.now() - 600000); const z = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`; });
  await p.fill(T('start-occurred'), early);
  await p.click(T('start-submit')); await p.waitForSelector(T('dock'));
  const s = await state(p);
  assert(s.mode === 'real' && s.rec.status === 'active', 'real, active');
  const disk = await stored(p, s.id);
  assert(disk && disk.title === 'Hydrocarbon odour near separator' && disk.events.some((e) => e.id === 'notification'), 'on disk with its notification');
  assert(s.rec.occurredAt < s.rec.createdAt && s.rec.createdAt <= s.rec.agentRuns[0].startedAt, `occurred < created <= agent start (${s.rec.occurredAt}, ${s.rec.createdAt}, ${s.rec.agentRuns[0].startedAt})`);
  assert(/Saved/.test(await p.textContent(T('save-indicator'))), 'save indicator');
  await p.click(T('incident-identity'));
  const [o, c, a] = await Promise.all(['time-occurred', 'time-created', 'time-agent'].map((x) => p.textContent(T(x))));
  assert(o !== c && !a.includes('Not started'), `three times shown (${o} | ${c} | ${a})`);
  await p.keyboard.press('Escape');
  await sleep(14000);
  const t = await p.textContent('body');
  assert(!/drone|D-0029 ·/i.test(t.replace(/SG GSP drone/g, '')), 'no scenario content in a real incident');
  await p.reload(); await p.waitForSelector(T('dock')); await sleep(600);
  const s2 = await state(p);
  assert(s2.id === s.id && s2.rec.createdAt === s.rec.createdAt && s2.rec.title === s.rec.title, 'same record after reload');
  assert((await agentState(p)) === 'running', 'run continues after reload');
  await p.context().close();
});

await step('a: notification never replaces an open incident; a second start needs an explicit choice', async () => {
  const p = await fresh();
  await p.click(T('facil-simulate')); await p.click(T('sim-notification'));
  await p.waitForSelector(T('incoming-notification'));
  await startTraining(p);
  const first = (await state(p)).id;
  assert(await p.locator(T('incoming-notification')).count() === 1, 'still waiting, not consumed');
  await p.click(T('incoming-review')); await p.waitForSelector(T('start-conflict'));
  assert(await p.locator(`${T('start-submit')}:disabled`).count() === 1, 'choice required');
  await p.keyboard.press('Escape'); await sleep(100);
  assert((await state(p)).id === first && !(await state(p)).dialog, 'dismissing changes nothing');
  await p.click(T('incoming-add')); await sleep(300);
  const r = (await state(p)).rec;
  assert(r.id === first && r.events.some((e) => e.title.startsWith('Further notification')), 'added to the current record');
  assert(await p.locator(T('incoming-notification')).count() === 0, 'handled');
  await p.click(T('facil-simulate')); await p.click(T('sim-notification')); await p.keyboard.press('Escape');
  await p.click(T('incoming-review')); await p.waitForSelector(T('start-setaside'));
  await p.check(T('start-setaside')); await p.click(T('start-submit')); await sleep(500);
  const s = await state(p);
  assert(s.id !== first && s.mode === 'real', 'new incident current');
  const old = s.records[first];
  assert(old.status === 'left-open' && old.events.length > 0 && old.sim, 'old record kept with its state');
  assert((await stored(p, first)).status === 'left-open', 'set aside on disk');
  await p.context().close();
});

await step('b: start, pause, resume, stop, start again with audit entries and no duplicate outputs; sources keep moving while paused', async () => {
  const p = await fresh();
  await startTraining(p);
  assert((await agentState(p)) === 'running' && (await p.textContent(T('agent-label'))) === 'Agent live', 'running');
  await next(p, 1); await p.waitForSelector(T('alert-a2-2'), { timeout: 45000 });
  await openAgent(p); await p.fill(T('agent-reason'), 'Facilitator check'); await p.click(T('agent-pause')); await p.waitForSelector(`${T('agent-status')}[data-state="paused"]`);
  assert((await p.textContent(T('agent-label'))) === 'Agent paused', 'paused label');
  assert((await p.getAttribute(T('agent-status'), 'data-busy')) === 'false', 'no activity animation while paused');
  await p.waitForSelector(T('agent-notice'));
  assert(/suspended since/.test(await p.textContent(T('agent-notice'))), 'compact notice');
  const before = await p.getAttribute('[data-testid="watcher-D-0001:pressure"]', 'data-value');
  await next(p, 1);
  await sleep(33000);
  const after = await p.getAttribute('[data-testid="watcher-D-0001:pressure"]', 'data-value');
  assert(before !== after, `source readings moved while paused (${before} -> ${after})`);
  assert(await p.locator(T('alert-a3-1')).count() === 0, 'agent output not published while paused');
  assert(await p.locator('[data-testid^="alert-a3"]').count() === 0, 'no step 3 alerts while paused');
  await openAgent(p);
  assert(/\d+ update/.test(await p.textContent(T('agent-held'))), 'held updates counted');
  await p.click(T('agent-resume')); await p.waitForSelector(T('resume-notice'));
  await p.waitForSelector(T('alert-a3-1'), { timeout: 3000 });
  assert(await p.locator(T('late-a3-1')).count() === 1, 'late analysis shown on the alert');
  await p.click(T('resume-more'));
  assert(/pressure|D-0001/i.test(await p.textContent(T('resume-items'))), 'account of what arrived');
  let r = (await state(p)).rec;
  const paused = r.events.find((e) => e.kind === 'agent-control' && e.title.startsWith('Agent paused'));
  const resumed = r.events.find((e) => e.kind === 'agent-control' && e.title.startsWith('Agent resumed'));
  assert(paused?.by && /Facilitator check/.test(paused.detail ?? '') && resumed?.by && /Received during/.test(resumed.detail ?? ''), 'audit entries with actor, time and reason');
  // Stop explains first and needs a reason.
  await openAgent(p); await p.click(T('agent-stop')); await p.waitForSelector(T('stop-dialog'));
  assert(/does not close it/.test(await p.textContent(T('stop-dialog'))), 'consequence explained');
  assert(await p.locator(`${T('stop-confirm')}:disabled`).count() === 1, 'reason required');
  await p.fill(T('stop-reason'), 'Testing stop'); await p.click(T('stop-confirm')); await p.waitForSelector(`${T('agent-status')}[data-state="stopped"]`);
  assert((await state(p)).rec.status === 'active', 'stopping the agent does not close the incident');
  r = (await state(p)).rec; const ids1 = r.events.map((e) => e.id);
  await next(p, 1); await sleep(26000);
  assert(await p.locator('[data-testid^="alert-a4"]').count() === 0, 'nothing new published while stopped');
  await openAgent(p); await p.click(T('agent-start-again')); await p.waitForSelector(`${T('agent-status')}[data-state="running"]`);
  await sleep(2500);
  r = (await state(p)).rec;
  assert(r.agentRuns.length === 2 && r.agentRuns[0].status === 'stopped' && r.agentRuns[1].number === 2, 'second recorded run, first retained');
  const ids = r.events.map((e) => e.id);
  assert(new Set(ids).size === ids.length, 'no duplicate published outputs');
  assert(ids1.every((x) => ids.includes(x)), 'earlier outputs retained');
  assert(await p.locator('[data-testid^="alert-a4"]').count() > 0, 'new run catches up');
  const a2 = r.events.filter((e) => e.kind === 'agent' && e.meta?.agentRun === 2);
  assert(a2.length > 0 && r.events.filter((e) => e.kind === 'agent' && e.meta?.agentRun === 1).length > 0, 'outputs attribute to the run that produced them');
  assert(new Set(r.events.filter((e) => e.kind === 'agent').map((e) => e.taskId)).size === r.events.filter((e) => e.kind === 'agent').length, 'each task published once');
  await p.context().close();
});

await step('c: indicator follows processing, waiting, source loss, error and failed save; closing Agent Log does not stop it', async () => {
  const p = await fresh();
  await startTraining(p);
  // Processing then waiting, from actual task timing.
  let sawBusy = false, activity = '', sawWait = false;
  for (let i = 0; i < 70 && !(sawBusy && sawWait); i++) {
    const busy = await p.getAttribute(T('agent-status'), 'data-busy');
    const act = await p.locator(T('agent-activity')).textContent().catch(() => '');
    if (busy === 'true') { sawBusy = true; activity = act; assert(act !== 'Monitoring · awaiting updates', 'busy shows the task'); }
    if (sawBusy && busy === 'false' && act === 'Monitoring · awaiting updates') sawWait = true;
    await sleep(500);
  }
  assert(sawBusy && sawWait, `saw processing "${activity}" then waiting`);
  // Agent Log panel hidden: agent state unaffected.
  await p.click(T('nav-agentlog')); await p.click(T('hide-agentlog-a')); await p.click(T('hide-agentlog-b')); await p.waitForSelector(T('panels-recovery'));
  assert((await agentState(p)) === 'running', 'hiding Agent Log panels does not stop the agent');
  await p.click(T('recovery-reset')); await p.click(T('nav-situation'));
  // Source loss is reported separately from agent state.
  await next(p, 3); await p.waitForSelector(T('alert-a4-3'), { timeout: 45000 }); await sleep(2500);
  assert(+(await p.getAttribute(T('agent-status'), 'data-concerns')) >= 1 && (await p.textContent(T('agent-label'))) === 'Agent live', 'live with a separate source concern');
  await openAgent(p); assert(/signal lost/.test(await p.textContent(T('agent-sources'))), 'source loss named'); assert(/says nothing about/.test(await p.textContent(T('agent-summary'))), 'not a safety claim'); await p.keyboard.press('Escape');
  // A failed save takes the reassuring dot away.
  await p.click(T('facil-simulate')); await p.click(T('sim-save-fail')); await p.keyboard.press('Escape');
  await p.click(T('nav-sitrep')); await p.click(T('side-status')); await p.fill(T('observation-text'), 'Test observation'); await p.click(T('observation-save'));
  await p.waitForSelector(`${T('save-indicator')}[data-state="failed"]`);
  assert((await p.textContent(T('agent-label'))) === 'Agent needs attention' && (await p.getAttribute(T('agent-status'), 'data-attention')) === 'true', 'attention while saves fail');
  await p.click(T('facil-simulate')); await p.click(T('sim-save-fail')); await p.keyboard.press('Escape');
  await p.click(T('save-retry')); await p.waitForSelector(`${T('save-indicator')}[data-state="saved"]`);
  assert((await stored(p, (await state(p)).id)).events.some((e) => e.title === 'Test observation'), 'retry saved the work');
  // Simulated error.
  await p.click(T('facil-simulate')); await p.click(T('sim-agent-error')); await p.waitForSelector(`${T('agent-status')}[data-attention="true"]`);
  assert((await agentState(p)) === 'error' && (await p.textContent(T('agent-label'))) === 'Agent needs attention', 'error state');
  await openAgent(p); assert(await p.locator(T('agent-start-again')).count() === 1, 'start again offered'); await p.keyboard.press('Escape');
  // Reduced motion.
  const rm = await fresh({ reducedMotion: 'reduce' });
  await startTraining(rm); await rm.waitForSelector(`${T('agent-status')}[data-busy="true"]`, { timeout: 30000 });
  assert((await rm.locator('.agent-dot').evaluate((e) => getComputedStyle(e).animationName)) === 'none', 'no animation under reduced motion');
  await rm.context().close();
  await p.context().close();
});

await step('d: resolve, return to active, close with failed save then retry; history; export; import', async () => {
  const p = await fresh();
  await startTraining(p);
  await next(p, 1); await p.waitForSelector(T('alert-a2-1'), { timeout: 45000 });
  // Falling readings alone never resolve.
  assert((await state(p)).rec.status === 'active', 'active');
  await p.click(T('lifecycle-resolve')); await p.waitForSelector(T('resolve-dialog'));
  assert(await p.locator(`${T('resolve-submit')}:disabled`).count() === 1, 'summary and rationale required');
  assert(/Fire at D-0029/.test(await p.textContent(T('resolve-unresolved'))), 'unresolved alerts listed');
  await p.fill(T('resolve-summary'), 'Fire reported out'); await p.keyboard.press('Escape'); await sleep(100);
  await p.click(T('lifecycle-resolve'));
  assert((await p.inputValue(T('resolve-summary'))) === 'Fire reported out', 'Escape kept what was typed');
  await p.fill(T('resolve-rationale'), 'Field report and falling pressure');
  await p.fill(T('resolve-risks'), 'Residual heat'); await p.fill(T('resolve-follow'), 'Inspect D-0029');
  await p.click(T('resolve-submit')); await p.waitForSelector(`${T('statusbar')}[data-lifecycle="resolved"]`);
  await p.click(T('incident-identity')); await p.click(T('lifecycle-return-active')); await p.waitForSelector(T('return-active-dialog'));
  await p.fill(T('reason-text'), 'Re-ignition reported'); await p.click(T('reason-submit')); await p.waitForSelector(`${T('statusbar')}[data-lifecycle="active"]`);
  let r = (await state(p)).rec;
  assert(r.resolutionHistory?.length === 1 && r.events.some((e) => e.kind === 'lifecycle' && e.detail === 'Re-ignition reported' && e.by), 'return to Active recorded with who, when, why');
  await p.click(T('lifecycle-resolve'));
  await p.fill(T('resolve-summary'), 'Fire out, verified by the team'); await p.fill(T('resolve-rationale'), 'Second report');
  await p.click(T('resolve-submit')); await p.waitForSelector(`${T('statusbar')}[data-lifecycle="resolved"]`);
  const id = (await state(p)).id;
  await p.click(T('lifecycle-close')); await p.waitForSelector(T('close-dialog'));
  assert(/draft|No SITREP/i.test(await p.textContent(T('close-sitrep-state'))), 'SITREP state stated');
  assert(/Site-wide systems are not affected/.test(await p.textContent(T('close-agent-effect'))), 'agent effect stated');
  await p.fill(T('close-rationale'), 'Emergency over; record final');
  await p.check(T('close-reviewed'));
  // Failed save: no false closure.
  await p.evaluate(() => window.__ecc.store.getState().setSimulateSaveFailure(true));
  await p.click(T('close-save')); await p.waitForSelector(T('dialog-error'));
  r = (await state(p)).rec;
  assert(r.status === 'resolved' && !r.closure && (await state(p)).id === id, 'not closed in the application');
  assert((await stored(p, id)).status === 'resolved', 'not closed on disk');
  assert(await p.locator(T('close-dialog')).count() === 1 && await p.locator(T('closed-dialog')).count() === 0, 'no success shown');
  const emergency = await download(p, () => p.click(T('close-export')));
  assert(JSON.parse(await readFile(emergency, 'utf8')).records[0].id === id, 'export available while failing');
  await p.evaluate(() => window.__ecc.store.getState().setSimulateSaveFailure(false));
  await p.click(T('close-save')); await p.waitForSelector(T('closed-dialog'));
  r = (await state(p)).rec;
  assert(r.status === 'closed' && r.closure && (await stored(p, id)).status === 'closed', 'closed after a successful retry');
  assert(r.id === id && Object.values((await state(p)).records).filter((x) => x.title === r.title && x.status === 'closed').length === 1, 'same identity, no duplicate');
  assert(/not approved/.test(await p.textContent(T('closed-sitrep'))), 'draft SITREP not called approved');
  assert(r.agentRuns.at(-1).status === 'completed' && r.agentRuns.at(-1).endedAt, 'final run status preserved');
  assert((await agentState(p)) === 'stopped', 'agent no longer running');
  const count = r.events.length; await sleep(2500);
  assert((await state(p)).rec.events.length === count, 'no further entries after closure');
  const file = await download(p, () => p.click(T('closed-export')));
  assert(/uploaded original/.test(await p.textContent(T('export-contents'))), 'export states what is included');
  const j = JSON.parse(await readFile(file, 'utf8'));
  assert(j.records[0].events.length === count && j.contents.byReference.length > 0, 'export has the record and states fixtures are by reference');
  await p.click(T('closed-return')); await p.waitForSelector(T('no-incident'));
  assert((await state(p)).id === '', 'workspace empty');
  // History.
  await p.click(T('browse-history')); await p.waitForSelector(T(`inc-${id}`));
  await p.click(T(`inc-${id}`));
  assert(/Fire out, verified/.test(await p.textContent(T('incident-resolution'))), 'resolution in the record');
  assert(await p.locator('[data-testid="incident-timeline"] [data-testid="timeline-row"]').count() > 5, 'complete progression');
  await p.selectOption(T('incident-status'), 'closed'); await p.selectOption(T('incident-equipment'), 'D-0029');
  assert(await p.locator(T(`inc-${id}`)).count() === 1, 'found by status and equipment');
  await p.selectOption(T('incident-equipment'), 'P-2100').catch(() => {});
  await p.selectOption(T('incident-equipment'), ''); await p.selectOption(T('incident-type'), 'Security');
  assert(await p.locator(T(`inc-${id}`)).count() === 1, 'found by type');
  await p.selectOption(T('incident-type'), 'Fire'); assert(await p.locator(T(`inc-${id}`)).count() === 0, 'excluded by another type'); await p.selectOption(T('incident-type'), '');
  const today = await p.evaluate(() => new Date().toISOString().slice(0, 10));
  await p.fill(T('incident-to'), '2000-01-01'); assert(await p.locator(T(`inc-${id}`)).count() === 0, 'date filter excludes'); await p.fill(T('incident-to'), ''); void today;
  // Addendum, closed record read-only.
  const before = (await state(p)).records[id];
  await p.fill(T('addendum-text'), 'Later note: inspection booked'); await p.click(T('addendum-save')); await sleep(300);
  const after = (await state(p)).records[id];
  assert(after.closure.rationale === before.closure.rationale && after.events.length === before.events.length + 1 && after.events.at(-1).meta.addendum, 'addendum appended, closure untouched');
  assert(await p.locator(`[data-testid="incident-timeline"] ${T('correct-btn')}`).count() === 0, 'no direct correction of a closed record');
  // Import: invalid, duplicate, copy.
  const set = (name, text) => p.setInputFiles(`[data-testid="page-knowledge"] ${T('import-file')}`, { name, mimeType: 'application/json', buffer: Buffer.from(text) });
  await set('bad.json', 'not json'); await p.waitForSelector(T('import-errors')); assert(/not valid JSON/.test(await p.textContent(T('import-errors'))), 'malformed rejected');
  await set('wrong.json', JSON.stringify({ backupSchema: 'ecc-backup/1', records: [{ id: 'X', schema: 'ecc-incident/1', title: 't', site: 's', mode: 'real', startedAt: 'yesterday', status: 'closed', events: [{ id: 1 }], equipment: [], reportVersions: [], lessons: [], references: [] }] }));
  await p.waitForSelector(T('import-errors')); assert(/start time/.test(await p.textContent(T('import-errors'))), 'invalid record rejected with a reason');
  const n0 = Object.keys((await state(p)).records).length;
  await p.setInputFiles(`[data-testid="page-knowledge"] ${T('import-file')}`, file); await p.waitForSelector(T('import-dups'));
  assert((await p.textContent(T('import-dups'))).includes(id), 'duplicate named');
  await p.click(T('import-as-copy')); await p.waitForSelector(T('import-result')); await sleep(100);
  const s3 = await state(p);
  assert(Object.keys(s3.records).length === n0 + 1 && s3.records[`${id}-COPY`]?.importedFrom === id && s3.records[id].events.length === after.events.length, 'copy added, original untouched');
  // Import into a clean browser keeps everything.
  const q = await fresh();
  await q.click(T('browse-history')); await q.setInputFiles(`[data-testid="page-knowledge"] ${T('import-file')}`, file); await q.waitForSelector(T('import-confirm')); await q.click(T('import-confirm')); await q.waitForSelector(T(`inc-${id}`));
  assert((await stored(q, id))?.events.length === count, 'restored in full');
  await q.context().close();
  // Reopen retains closure history.
  await p.click(T(`inc-${id}`)); await p.click(T('history-reopen')); await p.fill(T('reason-text'), 'New information'); await p.click(T('reason-submit')); await p.waitForSelector(T('dock'));
  const s4 = await state(p);
  assert(s4.id === id && s4.rec.status === 'active' && s4.rec.closureHistory?.length === 1 && !s4.rec.closure && s4.rec.events.some((e) => e.title === 'Incident reopened' && e.by), 'reopen recorded, closure kept');
  assert(s4.mode === 'training' && (await agentState(p)) === 'stopped', 'scenario state restored; agent not silently restarted');
  await p.context().close();
});

await step('e: historical reference stays separate from a new incident', async () => {
  const p = await fresh();
  await p.click(T('browse-history'));
  const seed = await p.evaluate(() => Object.values(window.__ecc.store.getState().records).find((r) => r.provenance === 'seed' && r.events.some((e) => e.kind === 'decision'))?.id);
  assert(seed, 'a seeded record with decisions exists');
  await p.click(T(`inc-${seed}`));
  assert(/precedent, not applicable protocol/.test(await p.textContent(T('history-actions'))), 'precedent stated');
  await p.click(T('history-start-new')); await p.waitForSelector(T('based-on-note'));
  await p.fill(T('start-title'), 'Similar event today'); await p.fill(T('start-notification'), 'Reported now'); await p.click(T('start-submit')); await p.waitForSelector(T('dock')); await sleep(1500);
  const s = await state(p);
  assert(s.id !== seed && s.rec.basedOn.id === seed, 'fresh identity with a pointer');
  for (const k of ['decision', 'measurement', 'report', 'recommendation']) if (k !== 'measurement') assert(!s.rec.events.some((e) => e.kind === k), `no ${k} copied`);
  assert(s.rec.events.every((e) => e.t >= s.rec.startedAt), 'no old timestamps in the new record');
  assert(s.records[seed].events.length > 0 && s.records[seed].status === 'closed', 'historical record untouched');
  // Linking from an open incident.
  await p.click(T('nav-knowledge')); await p.click(T('kv-incidents')); await p.click(T(`inc-${seed}`)); await p.click(T('history-link')); await sleep(300);
  const r = (await state(p)).rec;
  assert(r.linkedIncidents?.[0]?.id === seed && r.events.some((e) => e.kind === 'reference' && e.meta?.linkedIncident === seed), 'linked as reference, recorded');
  await p.context().close();
});

await step('f: hide, reopen, maximize, restore and reset keep forms, selection and filters; status stays reachable; Escape closes one layer', async () => {
  const p = await fresh();
  await startTraining(p);
  await next(p, 3); await p.waitForSelector(T('alert-a4-2'), { timeout: 45000 });
  await p.click(T('alert-a4-2')); await p.click(T('decide-approved')); await p.fill(T('rationale'), 'HALF TYPED');
  await p.click(T('sev-critical')).catch(() => {});
  await p.fill(T('filter-search'), 'D-0');
  const q = await p.inputValue(T('filter-search'));
  // Maximize keeps the shell.
  await p.click(T('max-win-log'));
  for (const id of ['nav', 'statusbar', 'agent-status', 'incident-identity', 'windows-open', 'assistant-toggle']) assert(await p.locator(T(id)).isVisible(), `${id} visible while maximized`);
  assert((await p.locator(T('statusbar')).boundingBox()).y === 56, 'status bar under the header');
  assert(await p.locator('[data-window="log"] button[title="Restore layout"]').isVisible(), 'visible restore');
  const box = await p.locator('[data-window="log"]').boundingBox();
  assert(box.y >= 96 && box.height > 500, `fills the workspace below the status (${box.y}, ${box.height})`);
  assert(await p.evaluate(() => !document.fullscreenElement), 'no browser fullscreen');
  await p.click('[data-window="log"] button[title="Restore layout"]');
  assert((await p.inputValue(T('rationale'))) === 'HALF TYPED', 'decision text survives maximize');
  // Hide and reopen.
  await p.click(T('hide-win-response'));
  assert(!(await p.locator('[data-window="response"]').isVisible()), 'hidden');
  assert(await p.getAttribute(T('hide-win-log'), 'title') === 'Hide panel', 'tooltip');
  await p.click(T('windows-open'));
  assert((await p.getAttribute(T('win-situation.response'), 'data-hidden')) === 'true', 'listed as hidden');
  await p.click(T('win-situation.response')); await p.waitForSelector('[data-window="response"]');
  assert((await p.inputValue(T('rationale'))) === 'HALF TYPED', 'decision text survives hide');
  assert((await p.inputValue(T('filter-search'))) === q, 'filter survives');
  assert((await p.evaluate(() => window.__ecc.store.getState().selectedAlertId)) === 'a4-2', 'selection survives');
  // All hidden.
  for (const id of ['hide-win-equipment', 'hide-win-log', 'hide-win-response']) await p.click(T(id));
  await p.waitForSelector(T('panels-recovery'));
  await p.click(T('recovery-reset')); await p.waitForSelector('[data-window="equipment"]');
  assert((await p.inputValue(T('rationale'))) === 'HALF TYPED', 'decision text survives reset');
  assert(Object.keys((await state(p)).hidden).length === 0, 'reset clears hidden');
  // Layout preference is not an incident fact.
  await p.click(T('hide-win-equipment')); await p.reload(); await p.waitForSelector(T('dock')); await sleep(500);
  assert(!(await p.locator('[data-window="equipment"]').isVisible()), 'hidden state persists');
  assert(!JSON.stringify((await state(p)).rec).includes('hiddenPanels'), 'not in the record');
  await p.click(T('windows-open')); await p.click(T('windows-reset')); await p.waitForSelector('[data-window="equipment"]');
  // Sit. Rep: same controls, half-edited form survives.
  await p.click(T('nav-sitrep')); await p.click(T('sitrep-new')); await p.waitForSelector(T('sitrep-editor'));
  await p.fill(T('sitrep-input-outstanding'), 'HALF EDITED');
  await p.click(T('hide-sitrep-b')); await p.waitForSelector(`${T('splitpane-sitrep')}[data-maximized="a"]`);
  await p.click(T('windows-open')); await p.click(T('win-sitrep.b')); await p.waitForSelector(T('sitrep-input-outstanding'));
  assert((await p.inputValue(T('sitrep-input-outstanding'))) === 'HALF EDITED', 'SITREP text survives');
  // Escape order: popover, then settings, then assistant stays until its own turn.
  await p.click(T('nav-situation')); await p.click(T('assistant-toggle')); await p.click(T('settings-open')); await p.waitForSelector(T('settings'));
  await p.click(T('settings-defaults')); await p.keyboard.press('Escape'); await sleep(80);
  assert(await p.locator(T('settings')).count() === 0 && await p.locator(T('assistant-close')).count() === 1, 'one Escape closes only Settings');
  await p.context().close();
});

await step('g: settings separate defaults from the current incident; versions recorded; role honesty', async () => {
  const p = await fresh();
  await p.click(T('settings-open')); await p.click(T('settings-defaults'));
  assert(await p.locator(`${T('default-autostart')}:disabled`).count() === 1 && /not real authorization/.test(await p.textContent(T('defaults-note'))), 'defaults need the demo Admin role and say so');
  await p.keyboard.press('Escape');
  await p.click(T('user-menu')); await p.click(T('role-admin')); await p.keyboard.press('Escape');
  await p.click(T('settings-open')); await p.click(T('settings-defaults'));
  await p.click(T('default-autostart')); await p.click(T('cap-assessment')); await sleep(80);
  assert(/v3/.test(await p.textContent(T('defaults-log'))), 'defaults change log with versions');
  await p.click(T('settings-application'));
  assert(/this browser only/.test(await p.textContent(T('storage-info'))), 'storage limits stated');
  await p.keyboard.press('Escape');
  // Auto-start off: nothing analyses until started, and sources still move.
  await startTraining(p);
  assert((await agentState(p)) === 'not-started' && (await p.textContent(T('agent-label'))) === 'Agent not started', 'not started');
  await next(p, 1); await sleep(27000);
  assert(await p.locator('[data-testid^="alert-a"]').count() === 0, 'no alerts without analysis');
  assert(await p.locator(T('agent-notice')).count() === 1, 'notice');
  await p.click(T('notice-start')); await p.waitForSelector(T('alert-a2-1'));
  let r = (await state(p)).rec;
  assert(r.createdAt < r.agentRuns[0].startedAt, 'agent start distinct from record creation');
  // The run used the defaults: no assessment group.
  await sleep(1500);
  assert(r.agentRuns[0].config.version === 3 && !r.agentRuns[0].config.capabilities.includes('assessment'), 'run keeps the version it used');
  assert(!(await state(p)).rec.events.some((e) => e.kind === 'agent' && e.taskKind === 'assessment'), 'capability off really suppresses that work');
  // Changing this incident does not change defaults or the running run.
  await p.click(T('settings-open')); await p.click(T('settings-incident'));
  await p.click(T('cap-assessment')); await p.waitForSelector(T('config-pending'));
  r = (await state(p)).rec;
  assert(r.agentConfig.version === 4 && r.agentRuns[0].config.version === 3 && r.events.some((e) => e.kind === 'config'), 'recorded and applies next run');
  assert((await p.evaluate(() => window.__ecc.store.getState().agentDefaults.version)) === 3, 'defaults unchanged');
  await p.context().close();
});

await step('h: cleanup: labelled alert badge, no doubled tags, compact Admin toolbar, equipment visible at 1366', async () => {
  const p = await fresh({ w: 1366, h: 768 });
  await startTraining(p);
  await next(p, 1); await p.waitForSelector(T('alert-a2-1'), { timeout: 45000 });
  const badge = p.locator('[data-testid="walert-D-0029:pressure"]');
  assert(/1 alert/.test(await badge.textContent()) && /does not mean the value is above a limit/.test(await badge.getAttribute('title')), 'badge says what it counts');
  await badge.click(); assert((await p.evaluate(() => window.__ecc.store.getState().selectedAlertId)) === 'a2-1', 'opens the alert');
  // Dialogs fit the short screen; the action stays reachable.
  await p.click(T('lifecycle-resolve'));
  const sb = await p.locator(T('resolve-submit')).boundingBox();
  assert(sb && sb.y + sb.height <= 768, `resolve action on screen (${sb?.y})`);
  assert(!/\b([A-Z]{1,2}-\d{2,4}): \1/.test(await p.textContent(T('resolve-unresolved'))), 'no doubled tag in the unresolved list');
  await p.keyboard.press('Escape');
  await p.click(T('facil-simulate')); await p.click(T('sim-notification')); await p.keyboard.press('Escape'); await p.click(T('incoming-review'));
  const ss = await p.locator(T('start-submit')).boundingBox();
  assert(ss && ss.y + ss.height <= 768, `start action on screen with the choice showing (${ss?.y})`);
  await p.keyboard.press('Escape'); await p.click(T('incoming-later'));
  // Business view header keeps its title readable.
  await p.click(T('nav-agentlog'));
  const titleEl = p.locator('[data-testid="splitpane-agentlog"] .split-a .pane-h .title');
  assert(await titleEl.evaluate((e) => e.scrollWidth <= e.clientWidth), 'Agent log title not truncated');
  await p.click(T('nav-situation'));
  // Two cards side by side at 1366.
  const c1 = await p.locator(T('card-D-0029')).boundingBox(); const c2 = await p.locator(T('card-D-0001')).boundingBox();
  assert(c1.y === c2.y && c1.width >= 330, `two columns (${c1.width})`);
  const fs = await p.locator('.wrow .var').first().evaluate((e) => getComputedStyle(e).fontSize);
  assert(parseFloat(fs) >= 12, `text not shrunk (${fs})`);
  // Doubled tags.
  await p.click(T('alert-a2-1')); await next(p, 3); await p.waitForSelector(T('alert-a5-1'), { timeout: 45000 }).catch(() => {});
  await p.click(T('assistant-toggle')); await sleep(200);
  const banner = await p.locator('.as-critical').first().textContent().catch(() => '');
  assert(!/(\b[A-Z]{1,2}-\d{2,4}\b) · \1/.test(banner), `no doubled tag (${banner})`);
  await p.click(T('assistant-close'));
  // Admin toolbar.
  await p.click(T('user-menu')); await p.click(T('role-admin')); await p.keyboard.press('Escape');
  await p.click(T('nav-agentlog')); await p.waitForSelector('[data-testid="page-agentlog"][data-view="detailed"]');
  const tb = await p.locator(T('agent-toolbar')).boundingBox();
  assert(tb.height <= 76, `two rows (${tb.height})`);
  const inp = p.locator(T('agent-search'));
  assert(await titleEl.evaluate((e) => e.scrollWidth <= e.clientWidth), 'Agent log title not truncated in Admin view');
  const fits = await inp.evaluate((e) => { const c = document.createElement('canvas').getContext('2d'); c.font = getComputedStyle(e).font; return c.measureText(e.placeholder).width <= e.clientWidth - 12; });
  assert(fits, 'search hint not clipped');
  await p.context().close();
});

await step('i: backup carries uploaded originals, restores them byte for byte, and says what it holds', async () => {
  const p = await fresh();
  await p.evaluate(() => window.__ecc.store.getState().ingest(new File(['ORIGINAL BYTES'], 'note.txt', { type: 'text/plain' }), { title: 'Field note', site: 'SG GSP', equipment: [], type: 'Policy', number: 'N-1', revision: '1', declaredStatus: 'draft' }));
  await p.click(T('settings-open')); await p.click(T('settings-application'));
  const file = await download(p, () => p.click(T('export-all')));
  await p.waitForSelector(T('backup-note'));
  assert(/1 uploaded original included/.test(await p.textContent(T('backup-note'))), 'states the original is included');
  const q = await fresh();
  await q.click(T('settings-open')); await q.click(T('settings-application'));
  await q.setInputFiles(`[data-testid="settings"] ${T('import-file')}`, file); await q.waitForSelector(T('import-review'));
  await q.click(T('import-confirm')); await q.waitForSelector(T('import-result'));
  const restored = await q.evaluate(async () => { const st = window.__ecc.store.getState(); const d = st.uploads.find((u) => u.fileName === 'note.txt'); const url = d && await st.uploadUrl(d.id); return url ? (await fetch(url)).text() : null; });
  assert(restored === 'ORIGINAL BYTES', `restored byte for byte (${restored})`);
  await p.context().close(); await q.context().close();
  const j = JSON.parse(await readFile(file, 'utf8'));
  assert(j.attachments.length === 1 && atob(j.attachments[0].base64) === 'ORIGINAL BYTES', 'bytes in the file');
});

const shots = want('shots');
if (shots) {
  const report = {};
  const p = await fresh();
  await startTraining(p);
  await next(p, 3); await p.waitForSelector(T('alert-a4-2'), { timeout: 45000 });
  await p.click(T('alert-a4-2'));
  const snap = async (name, tag) => { await sleep(300); await p.screenshot({ path: `${OUT}/${name}-${tag}.png` }); report[`${name}-${tag}`] = await p.evaluate(() => { const i = []; const d = document.documentElement; if (d.scrollWidth > innerWidth + 1) i.push(`sideways ${d.scrollWidth}`); if (d.scrollHeight > innerHeight + 1) i.push(`vertical ${d.scrollHeight}`); const q = (t) => document.querySelector(`[data-testid="${t}"]`)?.getBoundingClientRect(); const h = [q('timer'), q('theme-toggle'), q('assistant-toggle'), q('user-menu')]; for (let k = 1; k < 4; k++) if (h[k].left < h[k - 1].right) i.push('header order'); if (innerWidth - h[3].right > 20) i.push('profile not at the edge'); const sb = q('statusbar'); for (const e of document.querySelectorAll('[data-testid="statusbar"] button')) { const r = e.getBoundingClientRect(); if (r.right > innerWidth + 1 || r.height > sb.height) i.push(`status control: ${e.textContent.trim().slice(0, 24)}`); } return i; }); };
  for (const [w, h] of [[1440, 900], [1366, 768]]) for (const th of ['light', 'dark']) {
    await p.setViewportSize({ width: w, height: h });
    await p.evaluate((t) => window.__ecc.store.getState().setTheme(t), th);
    const tag = `${w}-${th}`;
    await p.click(T('nav-situation')); await snap('situation', tag);
    await p.click(T('max-win-log')); await snap('maximized', tag); await p.click('[data-window="log"] button[title="Restore layout"]');
    await openAgent(p); await snap('agent-popover', tag); await p.keyboard.press('Escape');
    await p.click(T('windows-open')); await snap('windows', tag); await p.keyboard.press('Escape');
    await p.click(T('settings-open')); await p.click(T('settings-application')); await snap('settings', tag); await p.click(T('settings-incident')); await snap('settings-incident', tag); await p.keyboard.press('Escape');
    await p.click(T('lifecycle-resolve')); await snap('resolve', tag); await p.keyboard.press('Escape');
    await p.click(T('nav-agentlog')); await snap('agentlog', tag);
    await p.click(T('nav-sitrep')); await p.click(T('side-status')); await snap('status', tag);
    await p.click(T('nav-knowledge')); await p.click(T('kv-incidents')); await snap('history', tag);
    await p.click(T('nav-situation'));
    await p.click(T('facil-simulate')); await p.click(T('sim-notification')); await p.keyboard.press('Escape');
    await p.click(T('incoming-review')); await snap('start-conflict', tag); await p.keyboard.press('Escape'); await p.click(T('incoming-later'));
    await openAgent(p); await p.click(T('agent-pause')); await sleep(200); await snap('paused', tag); await openAgent(p); await p.click(T('agent-resume')); await sleep(100);
    await p.evaluate(() => window.__ecc.store.getState().setDismissedNotice(null));
  }
  const q = await fresh({ w: 1366, h: 768 });
  await q.screenshot({ path: `${OUT}/none-1366-light.png` });
  await q.evaluate(() => window.__ecc.store.getState().setTheme('dark')); await sleep(200); await q.screenshot({ path: `${OUT}/none-1366-dark.png` });
  await q.click(T('start-incident')); await sleep(200); await q.screenshot({ path: `${OUT}/start-1366-dark.png` });
  await q.context().close();
  console.log('layout audit:', JSON.stringify(Object.fromEntries(Object.entries(report).filter(([, v]) => v.length))));
}
await browser.close();
if (errors.length) { fail++; console.log('FAIL console errors:', JSON.stringify([...new Set(errors)].slice(0, 6))); }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
