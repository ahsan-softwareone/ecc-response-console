// Focused checks for the Incident Overview (Incident Manager briefing).
// Usage: node scripts/verify-overview.mjs [--only=a,b,...]   Needs the dev server on 5189.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const URL = 'http://localhost:5189/';
const OUT = process.env.SHOTS_DIR ?? resolve(tmpdir(), 'ecc-overview');
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
const settle = async (p) => { await p.evaluate(() => { const { store, setClockSkew } = window.__ecc; const s = store.getState(); const k = s.skewMs + 60000; store.setState({ skewMs: k }); setClockSkew(k); }); await sleep(2500); };
const training = async (p, steps) => { await p.click(T('start-training')); await p.click(T('start-submit')); await p.waitForSelector(T('dock')); await p.click(T('view-updates')); for (let i = 1; i < steps; i++) { await p.click(T('facil-next')); await sleep(150); } await settle(p); };
const signIn = async (p, who = 'im') => { await p.click(T('user-menu')); await p.click(T(who === 'im' ? 'persona-im' : 'persona-shift')); await p.keyboard.press('Escape'); };
/** Everything the workflow records about the incident, except what the scenario itself keeps adding. */
const workflow = (p) => p.evaluate(() => { const s = window.__ecc.store.getState(); const r = s.records[s.incidentId]; return JSON.stringify({ alertUser: s.alertUser, status: r?.status, severity: r?.severity ?? null, user: r?.events.filter((e) => e.source === 'user' || e.kind === 'decision' || e.kind === 'acknowledgement' || e.kind === 'severity').map((e) => e.id), runs: r?.agentRuns?.map((x) => x.status) }); });
async function step(name, fn) {
  if (!want(name.split(':')[0])) return;
  try { await fn(); pass++; console.log('PASS', name); } catch (e) { fail++; console.log('FAIL', name, '-', String(e.message ?? e).split('\n').slice(0, 3).join(' ')); }
}

await step('a: no active incident: the Incident Manager lands on a calm empty briefing with the existing actions', async () => {
  const p = await fresh(); await signIn(p);
  assert((await p.locator(`${T('nav-overview')}[aria-current="page"]`).count()) === 1, 'Overview tab current');
  await p.waitForSelector(T('overview-empty'));
  for (const id of ['start-incident', 'start-training', 'browse-history']) assert(await p.locator(T(id)).count() === 1, id);
  for (const id of ['nav-situation', 'nav-sitrep', 'nav-agentlog', 'nav-knowledge']) assert(await p.locator(T(id)).count() === 1, `${id} visible`);
});

const qd = (p) => p.locator(T('quick-detail'));
const openLead = async (p) => { await p.locator(T('ov-item')).first().click(); await p.waitForSelector(T('issue-panel')); };

await step('b: early state, one layout: identity, severity, headline and cards, the priority action; Quick detail and focus return', async () => {
  const p = await fresh({ w: 1366, h: 768 }); await training(p, 1);
  const before = await workflow(p);
  await signIn(p); await p.waitForSelector(T('page-overview'));
  assert(await p.locator(T('ov-layout')).count() === 0 && await p.locator(T('layout-brief')).count() === 0, 'one layout, no switch');
  assert((await p.textContent(T('ov-title'))).includes('Drone interception') && (await p.textContent(T('ov-area'))) === 'SG GSP' && /Briefing as of \d\d:\d\d/.test(await p.textContent(T('ov-asof'))) && (await p.textContent(T('ov-training'))) === 'Training exercise', 'identity and as-of');
  assert((await p.textContent(T('incident-severity'))).includes('Not yet assessed'), 'severity not yet assessed');
  assert(/Drone intercepted at north perimeter/.test(await p.textContent(T('ov-headline'))), `headline: ${await p.textContent(T('ov-headline'))}`);
  assert((await p.textContent(T('ov-para'))) === 'No equipment damage has been reported.' && !/await|recommendations? |verification/i.test(await p.textContent(T('ov-summary'))), `Incident details says what is happening, with no counts of pending work: ${await p.textContent(T('ov-para'))}`);
  const cards = await p.locator(T('ov-card')).count(); assert(cards >= 1 && /no damage reported/i.test(await p.textContent(T('ov-card-note'))), 'D-0029 card: exposure, no damage reported');
  // Requires attention previews Open issues: up to three uniform rows, the same issues, titles and statuses as the Situation Room.
  const rows = p.locator(T('ov-item'));
  const n = await rows.count();
  assert(n >= 1 && n <= 3 && await p.locator('.ob-lead').count() === 0 && await p.locator('text=Quick look').count() === 0, `up to three rows, no featured card (${n})`);
  const heights = await rows.evaluateAll((els) => [...new Set(els.map((e) => Math.round(e.getBoundingClientRect().height)))]);
  assert(heights.length === 1, `uniform rows (${heights})`);
  assert(/^Decide: confirm personnel are clear/i.test(await rows.first().locator(T('ov-item-next')).textContent()) && (await rows.first().locator(T('ov-item-status')).textContent()) === 'Awaiting decision', `first row: the next step (${await rows.first().locator(T('ov-item-next')).textContent()})`);
  assert(/View open issues \(\d+\)/.test(await p.textContent(T('ov-attention-all'))), 'View open issues (n)');
  for (const id of ['ov-title', 'incident-severity', 'ov-headline', 'ov-card']) { const b = await p.locator(T(id)).first().boundingBox(); assert(b.y + b.height < 730, `${id} in the first viewport`); }
  await openLead(p);
  assert(await p.locator(T('recommendation')).count() === 1 && /Back to Overview/.test(await p.textContent(T('ov-return-btn'))), 'Open issue goes straight to the issue, with the way back');
  await p.click(T('ov-return-btn')); await p.waitForSelector(T('page-overview')); await sleep(100);
  assert(+(await p.getAttribute(T('event-chart'), 'data-milestones')) === 1, 'one milestone');
  await p.locator(T('ec-marker')).first().click(); await p.waitForSelector(T('quick-detail'));
  assert(/Security control/.test(await qd(p).locator(T('qd-source')).textContent()), 'first milestone: the security report is the key source');
  await p.click(T('qd-close'));
  assert((await workflow(p)) === before, 'viewing changed nothing recorded');
});

await step('c: later state: Review decision -> Quick detail -> exact recommendation -> back; milestone -> Quick detail -> exact source -> back', async () => {
  const p = await fresh({ w: 1366, h: 768 }); await training(p, 5);
  await p.click(T('alert-a5-1')); await p.click(T('decide-approved')); await p.fill(T('rationale'), 'Hold FH-01; assess the upstream route'); await p.click(T('record-decision')); await sleep(300);
  for (let i = 0; i < 2; i++) { await p.click(T('facil-next')); await sleep(150); } await settle(p);
  await signIn(p); await p.waitForSelector(T('page-overview'));
  const before = await workflow(p);
  const card = p.locator(T('ov-card')).filter({ hasText: 'D-0029' });
  assert((await card.locator(T('ov-card-condition')).textContent()) === 'Fire reported contained' && (await card.locator(T('ov-card-note')).textContent()) === 'Verification pending', 'reported containment stays qualified');
  assert((await p.textContent(T('ov-headline'))) === 'Fire at D-0029 reported contained. Deluge coverage remains unconfirmed.', `headline: ${await p.textContent(T('ov-headline'))}`);
  const dsc = p.locator(T('ov-card')).filter({ hasText: 'DS-029' });
  assert((await dsc.locator(T('ov-card-condition')).textContent()) === 'Coverage unconfirmed' && /Reset to standby/.test(await dsc.locator(T('ov-card-note')).textContent()), 'reset to standby stays on the card with its qualification');
  const drow = p.locator(`${T('ov-item')}[data-issue="deluge"]`);
  assert(/^Decide: treat deluge coverage as unconfirmed/.test(await drow.locator(T('ov-item-next')).textContent()), `the deluge issue: decide (${await drow.locator(T('ov-item-next')).textContent()})`);
  const pre = await p.evaluate(() => JSON.stringify(window.__ecc.store.getState().alertUser));
  await drow.click(); await p.waitForSelector(`${T('issue-panel')}[data-issue="deluge"]`);
  assert(await p.locator(T('decision-form')).count() === 1 && /Treat deluge coverage as unconfirmed/.test(await p.textContent(T('recommendation'))), 'opens the issue with the exact suggestion and the decision form');
  assert(pre === await p.evaluate(() => JSON.stringify(window.__ecc.store.getState().alertUser)), 'opening changed nothing');
  assert(/← Back to Overview$/.test((await p.textContent(T('ov-return-btn'))).trim()), 'one way back to the Overview');
  await p.click(T('ov-return-btn')); await p.waitForSelector(T('page-overview'));
  const heads = await p.locator(`${T('ec-label')} b`).allTextContents();
  assert(heads.includes('Depressurization recommendation accepted') && heads.includes('D-0029 fire reported contained') && heads.includes('Deluge DS-029 shows no flow'), `headlines: ${heads.join(' | ')}`);
  assert(await p.locator(T('ov-now')).count() === 0, 'no Now marker');
  await p.locator(T('ec-marker')).filter({ hasText: 'Depressurization recommendation accepted' }).click(); await p.waitForSelector(T('quick-detail'));
  assert(/Decision/i.test(await qd(p).locator(T('qd-source')).textContent()), 'decision milestone: the decision is the key source');
  await qd(p).locator(T('qd-full')).click(); await p.waitForSelector(`${T('issue-panel')}[data-issue="pressure"]`);
  assert(/Accepted.*Hold depressurization via FH-01/.test(await p.textContent(T('lane-decision'))), 'the decision is in the issue’s response so far');
  await p.click(T('ov-return-btn')); await p.waitForSelector(T('quick-detail'));
  assert(/^Depressurization recommendation accepted/.test(await qd(p).locator(T('qd-title')).textContent()), 'back to the milestone Quick detail');
  await p.click(T('qd-close'));
  assert((await workflow(p)) === before, 'workflow state unchanged');
});

await step('d: fast-advanced incident: same-minute developments on separate stems; status cards; verification row; full timeline; dependencies', async () => {
  const p = await fresh({ w: 1366, h: 768 }); await training(p, 7); await signIn(p); await p.waitForSelector(T('page-overview'));
  const heads = await p.locator(`${T('ec-label')} b`).allTextContents();
  const want = ['Drone intercepted at north perimeter', 'Fire reported at D-0029', 'Deluge DS-029 shows no flow', 'D-0001 pressure exceeds High limit', 'Flare header FH-01 damaged', 'D-0001 depressurization started', 'D-0029 fire reported contained'];
  assert(JSON.stringify(heads) === JSON.stringify(want), `turning points in order: ${heads.join(' | ')}`);
  const quals = await p.locator(`${T('ec-label')} small`).allTextContents();
  assert(quals.includes('Independent verification pending') && quals.some((q) => /reported, not verified/.test(q)), `qualifiers keep reported/measured: ${quals.join(' | ')}`);
  const ds = p.locator(T('ov-card')).filter({ hasText: 'DS-029' });
  assert((await ds.locator(T('ov-card-condition')).textContent()) === 'Coverage unconfirmed', 'deluge card');
  await ds.click(); await p.waitForSelector(T('quick-detail'));
  assert(/flow transmitter reads 0\.0/.test(await qd(p).locator(T('qd-why')).textContent()), 'card Quick detail: why it matters from the record');
  await p.click(T('qd-close'));
  const vrow = p.locator(`${T('ov-item')}[data-issue="fire"]`);
  assert(/^Verify: D-0029 fire reported contained/.test(await vrow.locator(T('ov-item-next')).textContent()), `the condition (reported contained) and the next step (verify it) are told apart: ${await vrow.locator(T('ov-item-next')).textContent()}`);
  await vrow.click(); await p.waitForSelector(`${T('issue-panel')}[data-issue="fire"]`);
  assert(/reports the fire at D-0029 is contained/.test(await p.textContent(T('issue-panel'))), 'the field report is in view in its issue');
  await p.click(T('ov-return-btn')); await p.waitForSelector(T('page-overview'));
  await p.click(T('ov-full-timeline')); await p.waitForSelector(T('timeline-row'));
  const rows = await p.locator(T('timeline-row')).count();
  assert(rows > heads.length * 3, `full timeline is the complete chronology (${rows} rows)`);
  await p.click(T('ov-return-btn')); await p.waitForSelector(T('page-overview'));
  await p.click(T('ov-deps')); await p.waitForSelector(T('ov-equipment'));
  assert(/Protection and relief/.test(await p.textContent(T('ov-equipment'))), 'dependencies on demand');
  await p.keyboard.press('Escape');
  await p.click(T('ov-record')); await p.waitForSelector(T('qd-notification')); await p.keyboard.press('Escape');
});

await step('e: severity: assessed from the header (not an issue, so not in Requires attention); who and when; separate from alert severity and lifecycle', async () => {
  const p = await fresh(); await training(p, 4); await signIn(p); await p.waitForSelector(T('page-overview'));
  const alertsBefore = await p.evaluate(() => { const s = window.__ecc.store.getState(); return s.records[s.incidentId].events.filter((e) => e.kind === 'alert').map((e) => `${e.id}:${e.severity}`).join(); });
  assert(await p.locator(`${T('ov-item')}[data-kind="assessment"]`).count() === 0, 'severity is not an issue, so it is not in Requires attention');
  await p.click(T('severity-assess')); await p.waitForSelector(T('severity-panel'));
  assert((await p.textContent(T('severity-panel'))).includes('Illustrative tier scale'), 'scale named honestly');
  await p.click(T('severity-tier-2')); await p.fill(T('severity-reason'), 'Fire with escalation to the adjacent separator'); await p.click(T('severity-record'));
  await p.waitForFunction(() => document.querySelector('[data-testid="incident-severity"]')?.getAttribute('data-assessed') === 'true');
  const badge = await p.textContent(T('incident-severity'));
  assert(badge.includes('Tier 2') && badge.includes('S. Al-Qahtani'), `who: ${badge}`);
  const r = await p.evaluate(() => { const s = window.__ecc.store.getState(); return s.records[s.incidentId]; });
  assert(r.severity.by.includes('Incident Manager') && r.status === 'active' && r.events.some((e) => e.kind === 'severity'), 'recorded, lifecycle unchanged');
  assert(r.events.filter((e) => e.kind === 'alert').map((e) => `${e.id}:${e.severity}`).join() === alertsBefore, 'alert severities unchanged');
});

await step('f: only what is known at the current stage; event and received times when they differ', async () => {
  const p = await fresh(); await training(p, 3); await signIn(p); await p.waitForSelector(T('page-overview'));
  const all = await p.textContent(T('page-overview'));
  for (const future of ['contained', 'below High limit', 'no flow', 'flare header damaged', 'Upstream route aligned']) assert(!all.includes(future), `no future: ${future}`);
  await p.click(T('assistant-toggle')); await p.click(T('mode-report'));
  await p.fill(T('obs-text'), 'Field team saw smoke at D-0001 earlier'); await p.selectOption(T('obs-equipment'), 'D-0001');
  await p.click(`${T('obs-more')} > summary`); await p.click(T('obs-time-edit'));
  const early = await p.evaluate(() => { const { store } = window.__ecc; const d = new Date(Date.now() + store.getState().skewMs - 600000); const z = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${z(d.getMonth() + 1)}-${z(d.getDate())}T${z(d.getHours())}:${z(d.getMinutes())}`; });
  await p.fill(T('obs-time'), early); await p.click(T('obs-submit')); await p.waitForSelector(T('obs-confirm')); await p.click(T('assistant-close'));
  await p.waitForFunction(() => [...document.querySelectorAll('[data-testid="ec-marker"]')].some((x) => /smoke at D-0001/.test(x.getAttribute('aria-label'))), null, { timeout: 15000 });
  await p.locator(T('ec-marker')).filter({ hasText: 'smoke at D-0001' }).click(); await p.waitForSelector(T('quick-detail'));
  const k = await qd(p).locator(T('qd-known')).textContent();
  assert(/Event \d\d:\d\d · received \d\d:\d\d/.test(k) && /not verified/.test(await qd(p).locator(T('qd-status')).textContent()), `both times, reported: ${k}`);
  await p.keyboard.press('Escape');
});

await step('g: both layouts, both themes, 1366x768 and 1440x900, early and later', async () => {
  for (const [w, h] of [[1366, 768], [1440, 900]]) {
   for (const stage of [1, 7]) {
    const p = await fresh({ w, h }); await training(p, stage); await signIn(p); await p.waitForSelector(T('page-overview'));
    for (const layout of ['story']) {
     for (const theme of ['light', 'dark']) {
      await p.evaluate((x) => window.__ecc.store.getState().setTheme(x), theme); await sleep(200);
      await p.evaluate(() => { document.querySelector('[data-testid="page-overview"]').scrollTop = 0; }); await sleep(100);
      const audit = await p.evaluate(() => { const pg = document.querySelector('[data-testid="page-overview"]'); const pr = pg.getBoundingClientRect(); const bad = []; for (const el of pg.querySelectorAll('section, .ob-card, .ob-row, .ob-lead')) { const r = el.getBoundingClientRect(); if (r.width && (r.right > pr.right + 1 || r.left < pr.left - 1)) bad.push(el.getAttribute('data-testid') || el.className); } const ls = [...document.querySelectorAll('[data-testid="ec-label"]')].map((e) => e.getBoundingClientRect()); let overlap = 0; for (let i = 0; i < ls.length; i++) for (let j = i + 1; j < ls.length; j++) { const a = ls[i], b = ls[j]; if (a.left < b.right - 2 && b.left < a.right - 2 && a.top < b.bottom - 2 && b.top < a.bottom - 2) overlap++; } const lEls = [...document.querySelectorAll('[data-testid="ec-label"]')]; const times = [...document.querySelectorAll('[data-testid="ec-marker"] time')].map((e) => ({ r: e.getBoundingClientRect(), own: e.closest('[data-testid="ec-label"]') })); for (const { r: t, own } of times) for (const [k, l] of ls.entries()) if (lEls[k] !== own && t.left < l.right - 2 && l.left < t.right - 2 && t.top < l.bottom - 2 && l.top < t.bottom - 2) overlap++; const clipped = [...document.querySelectorAll('[data-testid="ec-label"] b, [data-testid="ov-card-condition"], [data-testid="ov-headline"]')].filter((e) => e.scrollWidth > e.clientWidth + 1).length; const shb = document.querySelector('[data-testid="ov-sequence"] .ob-sh').getBoundingClientRect().bottom; const sqb = document.querySelector('[data-testid="ov-sequence"]').getBoundingClientRect(); for (const l of ls) if (l.top < shb - 1 || l.bottom > sqb.bottom + 1) overlap++; const y = (id) => { const e = document.querySelector(`[data-testid="${id}"]`); const r = e.getBoundingClientRect(); return r.bottom; }; return { bad, overlap, clipped, page: document.documentElement.scrollWidth > innerWidth, sev: y('incident-severity'), head: y('ov-headline'), card: document.querySelector('[data-testid="ov-card"]')?.getBoundingClientRect().bottom ?? 0 }; });
      assert(!audit.overlap && !audit.clipped, `${w} ${layout} ${theme} stage ${stage}: milestone labels overlap or clip ${JSON.stringify(audit)}`);
      assert(!audit.bad.length && !audit.page, `${w} ${layout} ${theme}: overflow ${audit.bad.join(', ')}`);
      assert(audit.sev < h - 38 && audit.head < h - 38 && audit.card && audit.card < h - 38, `${w} ${theme} stage ${stage}: identity, severity, situation and first cards in the first viewport ${JSON.stringify(audit)}`);
      await p.screenshot({ path: `${OUT}/ov-s${stage}-${w}-${layout}-${theme}.png` });
      if (stage === 7) { }
      { await p.locator(T('ec-marker')).last().click(); await p.waitForSelector(T('quick-detail')); await sleep(150); await p.screenshot({ path: `${OUT}/ov-s${stage}-${w}-${layout}-${theme}-milestone.png` }); await p.keyboard.press('Escape'); await sleep(100); }
     }
    }
    await p.context().close();
   }
  }
});

await step('h: Executive brief -> Copy -> Open Sit. Rep', async () => {
  const p = await fresh(); await p.context().grantPermissions(['clipboard-read', 'clipboard-write'], { origin: URL });
  await training(p, 7); await signIn(p); await p.waitForSelector(T('page-overview'));
  assert(await p.locator(T('ov-exec')).count() === 0 && await p.locator(T('ov-exec-open-foot')).count() === 0, 'executive brief: one header action, not on the page');
  await p.click(T('ov-exec-open')); await p.waitForSelector(T('quick-detail'));
  const plain = await p.getAttribute(T('ov-exec-text'), 'data-plain');
  const L = plain.split('\n');
  assert(/^Executive brief · SG GSP · Propane recovery area · Incident severity not yet assessed \(illustrative scale\)|^Executive brief · SG GSP · Propane recovery area · Incident severity not yet assessed · As of \d\d:\d\d · Training exercise$/.test(L[0]), `context line: ${L[0]}`);
  for (const h of ['Situation', 'Impact and response', 'Open concern']) assert(L.includes(h), `heading ${h}`);
  const sec = (h) => L[L.indexOf(h) + 1];
  assert(/D-0029 fire reported contained at \d\d:\d\d; independent verification pending/.test(sec('Situation')), `situation keeps its qualifier: ${sec('Situation')}`);
  assert(/not independently verified|simulated/.test(sec('Impact and response')), `impact keeps reported vs readings: ${sec('Impact and response')}`);
  assert(/^Deluge coverage remains unconfirmed/.test(sec('Open concern')) && /awaits a decision: treat deluge coverage as unconfirmed/.test(sec('Open concern')), `open concern: ${sec('Open concern')}`);
  assert(/Reported items are not independently verified unless stated/.test(plain), 'standing qualification');
  assert(!/\([^)]*\(/.test(plain), 'no nested parentheses');
  const drawer = await p.evaluate(() => ['situation', 'impact', 'concern'].map((k) => document.querySelector(`[data-testid="ov-exec-${k}"] p`).textContent));
  assert(drawer.every((t) => plain.includes(t)) && plain.includes(await p.textContent(T('ov-exec-context'))), 'copied text matches the drawer');
  await p.screenshot({ path: `${OUT}/ov-exec-1366-light.png` });
  await p.click(T('ov-exec-copy')); await p.waitForFunction(() => /Copied|Copy failed/.test(document.querySelector('[data-testid="ov-exec-copy"]')?.textContent ?? ''));
  const clip = await p.evaluate(() => navigator.clipboard.readText().catch(() => ''));
  assert(clip === plain, 'copied text equals the brief');
  await p.click(T('ov-to-sitrep')); await p.waitForFunction(() => window.__ecc.store.getState().nav === 'sitrep');
});

await step('i: header: Incident record, Assess and Executive brief; a long title wraps beside an aligned severity block', async () => {
  const p = await fresh({ w: 1366, h: 768 }); await training(p, 7); await signIn(p); await p.waitForSelector(T('page-overview'));
  for (const theme of ['light', 'dark']) {
    await p.evaluate((x) => window.__ecc.store.getState().setTheme(x), theme); await sleep(150);
    await p.evaluate(() => { document.querySelector('[data-testid="ov-title"]').textContent = 'Drone interception with debris impact across the propane recovery and inlet separation areas, SG GSP north perimeter'; });
    await sleep(100);
    const g = await p.evaluate(() => { const r = (id) => document.querySelector(`[data-testid="${id}"]`).getBoundingClientRect(); const t = r('ov-title'), s = r('incident-severity'), e = r('ov-exec-open'), c = document.querySelector('[data-testid="ov-card"]').getBoundingClientRect(); return { lines: Math.round(t.height / parseFloat(getComputedStyle(document.querySelector('[data-testid="ov-title"]')).lineHeight)), clear: t.right <= Math.min(s.left, e.left) - 8, sevTop: Math.round(s.top - t.top), assessIn: (() => { const a = r('severity-assess'); return a.left >= s.left && a.right <= s.right && a.bottom <= s.bottom; })(), card: c.bottom < innerHeight - 38, page: document.documentElement.scrollWidth > innerWidth }; });
    assert(g.lines >= 2 && g.clear && Math.abs(g.sevTop) <= 8 && g.assessIn && g.card && !g.page, `${theme}: long title wraps, severity block aligned with Assess inside, cards visible: ${JSON.stringify(g)}`);
    await p.screenshot({ path: `${OUT}/ov-header-long-${theme}.png` });
  }
  await p.reload(); await p.waitForSelector(T('page-overview'));
  assert(!(await p.textContent(T('ov-details'))).includes('INC-'), 'incident ID is behind Incident record');
  await p.click(T('ov-record')); await p.waitForSelector(T('qd-record'));
  const rt = await p.textContent(T('qd-record'));
  assert(/INC-/.test(await p.textContent(T('qd-record-id'))) && /Received .*\d\d:\d\d/.test(await p.textContent(T('qd-notification'))) && /manual/.test(await p.textContent(T('qd-command'))), `Incident record: ID, notification, command: ${rt}`);
  await p.keyboard.press('Escape'); await p.waitForSelector(T('quick-detail'), { state: 'detached' });
  assert((await p.textContent(T('incident-severity'))).includes('Not yet assessed') && (await p.textContent(T('severity-assess'))) === 'Assess', 'Not yet assessed with Assess in the block');
  await p.click(T('incident-severity')); await p.waitForSelector(T('severity-panel')); await p.keyboard.press('Escape');
  await p.click(T('ov-exec-open')); await p.waitForSelector(T('ov-exec-text')); await p.keyboard.press('Escape');
  await p.screenshot({ path: `${OUT}/ov-header.png` });
});

await step('j: severity tiers 2 and 3 from the recorded assessment; milestone hover and focus without layout shift; both themes and sizes', async () => {
  for (const [w, h] of [[1366, 768], [1440, 900]]) {
    const p = await fresh({ w, h }); await training(p, 7); await signIn(p); await p.waitForSelector(T('page-overview'));
    assert(await p.getAttribute(T('incident-severity'), 'data-tier') === '0', 'neutral when not assessed');
    for (const [tier, why] of [[2, 'Fire with escalation to the adjacent separator'], [3, 'Relief route damaged; escalation potential']]) {
      await p.click(T('incident-severity')); await p.waitForSelector(T('severity-panel'));
      await p.click(T(`severity-tier-${tier}`)); await p.fill(T('severity-reason'), why); await p.click(T('severity-record'));
      await p.waitForFunction((t) => document.querySelector('[data-testid="incident-severity"]')?.getAttribute('data-tier') === String(t), tier);
      const v = await p.evaluate(() => { const b = document.querySelector('[data-testid="incident-severity"]'); return { label: b.querySelector('[data-testid="severity-value"]').textContent, on: [...b.querySelectorAll('.ob-bars i')].filter((i) => getComputedStyle(i).opacity === '1').length, assess: b.querySelector('[data-testid="severity-assess"]').textContent, by: b.querySelector('[data-testid="severity-by"]')?.textContent ?? '' }; });
      assert(v.label === `Tier ${tier}` && v.on === tier && v.assess === 'Reassess' && /\d\d:\d\d · S\. Al-Qahtani/.test(v.by), `tier ${tier} display: ${JSON.stringify(v)}`);
      for (const theme of ['light', 'dark']) {
        await p.evaluate((x) => window.__ecc.store.getState().setTheme(x), theme); await sleep(150);
        await p.screenshot({ path: `${OUT}/ov-tier${tier}-${w}-${theme}.png`, clip: { x: w - 560, y: 96, width: 560, height: 110 } });
      }
    }
    for (const theme of ['light', 'dark']) {
      await p.evaluate((x) => window.__ecc.store.getState().setTheme(x), theme); await sleep(150);
      const boxes = () => p.evaluate(() => ({ li: [...document.querySelectorAll('.us-ev')].map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y), Math.round(r.width), Math.round(r.height)].join(','); }), lbl: [...document.querySelectorAll('[data-testid="ec-label"]')].map((e) => { const r = e.getBoundingClientRect(); return [Math.round(r.x), Math.round(r.y)].join(','); }), sec: document.querySelector('[data-testid="ov-sequence"]').getBoundingClientRect().height, att: document.querySelector('[data-testid="ov-attention"]').getBoundingClientRect().y }));
      await p.mouse.move(5, 5); await sleep(200);
      const before = await boxes();
      const target = p.locator(T('ec-marker')).nth(2);
      await target.hover(); await sleep(250);
      const after = await boxes();
      const fx = await target.evaluate((b) => ({ bg: getComputedStyle(b.querySelector('.us-lbl')).backgroundColor, ring: getComputedStyle(b.querySelector('.us-dot')).boxShadow }));
      assert(JSON.stringify(before.li) === JSON.stringify(after.li) && before.sec === after.sec && before.att === after.att && before.lbl.every((x, i) => i === 2 || x === after.lbl[i]), `${w} ${theme}: hover causes no layout shift`);
      assert(fx.bg !== 'rgba(0, 0, 0, 0)' && fx.ring !== 'none', `${w} ${theme}: hover cue: tint and ring, nothing moves ${JSON.stringify(fx)}`);
      await p.screenshot({ path: `${OUT}/ov-hover-${w}-${theme}.png` });
      await p.mouse.move(5, 5); await p.locator(T('ec-marker')).nth(3).focus(); await p.keyboard.press('Shift+Tab'); await sleep(250);
      const focusFx = await target.evaluate((b) => b === document.activeElement && b.matches(':focus-visible') && getComputedStyle(b.querySelector('.us-dot')).boxShadow !== 'none');
      assert(focusFx, `${w} ${theme}: keyboard focus shows the same cue`);
      await p.screenshot({ path: `${OUT}/ov-focus-${w}-${theme}.png` });
      const head = await target.locator('b').textContent();
      await p.keyboard.press('Enter'); await p.waitForSelector(T('quick-detail'));
      assert((await qd(p).locator(T('qd-title')).textContent()) === head, 'Enter opens that milestone');
      await p.keyboard.press('Escape'); await sleep(100);
    }
    await p.click(T('ov-exec-open')); await p.waitForSelector(T('ov-exec-text'));
    for (const theme of ['light', 'dark']) { await p.evaluate((x) => window.__ecc.store.getState().setTheme(x), theme); await sleep(150); await p.screenshot({ path: `${OUT}/ov-exec-${w}-${theme}.png` }); }
    assert(/Incident severity Tier 3 \(illustrative scale\)/.test(await p.textContent(T('ov-exec-context'))), 'brief context carries the recorded severity');
    await p.context().close();
  }
});

await step('k: Requires attention is a preview of Open issues: one row per issue, even with two follow-ups; a closed issue leaves both lists; its equipment condition stays in Incident details', async () => {
  const p = await fresh(); await training(p, 4); await signIn(p); await p.waitForSelector(T('page-overview'));
  // Two follow-ups on the deluge issue: told with the decision, then followed up when no update came.
  await p.click(T('nav-situation')); await p.click(T('view-issues')); await p.click(`${T('issue-card')}[data-issue="deluge"]`); await p.waitForSelector(T('issue-panel'));
  await p.click(T('decide-approved')); await p.fill(T('decision-to'), 'Fire team leader'); await p.selectOption(T('decision-within'), '10'); await p.click(T('record-decision'));
  await p.evaluate(() => { const s = window.__ecc.store.getState(); const k = 'a4-1'; const c = s.alertUser[k].contacts[0]; s.addContact(k, { ...c, id: c.id + '-f', at: c.at + 60_000, via: 'Phone', followUpOf: c.id, expectBy: c.at + 120_000 }); });
  await p.keyboard.press('Escape');
  await p.click(T('nav-overview')); await p.waitForSelector(T('page-overview')); await sleep(2500);
  const rows = await p.locator(T('ov-item')).evaluateAll((els) => els.map((e) => e.dataset.issue));
  assert(rows.filter((x) => x === 'deluge').length === 1, `the issue appears once (${rows})`);
  assert((await p.textContent(`${T('ov-item')}[data-issue="deluge"] ${T('ov-item-status')}`)) === 'Awaiting field update' && /^(Get the field update|Follow up with Fire team leader)/.test(await p.textContent(`${T('ov-item')}[data-issue="deluge"] ${T('ov-item-next')}`)), 'one row, with the same status as the Situation Room and its next step');
  const n = +(await p.textContent(T('ov-attention-all'))).match(/\d+/)[0];
  await p.click(T('ov-attention-all')); await p.waitForSelector(T('worklist'));
  const list = await p.locator(T('issue-card')).evaluateAll((els) => els.map((e) => e.dataset.issue));
  assert(list.length === n && JSON.stringify(list.slice(0, 3)) === JSON.stringify(rows), `View open issues (${n}) = the list; same issues, same order`);
  await p.click(`${T('issue-card')}[data-issue="deluge"]`); await p.click(T('close-open')); await p.fill(T('close-note'), 'Mobile cooling in place; deluge fault with maintenance.'); await p.click(T('close-confirm'));
  await p.keyboard.press('Escape'); await sleep(300);
  assert(await p.locator(`${T('issue-card')}[data-issue="deluge"]`).count() === 0, 'gone from Open issues in the Situation Room');
  await p.click(T('ov-return-btn')); await p.waitForSelector(T('page-overview')); await sleep(300);
  assert(await p.locator(`${T('ov-item')}[data-issue="deluge"]`).count() === 0 && +(await p.textContent(T('ov-attention-all'))).match(/\d+/)[0] === n - 1, 'gone from the preview; the count follows');
  assert((await p.textContent(`${T('ov-card')}[data-eq="DS-029"] ${T('ov-card-condition')}`)) === 'Coverage unconfirmed', 'the equipment condition stays in Incident details');
  await p.context().close();
});

await browser.close();
if (errors.length) { fail++; console.log('FAIL console errors:', [...new Set(errors)].slice(0, 5).join(' | ').slice(0, 800)); }
console.log(`\n${pass} passed, ${fail} failed. Screenshots in ${OUT}`);
