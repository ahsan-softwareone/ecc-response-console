// Focused checks for the human-initiated investigation flow.
// Usage: node scripts/verify-investigation.mjs [--only=a,b,...]   Needs the dev server on 5189.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const URL = 'http://localhost:5189/';
const OUT = process.env.SHOTS_DIR ?? resolve(tmpdir(), 'ecc-investigation');
await mkdir(OUT, { recursive: true });
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) ?? '').slice(7).split(',').filter(Boolean);
const want = (s) => !ONLY.length || ONLY.includes(s);
if (process.platform === 'darwin') spawn('caffeinate', ['-i', '-w', String(process.pid)], { stdio: 'ignore', detached: true }).unref();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const assert = (c, m) => { if (!c) throw new Error(`assertion failed: ${m}`); };
const T = (id) => `[data-testid="${id}"]`;
let pass = 0, fail = 0;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];

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
async function fresh({ w = 1440, h = 900 } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  const page = drawerAware(await ctx.newPage());
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('favicon')) errors.push(m.text()); });
  await page.goto(URL); await page.waitForSelector(T('no-incident'));
  await page.waitForFunction(() => window.__ecc?.retrieval?.size > 0, null, { timeout: 60000 });
  return page;
}
const training = async (p, steps = 1) => { await p.click(T('start-training')); await p.click(T('start-submit')); await p.waitForSelector(T('dock')); await p.click(T('view-updates')); await next(p, steps - 1); };
// Reveal a step and let its events pass, so the record holds what the scenario has released.
const next = async (p, n = 1) => { for (let i = 0; i < n; i++) { await p.click(T('facil-next')); await sleep(150); await p.evaluate(() => { const s = window.__ecc.store.getState(); return s.skewMs; }); } await settle(p); };
const settle = async (p) => { await p.evaluate(() => { const { store, setClockSkew } = window.__ecc; const s = store.getState(); if (s.revealedAt.length > 1) { const skew = s.skewMs + 70000; store.setState({ skewMs: skew }); setClockSkew(skew); } }); await sleep(2200); };
const openPanel = async (p) => { if (!(await p.locator(T('assistant')).count())) await p.click(T('assistant-toggle')); await p.waitForSelector(T('assistant')); };
const rec = (p) => p.evaluate(() => { const s = window.__ecc.store.getState(); return s.records[s.incidentId]; });
const stored = (p, id) => p.evaluate((rid) => new Promise((res, rej) => { const q = indexedDB.open('ecc-v3'); q.onerror = () => rej(q.error); q.onsuccess = () => { const g = q.result.transaction('incidents').objectStore('incidents').get(rid); g.onsuccess = () => res(g.result); g.onerror = () => rej(g.error); }; }), id);
const ask = async (p, text) => { await openPanel(p); await p.click(T('mode-ask')); await p.waitForSelector(`${T('assistant-send')}`); const before = await p.locator(T('investigation')).count(); await p.fill(T('assistant-input'), text); await p.click(T('assistant-send')); await p.waitForFunction((n) => document.querySelectorAll('[data-testid="investigation"]').length > n, before); return p.locator(T('investigation')).last(); };
const report = async (p, text, o = {}) => { await openPanel(p); await p.click(T('mode-report')); await p.fill(T('obs-text'), text); if (o.equipment) await p.selectOption(T('obs-equipment'), o.equipment); if ((o.source || o.detail || o.question) && !(await p.locator(T('obs-more')).evaluate((d) => d.open))) await p.click(`${T('obs-more')} > summary`); if (o.source) await p.selectOption(T('obs-source'), o.source); if (o.detail) await p.fill(T('obs-source-detail'), o.detail); if (o.question) await p.fill(T('obs-question'), o.question); await p.click(T('obs-submit')); };
const done = (entry) => entry.locator(`${T('assistant-reply')}`).first().waitFor({ timeout: 20000 });
/** Full equipment cards (Show all readings); back to the strip and the Incident Updates view. */
const showReadings = async (p) => { if ((await p.getAttribute(T('watch-toggle'), 'aria-expanded')) === 'false') await p.click(T('watch-toggle')); };
const toUpdates = async (p) => { if ((await p.getAttribute(T('watch-toggle'), 'aria-expanded')) === 'true') await p.click(T('watch-toggle')); await p.click(T('view-updates')); };
async function step(name, fn) {
  if (!want(name.split(':')[0])) return;
  try { await fn(); pass++; console.log('PASS', name); } catch (e) { fail++; console.log('FAIL', name, '-', String(e.message ?? e).split('\n').slice(0,3).join(' ')); }
}

await step('a: question from the global Assistant: recorded, cited, opens documents, readings and the workspace; a question makes no decision', async () => {
  const p = await fresh(); await training(p, 3);
  const sel0 = await p.evaluate(() => window.__ecc.store.getState().layout);
  await openPanel(p);
  assert((await p.textContent(T('assistant-context'))).includes('Incident INC-') && (await p.inputValue(T('assistant-scope-site'))) === 'SG GSP', 'incident and site scope shown; scope is the incident site');
  const e = await ask(p, 'Why is D-0001 pressure continuing to rise?');
  // Labels on the way, then the answer.
  await done(e);
  const text = await e.textContent();
  assert((await e.locator(T('response-heading')).first().textContent()) === 'Assessment', 'assessment');
  assert(/D-0001 pressure is 15\.2 bar and rising/.test(text), `finding states the reading: ${text.slice(0, 200)}`);
  assert(/inferred from readings, not measured/.test(text), 'cause labelled as inferred');
  assert((await e.locator(T('response-asof')).textContent()).startsWith('As of'), 'as-of time');
  assert(/no validated time-to-limit/i.test(text), 'no time-to-limit invented');
  assert(!/\b(open|close) (the )?valve|shut in\b/i.test(text), 'no valve instruction');
  const r = await rec(p); const inv = r.investigations[0];
  assert(inv.by.includes('N. Al-Harbi') && inv.scope.sites[0] === 'SG GSP' && inv.status === 'complete' && inv.responses[0].run.number === 1 && inv.responses[0].run.configVersion >= 1, 'author, scope, run and config recorded');
  assert(r.events.some((x) => x.kind === 'investigation' && x.title.startsWith('Question:')) && r.events.some((x) => x.kind === 'agent' && x.taskKind === 'investigation'), 'question and task in the record');
  assert((await stored(p, r.id)).investigations.length === 1, 'investigation on disk');
  // Document citation keeps revision and page.
  const cite = e.locator(T('response-citation')).first(); assert(await cite.count() === 1, 'has a document citation');
  const rev = await cite.getAttribute('data-rev');
  const pinned = (await rec(p)).investigations[0].responses.at(-1).documents[0];
  await cite.locator(T('cite-view')).click(); await p.waitForSelector(`${T('viewer')}[data-rendered="true"]`, { timeout: 20000 });
  const st = await p.evaluate(() => window.__ecc.store.getState().viewer);
  assert(st.revision === rev && st.revision === pinned.revision && st.page === pinned.page && st.docId === pinned.docId, `viewer at the cited document, revision and page (${st.docId} ${st.revision} p.${st.page})`);
  assert((await p.locator(`${T('viewer')}[data-page="${pinned.page}"]`).count()) >= 1, 'the viewer shows that page');
  if (await p.locator(T('viewer-overlay')).count()) await p.click(`${T('viewer-overlay')} ${T('viewer-close')}`);
  await p.keyboard.press('Escape'); await sleep(200);
  // Reading opens its own source.
  await e.locator(`${T('response-evidence')} > summary`).click();
  await e.locator(`${T('evidence-item')}[data-kind="reading"] ${T('evidence-open')}`).first().click(); await p.waitForSelector(T('trend-close')); await p.click(T('trend-close'));
  // Field or agent entry opens source details.
  const other = e.locator(`${T('evidence-item')}[data-kind="observation"] ${T('evidence-open')}`).first();
  if (await other.count()) { await other.click(); assert(await e.locator(T('evidence-details')).count() >= 1, 'source details'); }
  // Recommendation opens in the existing workspace; nothing is decided.
  await e.locator(T('open-workspace')).click(); await p.waitForSelector(`${T('issue-panel')}[data-issue="pressure"]`);
  const r2 = await rec(p);
  assert(!r2.events.some((x) => x.kind === 'decision'), 'no decision from a question');
  assert((await p.locator(T('decision-form')).count()) === 1, 'the existing decision form is what appears');
  assert((await p.evaluate(() => window.__ecc.store.getState().layout.splitX)) === sel0.splitX, 'layout unchanged');
});

await step('b: Ask about this from equipment and alert: context visible, removable, changeable; workspace preserved', async () => {
  const p = await fresh(); await training(p, 3);
  await showReadings(p); await p.click(`${T('card-D-0001')} ${T('ask-about-D-0001')}`); await p.waitForSelector(T('assistant'));
  assert((await p.textContent(T('context-equipment'))).includes('D-0001'), 'equipment attached');
  await p.click(T('context-remove-equipment')); assert(await p.locator(T('context-equipment')).count() === 0, 'removed');
  await p.click(T('context-attach')); await p.click(T('attach-eq-DS-029')); assert((await p.textContent(T('context-equipment'))).includes('DS-029'), 'changed');
  await p.click(T('assistant-close'));
  await toUpdates(p); await p.click(T('alert-a3-1')); await p.waitForSelector(T('ask-about-alert'));
  await p.click(T('decide-approved')); await p.fill(T('rationale'), 'half-written rationale');
  await p.click(T('ask-about-alert')); await p.waitForSelector(T('context-alert'));
  assert((await p.textContent(T('context-alert'))).includes('D-0001 pressure rising'), 'alert attached');
  assert((await p.inputValue(T('rationale'))) === 'half-written rationale', 'half-written form kept');
  assert((await p.evaluate(() => window.__ecc.store.getState().selectedAlertId)) === 'a3-1', 'selection kept');
  const e = await ask(p, 'What does this mean?'); await done(e);
  const t = await e.textContent();
  assert(t.includes('Pressure has risen 2.8 bar'), 'answer comes from the attached alert');
  assert((await e.locator(T('question-context')).textContent()).includes('D-0001 pressure rising'), 'context kept with the question');
  await p.click(T('assistant-close'));
  assert(await p.locator(T('ask-report')).count() === 0, 'the redundant Situation Ask / Report button is gone');
});

await step('c: field observation at an early stage: saved, attributed, labelled, conflicting evidence kept; truth not changed; later scenario reports keep provenance with no duplicate', async () => {
  const p = await fresh(); await training(p, 2);
  const before = await p.evaluate(() => window.__ecc.store.getState().dashboard);
  await openPanel(p); await p.click(T('mode-report'));
  assert((await p.textContent(T('obs-destination'))).includes('INC-'), 'destination shown');
  assert((await p.textContent(T('obs-time-default'))).includes('Now'), 'observed time defaults to now');
  await report(p, 'Field operator reports deluge is not working', { equipment: 'DS-029', source: 'field', detail: 'Radio from fire team', question: 'What does this change?' });
  await p.waitForSelector(T('obs-confirm'));
  assert(/^Added to (Open issues as a new issue: )?“.+”$/.test(await p.textContent(T('obs-result'))), 'one clear result: where it went');
  const r = await rec(p); const ev = r.events.find((x) => x.meta?.userSubmitted);
  assert(ev && ev.title === 'Field operator reports deluge is not working' && ev.by.includes('N. Al-Harbi') && ev.meta.sourceLabel === 'Field report' && ev.meta.evidence === 'reported' && ev.kind === 'observation', 'wording, author, source and label');
  assert(ev.t === ev.meta.receivedAt, 'event time is the actual received time');
  assert((await stored(p, r.id)).events.some((x) => x.id === ev.id), 'on disk');
  const e = p.locator(T('investigation')).last(); await done(e);
  assert((await e.locator(T('observation-label')).textContent()).includes('Reported · Field report'), 'labelled reported, with source');
  assert((await e.locator(T('observation-attribution')).textContent()).includes('submitted by N. Al-Harbi'), 'attribution');
  const reply = await e.locator(`${T('assistant-reply')}`).getAttribute('data-state');
  assert(reply === 'conflict', `conflict state (${reply})`);
  assert((await e.locator(T('conflict-a')).first().textContent()).includes('deluge is not working') && (await e.locator(T('conflict-b')).first().textContent()).includes('Standby'), 'both sides visible');
  const firstFinding = (await rec(p)).investigations[0].responses[0].finding;
  // Truth unchanged.
  const dsStatus = await p.textContent(T('card-DS-029'));
  assert(dsStatus.includes('Standby'), 'DS-029 still reads Standby on its card');
  assert((await p.getAttribute(T('reported-DS-029'), 'data-state')) === 'conflict', 'separate reported condition on the card');
  assert(!(await rec(p)).events.some((x) => x.id.startsWith('alert-') && x.equipmentId === 'DS-029'), 'no alert created by a report');
  assert(JSON.stringify(before) === JSON.stringify(await p.evaluate(() => window.__ecc.store.getState().dashboard)), 'dashboard unchanged');
  // The report also appears, labelled, on the alert's Observations tab for its equipment.
  await p.click(T('assistant-close'));
  await p.evaluate(() => window.__ecc.store.getState().addEquipment('DS-029'));
  await p.click(T('alert-a2-1')); await p.click(`${T('related')} > summary`); await p.click(T('related-in-feed'));
  assert((await p.locator('.sr-row[data-origin="person"]').count()) === 0, 'a report on DS-029 is not listed under the D-0029 issue');
  await p.click(T('feed-scope'));
  await openPanel(p);
  // Timeline entry, original wording, link to the exchange.
  await p.click(T('nav-sitrep')); await p.waitForSelector(T('story'));
  await p.fill(T('timeline-search'), 'deluge is not working'); await p.clock.runFor(300);
  const rows = p.locator(`${T('timeline-row')}[data-kind="observation"]`);
  assert(await rows.count() === 1, 'one timeline observation');
  assert((await rows.first().textContent()).includes('Reported · Field report: Radio from fire team'), 'source on the timeline');
  await rows.first().locator(T('open-exchange')).click();
  await p.fill(T('timeline-search'), '');
  // The scripted failure arrives later: separate provenance, a revision, no duplicate condition.
  await p.click(T('nav-situation')); await next(p, 2);
  await p.waitForFunction(() => { const s = window.__ecc.store.getState(); return s.records[s.incidentId].investigations[0].responses.length >= 2; }, null, { timeout: 15000 });
  const r3 = await rec(p); const inv = r3.investigations[0];
  const noFlow = r3.events.filter((x) => x.id === 'alert-a4-1');
  assert(noFlow.length === 1 && noFlow[0].t > ev.t, 'one scripted alert, timestamped after the report');
  assert(r3.events.filter((x) => x.meta?.userSubmitted).length === 1, 'the observation is not duplicated');
  assert(inv.responses[0].state === 'conflict' && inv.responses[0].finding === firstFinding, 'earlier answer kept word for word');
  const last = inv.responses[inv.responses.length - 1];
  assert(last.reconciliation !== 'conflict' || last.conflicts.length > 0, 'state coherent');
  assert(last.updateReason && last.updateReason.startsWith('New evidence'), 'update says why');
  await openPanel(p);
  const e2 = p.locator(T('investigation')).first();
  assert(await e2.locator(T('response-updated')).count() >= 1, 'marked updated');
  assert(await e2.locator(T('earlier-assessment')).count() >= 1, 'earlier assessment retained');
});

await step('d: report conflicting with a reading; readings and alerts unchanged; amendment is audited', async () => {
  const p = await fresh(); await training(p, 2);
  await report(p, 'D-0029 pressure is rising according to the field team', { source: 'personal' });
  await p.waitForSelector(T('obs-confirm'));
  const e = p.locator(T('investigation')).last(); await done(e);
  assert((await e.locator(T('assistant-reply')).getAttribute('data-state')) === 'conflict', 'conflict');
  const c = await e.locator(T('response-conflicts')).textContent();
  assert(c.includes('falling'), `the reading is shown: ${c}`);
  const r0 = await rec(p); const obsId = r0.investigations[0].observationEventId;
  await e.locator(T('observation-amend')).click(); await e.locator(T('amend-text')).fill('D-0029 pressure is falling, corrected by the field team'); await e.locator(T('amend-save')).click();
  await p.waitForSelector(T('observation-amended'));
  const r1 = await rec(p);
  assert(r1.events.find((x) => x.id === obsId).title === 'D-0029 pressure is rising according to the field team', 'original not overwritten');
  assert(r1.events.some((x) => x.kind === 'correction' && x.corrects === obsId && x.by.includes('N. Al-Harbi')), 'audited correction');
  assert((await e.locator(T('observation-original')).textContent()).includes('rising'), 'original still shown');
  await p.waitForFunction(() => { const s = window.__ecc.store.getState(); return s.records[s.incidentId].investigations[0].responses.length === 2; }, null, { timeout: 10000 });
  const r2 = await rec(p);
  assert(r2.investigations[0].responses[1].state === 'answered' && r2.investigations[0].responses[0].state === 'conflict', 'revised assessment; earlier conflict kept');
});

await step('e: insufficient evidence: says so, gives passages only, no composed answer; nothing found is distinct; retrieval failure is distinct', async () => {
  const p = await fresh(); await training(p, 1);
  const e = await ask(p, 'What is the wind direction at the flare stack?'); await done(e);
  const st = await e.locator(T('assistant-reply')).getAttribute('data-state');
  assert(['insufficient', 'empty', 'results'].includes(st), `state ${st}`);
  const t = await e.textContent();
  assert(/cannot|no supported answer|has not composed/i.test(t), `limitation stated: ${t.slice(0, 160)}`);
  assert(!/wind (is|from|direction is)/i.test(t), 'no invented answer');
  assert(await e.locator(T('response-suggestion')).count() === 0, 'no recommendation');
  const e2 = await ask(p, 'zzqqxx plugh'); await done(e2);
  assert((await e2.locator(T('assistant-reply')).getAttribute('data-state')) === 'empty' && await e2.locator(T('assistant-empty')).count() === 1, 'nothing found');
  await p.click(T('facil-simulate')); await p.click(T('facil-simfail')); await p.keyboard.press('Escape');
  const e3 = await ask(p, 'fire response procedure'); await done(e3);
  assert((await e3.locator(T('assistant-reply')).getAttribute('data-state')) === 'error' && await e3.locator(T('assistant-error')).count() === 1, 'retrieval failure');
});

await step('f: no future scenario knowledge at an early stage', async () => {
  const p = await fresh(); await training(p, 1);
  const FUTURE = /shrapnel|heat input|no flow after|18\.3|19\.1|flare header damaged|upstream route aligned|contained|Rev 3 now/i;
  const e = await ask(p, 'Why is D-0001 pressure continuing to rise?'); await done(e);
  const t = await e.textContent();
  assert(/does not show a rise/.test(t) && /12\.4/.test(t), `premise corrected from the actual reading: ${t.slice(0, 200)}`);
  assert(await e.locator(T('response-suggestion')).count() === 0, 'no recommendation offered');
  const e2 = await ask(p, 'What information is missing before assessing an alternative route?'); await done(e2);
  const e3 = await report(p, 'Deluge is not working at the propane area', { source: 'field' }); void e3;
  const obs = p.locator(T('investigation')).last(); await done(obs);
  for (const [n, x] of [['pressure', e], ['route', e2], ['deluge', obs]]) {
    const r = await x.locator(T('investigation-response')).first();
    const finding = await r.locator(T('response-finding')).textContent().catch(() => '');
    const evidence = await r.locator(T('response-evidence')).textContent().catch(() => '');
    const m = `${finding} ${evidence}`.match(FUTURE); assert(!m, `${n}: future content "${m?.[0]}"`);
  }
  const rec0 = await rec(p);
  const leaked = rec0.investigations.flatMap((i) => i.responses.flatMap((a) => a.evidence.map((v) => v.text))).find((x) => FUTURE.test(x));
  assert(!leaked, `no future evidence recorded: ${leaked}`);
});

await step('g: paused and stopped: observations save, pending is plain, agent not restarted silently; explicit resume and start run the analysis', async () => {
  const p = await fresh(); await training(p, 2);
  await p.click(T('agent-status')); await p.waitForSelector(T('agent-summary'));
  await p.locator('[data-testid="agent-pause"], button:has-text("Pause")').first().click(); await p.keyboard.press('Escape'); await sleep(200);
  assert((await p.getAttribute(T('agent-status'), 'data-state')) === 'paused', 'paused');
  await report(p, 'Deluge DS-029 is not working', { equipment: 'DS-029' });
  await p.waitForSelector(T('obs-confirm'));
  assert((await p.textContent(T('obs-confirm'))).includes('ECC has not assessed it yet because the agent is not running.'), 'confirmation is honest');
  const e = p.locator(T('investigation')).last();
  await e.locator(T('investigation-pending')).waitFor();
  assert((await e.locator(T('investigation-pending')).getAttribute('data-reason')) === 'paused', 'pending because paused');
  await sleep(1500);
  const r = await rec(p);
  assert(r.investigations[0].status === 'queued' && !r.investigations[0].responses.length, 'nothing analysed while paused');
  assert((await p.getAttribute(T('agent-status'), 'data-state')) === 'paused', 'still paused');
  assert(r.events.some((x) => x.meta?.userSubmitted), 'observation saved while paused');
  const q = await ask(p, 'Which procedure applies if deluge is unavailable?');
  await q.locator(T('investigation-pending')).waitFor();
  await e.locator(T('pending-resume')).click();
  await done(q); await done(e);
  assert((await p.getAttribute(T('agent-status'), 'data-state')) === 'running', 'running after the explicit resume');
  const r2 = await rec(p);
  assert(r2.agentRuns.length === 1 && r2.events.some((x) => x.kind === 'agent-control' && x.title.includes('resumed')), 'same run, audited');
  // Stopped.
  await p.click(T('agent-status')); await p.locator('[data-testid="agent-stop"], button:has-text("Stop")').first().click();
  await p.locator('[data-testid="stop-reason"]').fill('checks').catch(() => {});
  await p.locator('[data-testid="stop-confirm"], .modal button.primary').first().click().catch(() => {});
  await sleep(300);
  assert((await p.getAttribute(T('agent-status'), 'data-state')) === 'stopped', 'stopped');
  await p.keyboard.press('Escape');
  const q2 = await ask(p, 'What is the status of D-0001?');
  await q2.locator(T('investigation-pending')).waitFor();
  assert((await q2.locator(T('investigation-pending')).getAttribute('data-reason')) === 'stopped', 'pending because stopped');
  await sleep(800);
  assert((await rec(p)).agentRuns.length === 1, 'not restarted silently');
  await q2.locator(T('pending-start')).click(); await done(q2);
  assert((await rec(p)).agentRuns.length === 2, 'a new run only after the explicit action');
});

await step('h: save failure keeps the input, never claims it was recorded; retry succeeds', async () => {
  const p = await fresh(); await training(p, 2);
  await openPanel(p);
  await p.click(T('facil-simulate')); await p.click(T('sim-save-fail')); await p.keyboard.press('Escape'); await sleep(100);
  await report(p, 'Smoke seen near FH-01', { equipment: 'FH-01', detail: 'Operator A' });
  await p.waitForSelector(T('obs-error'));
  assert(await p.locator(T('obs-confirm')).count() === 0, 'no confirmation');
  assert((await p.inputValue(T('obs-text'))) === 'Smoke seen near FH-01' && (await p.inputValue(T('obs-source-detail'))) === 'Operator A', 'input kept');
  let r = await rec(p); assert(!r.events.some((x) => x.meta?.userSubmitted) && !(r.investigations ?? []).length, 'nothing added');
  await p.click(T('mode-ask')); await p.fill(T('assistant-input'), 'Status of FH-01?'); await p.click(T('assistant-send')); await p.waitForSelector(T('ask-error'));
  assert((await p.inputValue(T('assistant-input'))) === 'Status of FH-01?', 'question kept');
  await p.click(T('mode-report'));
  await p.click(T('facil-simulate')); await p.click(T('sim-save-fail')); await p.keyboard.press('Escape'); await sleep(100);
  await p.waitForSelector(T('obs-retry')).catch(() => {});
  if (await p.locator(T('obs-retry')).count()) await p.click(T('obs-retry')); else await p.click(T('obs-submit'));
  await p.waitForSelector(T('obs-confirm'));
  r = await rec(p); assert((await stored(p, r.id)).events.some((x) => x.meta?.userSubmitted), 'on disk after retry');
});

await step('i: close and reopen, reload: exchanges, unsent input and context persist; an interrupted analysis resumes', async () => {
  const p = await fresh(); await training(p, 3);
  const e = await ask(p, 'Why is D-0001 pressure continuing to rise?'); await done(e);
  await p.click(T('mode-report')); await p.fill(T('obs-text'), 'unsent observation text');
  await p.click(T('assistant-close')); await p.click(T('assistant-toggle'));
  assert(await p.locator(T('assistant-reply')).count() === 1, 'kept across close and reopen');
  assert((await p.inputValue(T('obs-text'))) === 'unsent observation text', 'unsent text kept');
  await p.reload(); await p.waitForSelector(T('dock')); await p.waitForSelector(T('assistant'));
  assert(await p.locator(T('assistant-reply')).count() === 1, 'kept across reload');
  assert((await p.inputValue(T('obs-text'))) === 'unsent observation text', 'unsent text kept across reload');
  await p.waitForFunction(() => window.__ecc.store.getState().indexReady, null, { timeout: 60000 });
  await p.click(T('mode-ask')); await p.fill(T('assistant-input'), 'What is the status of D-0029?'); await p.click(T('assistant-send'));
  await p.waitForFunction(() => { const s = window.__ecc.store.getState(); return s.records[s.incidentId].investigations.length === 2; });
  await p.reload(); await p.waitForSelector(T('dock'));
  await p.waitForFunction(() => { const s = window.__ecc.store.getState(); const i = s.records[s.incidentId]?.investigations; return i?.length === 2 && i[1].status === 'complete'; }, null, { timeout: 30000 }).catch(async (x) => { throw new Error(`${x.message.split('\n')[0]} ${JSON.stringify(await p.evaluate(() => { const s = window.__ecc.store.getState(); return { inv: s.records[s.incidentId]?.investigations?.map((i) => [i.status, i.responses.length]), idx: s.indexReady, size: window.__ecc.retrieval.size, agent: s.records[s.incidentId]?.agentRuns?.at(-1)?.status }; }))}`); });
});

await step('j: recommendation and decision workflow intact; the chain is traceable; a report is not an executed action', async () => {
  const p = await fresh(); await training(p, 3);
  const e = await ask(p, 'Why is D-0001 pressure continuing to rise?'); await done(e);
  await e.locator(T('open-workspace')).click(); await p.waitForSelector(T('decision-form'));
  await p.click(T('decide-approved')); await p.fill(T('rationale'), 'Agreed'); await p.click(T('record-decision'));
  await sleep(1200);
  const r = await rec(p);
  assert(r.events.filter((x) => x.kind === 'decision').length === 1, 'one decision');
  await openPanel(p); await e.locator(`${T('response-details')} > summary`).click();
  const trace = await e.locator(T('investigation-trace')).textContent();
  assert(/Accepted/.test(trace) && /None reported/.test(trace) && /None observed/.test(trace), `trace reaches the decision: ${trace}`);
  assert(/not an instruction/i.test(await e.locator(T('response-details')).textContent()), 'plain statement');
});

await step('k: no incident: questions search only; observation needs an incident; closed record is read-only here', async () => {
  const p = await fresh();
  await p.click(T('assistant-toggle')); await p.waitForSelector(T('assistant'));
  assert((await p.textContent(T('ask-unrecorded'))).includes('not recorded'), 'stated');
  await p.fill(T('assistant-input'), 'confirm water flow'); await p.click(T('assistant-send'));
  await p.waitForSelector(`${T('assistant-reply')}[data-state="results"]`);
  await p.click(T('mode-report')); await p.waitForSelector(T('obs-no-incident'));
  await p.fill(T('obs-text'), 'Odour near the separator');
  assert(await p.locator(T('obs-submit')).count() === 0, 'cannot record without an incident');
  const seeds = await p.evaluate(() => Object.values(window.__ecc.store.getState().records).map((r) => [r.id, r.events.length]));
  await p.click(T('obs-start-incident')); await p.fill(T('start-title'), 'Odour near separator'); await p.fill(T('start-notification'), 'Operator report.'); await p.click(T('start-submit')); await p.waitForSelector(T('obs-form'));
  assert((await p.inputValue(T('obs-text'))) === 'Odour near the separator', 'wording kept while choosing');
  assert((await p.textContent(T('obs-destination'))).includes('Odour near separator'), 'destination named');
  const r0 = await rec(p); assert(!r0.events.some((x) => x.meta?.userSubmitted), 'not attached until recorded');
  const after = await p.evaluate(() => Object.values(window.__ecc.store.getState().records).map((r) => [r.id, r.events.length]));
  for (const [id, n] of seeds) assert(after.find((x) => x[0] === id)[1] === n, `historical record ${id} untouched`);
  await p.click(T('obs-submit')); await p.waitForSelector(T('obs-confirm'));
  // Close the record, then the flow is read-only.
  await p.evaluate(async () => { const s = window.__ecc.store.getState(); await s.resolveIncident({ t: Date.now(), summary: 'Done', rationale: 'Done', evidence: [], outstanding: [], followUp: [] }); await window.__ecc.store.getState().closeIncident('Finished', []); window.__ecc.store.getState().setDialog(null); });
  await p.waitForSelector(T('obs-closed'));
  const n = (await rec(p)).events.length;
  await p.click(T('mode-ask')); await p.fill(T('assistant-input'), 'water flow'); await p.click(T('assistant-send')); await sleep(800);
  { const after = await rec(p); assert(after.events.length === n, `nothing added to the closed record: ${after.events.slice(n).map((x) => x.kind + ':' + x.title).join(' | ')}`); }
  await p.click(T('mode-report')); await p.click(T('obs-closed-options')); await p.waitForSelector('[data-testid="closed-options"], .modal');
});

await step('l: Sit. Rep and Agent Log: concise entries and task depth; the SITREP takes findings, not the conversation', async () => {
  const p = await fresh(); await training(p, 3);
  const e = await ask(p, 'Have similar incidents been recorded at this site?'); await done(e);
  const t = await e.textContent();
  assert(/matched by keyword/.test(t) && /not protocol/.test(t), 'answer with its limits');
  assert(!/WR NGL|East Terminal|Loading bay/.test(t), 'no other site appears');
  await report(p, 'Deluge is not working', { equipment: 'DS-029' }); await p.waitForSelector(T('obs-confirm'));
  await done(p.locator(T('investigation')).last());
  await p.click(T('nav-sitrep')); await p.waitForSelector(T('story'));
  for (let k = 0; k < 200 && await p.locator(`${T('moment-toggle')}[aria-expanded="false"]`).count(); k++) await p.locator(`${T('moment-toggle')}[aria-expanded="false"]`).first().click();
  const rows = p.locator(`${T('timeline-row')}:has(${T('open-exchange')})`);
  assert(await rows.count() >= 3, 'investigation entries in the timeline');
  await rows.first().locator(T('open-exchange')).click(); await p.waitForSelector(T('assistant'));
  await p.click(T('assistant-close'));
  await p.waitForSelector(T('sitrep-generate')); await p.click(T('sitrep-generate')); await p.waitForSelector(T('sitrep-input-situation'));
  const sit = await p.inputValue(T('sitrep-input-situation')); const out = await p.inputValue(T('sitrep-input-outstanding'));
  console.log('SITREP situation:', sit, '\nresponse:', await p.inputValue(T('sitrep-input-response')), '\noutstanding:', out);
  assert(/Conflicting evidence, not reconciled: [^\n]*Deluge is not working|Conflicting evidence, not reconciled: [^\n]*vs/.test(out), 'the unreconciled conflict needs attention');
  assert(!sit.includes('similar incidents') && !out.includes('similar incidents'), 'the question is not in the SITREP');
  await p.click(T('nav-agentlog')); await p.waitForSelector(T('page-agentlog'));
  const task = p.locator(`[data-category="Investigations"]`);
  assert(await task.count() === 2, 'a task for each investigation');
  await task.first().click(); await p.waitForSelector(T('business-detail'));
  assert(await p.locator(T('agent-open-exchange')).count() === 1, 'business view links to the exchange');
  assert(!/inv-\d|config v/.test(await p.textContent(T('business-detail'))), 'no technical data in the business view');
  await p.evaluate(() => { window.__ecc.store.getState().setRole('admin'); window.__ecc.store.getState().setAgentView('detailed'); });
  await p.waitForSelector(T('task-detail'));
  const adm = await p.textContent(T('task-detail'));
  assert(/Knowledge index/.test(adm) && /config v/.test(adm), 'admin depth: sources and config');
});

await step('m: procedure, route and clarification questions; other sites are not searched silently', async () => {
  const p = await fresh(); await training(p, 5);
  const e = await ask(p, 'Which procedure applies if deluge is unavailable?'); await done(e);
  const t = await e.locator(T('response-finding')).textContent();
  assert(/ECC-FX-001/.test(t) && /keyword match/.test(t), `closest guidance, labelled: ${t}`);
  assert(await e.locator(T('response-citation')).count() >= 1, 'cited');
  const e2 = await ask(p, 'What information is missing before assessing an alternative route?'); await done(e2);
  const u = await e2.textContent();
  assert(/Upstream route availability and isolation status unknown/.test(u) || /open item/.test(u), `gaps from the record: ${u.slice(0, 240)}`);
  assert(/Emergency depressurization/.test(await e2.locator(T('response-citations')).textContent()), 'route procedure cited');
  const e3 = await ask(p, 'Why is pressure rising?');
  await e3.locator(T('investigation-clarify')).waitFor({ timeout: 10000 });
  await e3.locator(T('clarify-D-0001')).click(); await done(e3);
  assert(/D-0001/.test(await e3.locator(T('response-finding')).textContent()), 'answered after the clarification');
  await p.selectOption(T('assistant-scope-site'), 'WR NGL Plant');
  const e4 = await ask(p, 'fire response procedure deluge'); await done(e4);
  const docs = await e4.locator(`${T('passage')}[data-kind="document"]`).evaluateAll((els) => els.map((x) => x.getAttribute('data-doc')));
  assert(!docs.includes('proc-fire'), `the chosen site is honoured: ${docs}`);
});

await step('n: layout in both themes at 1440x900 and 1366x768', async () => {
  for (const [w, h] of [[1440, 900], [1366, 768]]) {
    const p = await fresh({ w, h }); await training(p, 3);
    const e = await ask(p, 'Why is D-0001 pressure continuing to rise?'); await done(e);
    await report(p, 'Field operator reports deluge is not working', { equipment: 'DS-029', source: 'field', detail: 'Radio', question: 'What does this change?' });
    await p.waitForSelector(T('obs-confirm')); await done(p.locator(T('investigation')).last());
    for (const theme of ['light', 'dark']) {
      await p.evaluate((x) => window.__ecc.store.getState().setTheme(x), theme); await sleep(200);
      const audit = await p.evaluate(() => { const a = document.querySelector('[data-testid="assistant"]'); const ar = a.getBoundingClientRect(); const bad = []; for (const el of a.querySelectorAll('button, input, select, textarea, .inv-r, .as-obs')) { const r = el.getBoundingClientRect(); if (r.width && (r.right > ar.right + 1 || r.left < ar.left - 1)) bad.push(el.getAttribute('data-testid') || el.className); } const c = document.querySelector('[data-testid="assistant-composer"]').getBoundingClientRect(); const l = document.querySelector('[data-testid="assistant-messages"]').getBoundingClientRect(); return { bad, listH: l.height, innerOverflow: document.documentElement.scrollWidth > innerWidth, composerBottom: c.bottom, ar: ar.bottom }; });
      assert(!audit.bad.length, `${w} ${theme}: outside the panel: ${audit.bad.join(', ')}`);
      assert(audit.listH >= 100, `${w} ${theme}: conversation stays usable (${audit.listH}px)`);
      assert(!audit.innerOverflow && audit.composerBottom <= audit.ar + 1, `${w} ${theme}: no overflow`);
      await p.screenshot({ path: `${OUT}/report-${w}-${theme}.png` });
      await p.click(T('mode-ask')); await sleep(150);
      await p.locator(T('investigation')).first().evaluate((x) => x.scrollIntoView({ block: 'start' }));
      await p.screenshot({ path: `${OUT}/ask-${w}-${theme}.png` });
      await p.locator(T('investigation')).last().evaluate((x) => x.scrollIntoView({ block: 'start' }));
      await p.screenshot({ path: `${OUT}/conflict-${w}-${theme}.png` });
      await p.click(T('mode-report')); await sleep(100);
    }
    await p.context().close();
  }
});

/** Reports made in ECC appear in the Situation Room's feed as people updates. */
const openObs = async (p) => { await p.click(T('nav-situation')); await toUpdates(p); await p.click(T('origin-people')); await p.waitForSelector('.sr-row[data-origin="person"]'); };
const personRow = (p) => p.locator('.sr-row[data-origin="person"]');
const closeA = async (p) => { if (await p.locator(T('assistant')).count()) await p.click(T('assistant-close')); };
const lastInv = (p) => p.evaluate(() => { const s = window.__ecc.store.getState(); return s.records[s.incidentId].investigations.at(-1); });
const waitStatus = (p, st) => p.waitForFunction((x) => { const s = window.__ecc.store.getState(); return s.records[s.incidentId].investigations.at(-1)?.status === x; }, st, { timeout: 15000 });

await step('o: "its going to blow": wording kept, clarification in the Assistant, linked back; urgency and certainty separate; nothing invented', async () => {
  const p = await fresh(); await training(p, 3);
  const before = await rec(p); const alerts0 = before.events.filter((x) => x.kind === 'alert').length;
  await report(p, 'its going to blow', { source: 'field', detail: 'Radio call' }); await p.waitForSelector(T('obs-confirm'));
  await waitStatus(p, 'needs-clarification');
  const inv = await lastInv(p); assert(inv.urgentWording && !inv.responses.length, 'urgent wording flagged; no assessment fabricated');
  const e = p.locator(T('investigation')).last(); await e.locator(T('investigation-clarify')).waitFor();
  const q = await e.locator(T('clarify-question')).textContent();
  assert(/Which equipment or location/.test(q) && /What was observed, and when/.test(q), `short clarification: ${q}`);
  assert((await e.locator(T('clarify-context')).textContent()).includes('its going to blow'), 'observation context carried into the conversation');
  // In the Investigation window, before answering.
  await e.locator(T('open-concern')).click(); await closeA(p);
  await p.waitForSelector(T('concern-response'));
  assert((await p.textContent(T('concern-label'))).includes('its going to blow'), 'context label');
  assert((await p.getAttribute(`${T('concern-bar')} ${T('analysis-status')}`, 'data-status')) === 'clarification', 'needs clarification');
  assert((await p.textContent(T('concern-title'))) === 'its going to blow', 'original wording');
  assert((await p.textContent(T('urgency-label'))).includes('Urgent wording') && (await p.textContent(T('certainty-label'))).includes('Unverified'), 'urgency and certainty separate');
  assert((await p.getAttribute(T('concern-next'), 'data-action')) === 'clarify', 'clarification is the next step');
  assert((await p.textContent(T('concern-why-none'))).includes('clarification'), 'explains why no recommendation');
  assert((await p.textContent(T('concern-no-assessment'))).includes('has not assessed'), 'no assessment claimed');
  const cur = await p.textContent(T('current-evidence'));
  assert(cur.includes('neither confirms this report nor rules it out') && await p.locator(T('current-reading')).count() >= 3, 'current evidence beside the concern, not dismissing it');
  // Answer in the Assistant; same record.
  await p.click(T('next-clarify')); await p.waitForSelector(T('clarify-send'));
  await p.locator(T('investigation')).last().locator(T('clarify-D-0001')).click();
  await p.locator(T('investigation')).last().locator(T('clarify-text')).fill('Operator saw the vessel shaking a few minutes ago');
  await p.locator(T('investigation')).last().locator(T('clarify-send')).click();
  await waitStatus(p, 'complete');
  const inv2 = await lastInv(p); const r = await rec(p);
  assert(inv2.id === inv.id && r.investigations.length === before.investigations?.length + 1 || r.investigations.length === 1, 'same investigation');
  const ev = r.events.find((x) => x.id === inv.observationEventId);
  assert(ev.title === 'its going to blow' && ev.by.includes('N. Al-Harbi') && ev.meta.sourceDetail === 'Radio call', 'original wording and attribution unchanged');
  assert(inv2.clarification.answerText.includes('vessel shaking') && inv2.context.equipmentId === 'D-0001', 'answer linked to the same record');
  assert(r.events.some((x) => x.title.startsWith('Clarification requested')) && r.events.some((x) => x.title.startsWith('Clarification answered') && x.meta.investigationId === inv.id), 'request and answer in the timeline');
  const resp = inv2.responses.at(-1);
  assert(resp.humanReview && !resp.suggestion, 'not assessed as a claim; no recommendation');
  assert(/cannot test/.test(resp.finding) && /neither confirms the concern nor rules it out/.test(resp.finding), `limitation stated: ${resp.finding}`);
  assert(r.events.filter((x) => x.kind === 'alert').length >= alerts0 && !r.events.some((x) => x.kind === 'alert' && /blow/.test(x.title)), 'no alert created from wording');
  assert(!/depressuri[sz]e|evacuate|shut/i.test(resp.finding), 'no engineering instruction from wording');
  await p.click(T('assistant-close')); await p.waitForSelector(T('concern-response'));
  assert((await p.getAttribute(T('concern-outcome'), 'data-kind')) === 'review', 'needs human review');
  assert((await p.textContent(T('concern-next-text'))).includes('prompt human attention'), 'prompt human attention stated');
  assert((await p.locator(T('assessed-note')).textContent()).includes('does not mean verified'), 'assessed is not verified');
  await p.screenshot({ path: `${OUT}/concern-1440-light.png` });
});

await step('p: evidence-backed assessment: observation to response to original document and back; tabs stay on the concern; reload keeps the links', async () => {
  const p = await fresh(); await training(p, 4);
  await report(p, 'Deluge DS-029 has no water at the propane area', { equipment: 'DS-029', source: 'field', detail: 'Fire team leader' }); await p.waitForSelector(T('obs-confirm'));
  await waitStatus(p, 'complete'); await closeA(p);
  await openObs(p);
  const row = personRow(p).first();
  assert((await row.locator(T('analysis-status')).getAttribute('data-status')) === 'assessed', 'assessed');
  assert(/Recommendation available|Conflicting evidence/.test(await row.locator(T('observation-outcome')).textContent()), 'outcome summary');
  await row.locator('.sr-row-main').click(); await p.waitForSelector(`${T('issue-panel')}[data-issue="deluge"]`);
  const inv = await lastInv(p);
  // A linked report opens its issue, with the report you clicked marked and ECC's assessment of it beneath.
  const mine = p.locator(`${T('issue-panel')} [data-opened]`);
  assert(await mine.count() === 1 && (await mine.textContent()).includes('no water') && (await p.evaluate(() => window.__ecc.store.getState().selectedInvestigationId)) === inv.id, 'the issue opens with the report marked');
  assert(await p.locator(T('decision-form')).count() === 1, 'existing decision workflow, in the issue');
  await p.waitForSelector(T('concern-response'));
  await p.click(T('concern-to-sources')); await p.waitForSelector(`${T('sources')}[data-scope="concern"]`);
  const used = p.locator(`${T('sources-used')} ${T('source-row')}`);
  const kinds = await used.evaluateAll((els) => els.map((x) => x.getAttribute('data-kind')));
  assert(kinds.includes('reported-observation') && kinds.includes('reading') && kinds.includes('document'), `human report, reading and document: ${kinds}`);
  const docRow = p.locator(`${T('source-row')}[data-kind="document"]`).first();
  assert((await docRow.locator(T('source-identity')).textContent()).includes('Rev ') && (await docRow.locator(T('source-supports')).textContent()).length > 15, 'identity and what it supports');
  const pinned = inv.responses.at(-1).documents[0];
  await docRow.locator(T('cite-view')).click(); await p.waitForSelector(`${T('viewer')}[data-rendered="true"]`, { timeout: 20000 });
  const v = await p.evaluate(() => window.__ecc.store.getState().viewer);
  assert(v.docId === pinned.docId && v.revision === pinned.revision && v.page === pinned.page, 'original evidence at the cited revision and page');
  assert((await p.textContent(T('concern-label'))).includes('no water'), 'selection survives opening the document');
  assert(await p.locator(T('viewer-overlay')).count() === 1, 'the document opens in a dialog'); await p.click(`${T('viewer-overlay')} ${T('viewer-close')}`);
  await p.click(T('concern-to-sources')); await p.waitForSelector(T('evidence-dialog'));
  await p.locator(`${T('source-row')}[data-kind="reading"] ${T('source-inspect')}`).first().click(); await p.waitForSelector(T('trend-close')); await p.click(T('trend-close'));
  await p.click(T('concern-to-sources')); await p.waitForSelector(T('evidence-dialog'));
  await p.locator(`${T('source-row')}[data-kind="reported-observation"] ${T('source-inspect')}`).click(); assert(await p.locator(T('source-details')).count() === 1, 'a report has its own inspection view');
  assert(await p.locator(T('sources-other')).count() <= 1, 'other material kept apart');
  // Reload.
  await p.reload(); await p.waitForSelector(T('dock'));
  await p.click(T('evidence-back')).catch(() => {});
  await p.waitForSelector(`${T('issue-panel')}[data-issue="deluge"] [data-opened]`);
  assert((await p.textContent(`${T('issue-panel')} [data-opened]`)).includes('no water'), 'the opened report survives reload');
  assert((await p.locator(T('concern-open-recommendation')).count()) === 1, 'link to the recommendation survives reload');
});

await step('q: report conflicting with readings shows conflict as the outcome; tab scope is never misleading', async () => {
  const p = await fresh(); await training(p, 3);
  await report(p, 'D-0001 pressure is falling, says the field team', { equipment: 'D-0001' }); await p.waitForSelector(T('obs-confirm'));
  await waitStatus(p, 'complete'); await closeA(p);
  await p.click(T('nav-situation')); await p.click(T('view-updates')); await p.click(T('alert-a2-1')); await p.waitForSelector(`${T('issue-panel')}[data-issue="fire"]`);
  await p.click(`${T('related')} > summary`); await p.click(T('related-in-feed'));
  assert(await p.locator('.sr-row[data-origin="person"]').count() === 0, 'a report on other equipment is not shown as if it were about this issue');
  await p.click(T('feed-scope'));
  const row = personRow(p);
  assert((await row.locator(T('observation-outcome')).textContent()) === 'Conflicting evidence requires review', 'conflict outcome');
  assert(/D-0001/.test(await row.textContent()), 'its equipment is named');
  await row.locator('.sr-row-main').click(); await p.waitForSelector(T('concern-response'));
  assert(await p.locator(T('concern-conflict')).count() === 1, 'both sides shown');
  assert(await p.locator(`${T('issue-panel')} [data-opened] ${T('concern-label')}`).count() === 1 && await p.locator(`${T('opened-assessment')} ${T('concern-conflict')}`).count() === 1, 'the report you opened is marked, and the conflict is its own assessment, beneath it, not the issue response');
  await p.screenshot({ path: `${OUT}/conflict-tab-1440-light.png` });
});

await step('r: an observation requiring no additional response says why; not called verified', async () => {
  const p = await fresh(); await training(p, 1);
  await report(p, 'FH-01 header pressure is steady', { equipment: 'FH-01', source: 'control-room' }); await p.waitForSelector(T('obs-confirm'));
  await waitStatus(p, 'complete'); await closeA(p);
  await openObs(p); const row = personRow(p);
  assert((await row.locator(T('observation-outcome')).textContent()) === 'No additional response identified', 'outcome');
  await row.locator('.sr-row-main').click(); await p.waitForSelector(T('concern-response'));
  assert((await p.textContent(T('concern-why-none'))).includes('matches the current reading'), 'reason');
  assert((await p.getAttribute(T('concern-next'), 'data-action')) === 'none', 'no action required');
  assert((await p.textContent(T('concern-attribution'))).includes('FH-01'), 'attributed');
  assert((await p.textContent(T('assessed-note'))).includes('does not mean verified'), 'not verification');
});

await step('s: pending while paused: saved, honest, existing Resume; failed analysis retries without duplicates', async () => {
  const p = await fresh(); await training(p, 2);
  await p.click(T('agent-status')); await p.locator('button:has-text("Pause")').first().click(); await p.keyboard.press('Escape'); await sleep(200);
  await report(p, 'D-0029 level is falling', { equipment: 'D-0029' }); await p.waitForSelector(T('obs-confirm')); await closeA(p);
  await openObs(p); const row = personRow(p).first();
  assert((await row.locator(T('analysis-status')).getAttribute('data-status')) === 'awaiting', 'awaiting analysis');
  assert((await row.getAttribute('data-place')) === 'joins' && /Added to/.test(await row.textContent()), 'goes straight into its issue, even before ECC assesses it');
  await row.locator('.sr-row-main').click(); await p.waitForSelector(T('concern-response'));
  assert((await p.textContent(T('concern-next-text'))).includes('agent is paused'), 'why it is pending');
  assert((await p.textContent(T('concern-no-assessment'))).includes('has not considered'), 'not considered, honestly');
  assert((await p.getAttribute(T('agent-status'), 'data-state')) === 'paused', 'stays paused');
  await p.click(T('next-resume')); await waitStatus(p, 'complete');
  assert((await rec(p)).agentRuns.length === 1, 'resumed, not a new run');
  // Failure: retrieval down on a report only Knowledge could help with.
  await p.click(T('facil-simulate')); await p.click(T('facil-simfail')); await p.keyboard.press('Escape');
  await report(p, 'Smoke seen near FH-01', { equipment: 'FH-01' }); await p.waitForSelector(T('obs-confirm'));
  await waitStatus(p, 'failed');
  const r1 = await rec(p); const inv = r1.investigations.at(-1);
  assert(r1.events.some((x) => x.id === inv.observationEventId), 'observation preserved');
  await p.locator(T('investigation')).last().locator(T('investigation-failed')).waitFor();
  await p.click(T('facil-simulate')); await p.click(T('facil-simfail')); await p.keyboard.press('Escape');
  await p.locator(T('investigation')).last().locator(T('investigation-retry')).click();
  await waitStatus(p, 'complete');
  const r2 = await rec(p);
  assert(r2.investigations.length === r1.investigations.length && r2.events.filter((x) => x.meta?.userSubmitted).length === r1.events.filter((x) => x.meta?.userSubmitted).length, 'retry adds no duplicate');
});

await step('t: recording does not verify, acknowledge, approve or resolve; history and exports keep the links', async () => {
  const p = await fresh(); await training(p, 4);
  const pre = await p.evaluate(() => window.__ecc.store.getState().alertUser);
  await report(p, 'Deluge DS-029 is not working', { equipment: 'DS-029' }); await p.waitForSelector(T('obs-confirm')); await waitStatus(p, 'complete');
  const st = await p.evaluate(() => window.__ecc.store.getState());
  assert(!Object.values(st.alertUser).some((u) => u.ackAt || u.decision) && JSON.stringify(pre) === JSON.stringify(st.alertUser), 'no acknowledgement or decision');
  assert(st.records[st.incidentId].status === 'active', 'not resolved');
  const json = await p.evaluate(async () => { const s = window.__ecc.store.getState(); const { incidentJson } = await import('/src/record/exports.ts'); return JSON.parse(await incidentJson(s.records[s.incidentId], Date.now()).text()); });
  const f = json.observationFollowThrough[0];
  assert(f.analysis === 'Assessed' && f.outcome && f.recommendationAlertId === 'a4-1' && f.evidenceReported && f.simulated && f.observationEventId, `structured export links: ${JSON.stringify(f).slice(0, 200)}`);
  // Set aside, then read it as history.
  const id = st.incidentId;
  await p.evaluate(async () => { const s = window.__ecc.store.getState(); await s.resolveIncident({ t: Date.now(), summary: 'Done', rationale: 'Done', evidence: [], outstanding: [], followUp: [] }); await window.__ecc.store.getState().closeIncident('Finished', []); window.__ecc.store.getState().setDialog(null); window.__ecc.store.getState().returnToWorkspace(); });
  await p.evaluate((rid) => { const s = window.__ecc.store.getState(); s.setKnowledgeView('incidents', rid); s.setNav('knowledge'); }, id);
  await p.waitForSelector(T('incident-timeline'));
  await p.fill(`${T('incident-timeline')} ${T('timeline-search')}`, 'is not working');
  const row = p.locator(`${T('incident-timeline')} ${T('timeline-row')}[data-kind="observation"]`);
  assert((await row.locator(T('timeline-analysis')).textContent()).includes('Analysis: Assessed'), 'analysis in history');
  await row.locator(`${T('history-assessment')} > summary`).click();
  assert((await row.locator(T('history-assessment')).textContent()).length > 40, 'assessment readable in history');
});

await step('u: affected views in both themes and sizes', async () => {
  for (const [w, h] of [[1440, 900], [1366, 768]]) {
    const p = await fresh({ w, h }); await training(p, 4);
    await report(p, 'its going to blow', { source: 'field' }); await p.waitForSelector(T('obs-confirm')); await waitStatus(p, 'needs-clarification');
    await report(p, 'Deluge DS-029 is not working', { equipment: 'DS-029', detail: 'Fire team' }); await p.waitForSelector(T('obs-confirm')); await waitStatus(p, 'complete');
    await closeA(p);
    for (const theme of ['light', 'dark']) {
      await p.evaluate((x) => window.__ecc.store.getState().setTheme(x), theme); await sleep(150);
      await p.evaluate(() => { const s = window.__ecc.store.getState(); s.setNav('situation'); const i = s.records[s.incidentId].investigations; s.selectConcern(i[1].id, 'response'); });
      await sleep(200); await p.screenshot({ path: `${OUT}/report-feed-${w}-${theme}.png` });
      for (const tab of ['response', 'sources']) {
        await p.evaluate((t) => window.__ecc.store.getState().setResponseTab(t), tab); await sleep(150);
        const bad = await p.evaluate(() => { const win = document.querySelector('[data-testid="evidence-dialog"]') ?? document.querySelector('[data-testid="update-panel"]') ?? document.querySelector('[data-testid="issue-panel"]'); const wr = win.getBoundingClientRect(); const out = []; for (const el of win.querySelectorAll('button, .chip, .srcrow, .concern-next')) { const r = el.getBoundingClientRect(); if (r.width && (r.right > wr.right + 1 || r.left < wr.left - 1)) out.push(el.textContent.slice(0, 30)); } return { out, h: document.documentElement.scrollWidth > innerWidth }; });
        assert(!bad.out.length && !bad.h, `${w} ${theme} ${tab}: ${bad.out.join(', ')}`);
        await p.screenshot({ path: `${OUT}/report-${tab}-${w}-${theme}.png` });
      }
      await p.evaluate(() => { const s = window.__ecc.store.getState(); const i = s.records[s.incidentId].investigations; s.selectConcern(i[0].id, 'response'); }); await sleep(200);
      await p.screenshot({ path: `${OUT}/tab-clarify-${w}-${theme}.png` });
    }
    await p.context().close();
  }
});

await step('v: Report an observation: one question, equipment if known, Save report; one clear result, with View report; it always lands in Open issues', async () => {
  const p = await fresh(); await training(p, 4);
  await openPanel(p); await p.click(T('mode-report'));
  assert(await p.locator(`${T('obs-form')} :is(input, select, textarea):visible`).count() === 2 && (await p.textContent(T('obs-submit'))) === 'Save report', 'one short form: what happened, equipment if known, Save report');
  // Known equipment: added to its issue at once, and it stays there while ECC finishes its assessment.
  await p.fill(T('obs-text'), 'Water now visible at the DS-029 nozzles'); await p.selectOption(T('obs-equipment'), 'DS-029'); await p.click(T('obs-submit'));
  await p.waitForSelector(T('obs-result'));
  const r1 = await p.textContent(T('obs-result'));
  assert(r1 === 'Added to “Deluge on the propane area: no water flow”', `known equipment: ${r1}`);
  await sleep(4000); assert(await p.textContent(T('obs-result')) === r1, 'the result holds while ECC assesses the report');
  await p.click(T('obs-view')); await p.waitForSelector(`${T('issue-panel')}[data-issue="deluge"] [data-opened]`);
  await p.keyboard.press('Escape'); await p.click(T('obs-done'));
  // Equipment not known: saved to Incident Updates for review; leave it and carry on.
  await p.fill(T('obs-text'), 'Strong smell of gas near the north gate'); await p.click(T('obs-submit'));
  await p.waitForSelector(T('obs-result'));
  assert(await p.textContent(T('obs-result')) === 'Added to Open issues as a new issue: “Strong smell of gas near the north gate”', `unknown equipment: a new issue (${await p.textContent(T('obs-result'))})`);
  await p.click(T('obs-view')); await p.waitForSelector(`${T('issue-panel')} [data-opened]`);
  assert(await p.locator(T('review-list')).count() === 0, 'nothing waits in Needs review');
  await p.keyboard.press('Escape'); await p.click(T('obs-done'));
  assert(await p.locator(T('obs-confirm')).count() === 0 && await p.inputValue(T('obs-text')) === '', 'the form is ready for the next one');
  await p.context().close();
});

await browser.close();
if (errors.length) { fail++; console.log('FAIL console errors:', [...new Set(errors)].slice(0, 5).join(' | ').slice(0, 800)); }
console.log(`\n${pass} passed, ${fail} failed. Screenshots in ${OUT}`);
