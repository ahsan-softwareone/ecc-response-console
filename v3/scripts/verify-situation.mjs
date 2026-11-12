// Focused checks for the Situation Room: Open issues, Incident updates and the response panel.
// Usage: node scripts/verify-situation.mjs [--only=a,b,...]   Needs the dev server on 5189.
// Runs on a fixed page clock, so the scenario and the recorded times are the same on every run.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const URL = 'http://localhost:5189/';
const OUT = process.env.SHOTS_DIR ?? resolve(tmpdir(), 'ecc-situation');
await mkdir(OUT, { recursive: true });
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) ?? '').slice(7).split(',').filter(Boolean);
const want = (s) => !ONLY.length || ONLY.includes(s);
if (process.platform === 'darwin') spawn('caffeinate', ['-i', '-w', String(process.pid)], { stdio: 'ignore', detached: true }).unref();
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
async function fresh({ w = 1366, h = 768, theme = 'light' } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: theme });
  const p = drawerAware(await ctx.newPage());
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('favicon')) errors.push(m.text()); });
  await p.clock.install({ time: new Date('2026-11-09T10:45:40') });
  await p.goto(URL); await p.waitForSelector(T('no-incident'));
  await p.evaluate((t) => window.__ecc.store.getState().setTheme(t), theme);
  await p.clock.runFor(2000);
  await p.click(T('start-training')); await p.click(T('start-submit')); await p.waitForSelector(T('dock'));
  return p;
}
/** Advance the scenario one step and let its updates arrive. */
const next = async (p, n = 1) => { for (let i = 0; i < n; i++) { await p.clock.runFor(60_000); await p.click(T('facil-next')); await p.clock.runFor(61_500); } };
const wait = (p, ms = 400) => p.clock.runFor(ms);
const ask = (p) => p.textContent(T('panel-ask'));
const card = (p, id) => p.locator(`${T('issue-card')}[data-issue="${id}"]`);
const issueEvents = (p) => p.evaluate(() => { const s = window.__ecc.store.getState(); return s.records[s.incidentId].events.filter((e) => ['issue', 'decision', 'report'].includes(e.kind)).map((e) => ({ id: e.id, kind: e.kind, title: e.title, by: e.by, status: e.status })); });
const updates = async (p) => { await p.click(T('view-updates')); await p.waitForSelector(T('feed-rows')); };
const issues = async (p) => { await p.click(T('view-issues')); await p.waitForSelector(T('issue-list')); };
const box = (p, id) => p.locator(T(id)).boundingBox();
const signIn = async (p, who = 'im') => { await p.click(T('user-menu')); await p.click(T(who === 'im' ? 'persona-im' : 'persona-shift')); await p.keyboard.press('Escape'); };
async function step(name, fn) {
  if (!want(name.split(':')[0])) return;
  try { await fn(); pass++; console.log('PASS', name); } catch (e) { fail++; console.log('FAIL', name, '-', String(e.message ?? e).split('\n').slice(0, 3).join(' ')); }
}

await step('a: arrival: Equipment watch on top with readings and trends; one worklist with Open issues and Incident Updates in the same space; panel only for a selected issue; evidence in a dialog', async () => {
  const p = await fresh(); await next(p, 3);
  assert((await p.textContent(T('nav-situation'))).startsWith('Situation Room'), 'nav names the Situation Room');
  // Arrival: what is monitored and its status, at the top.
  const watch = await box(p, 'equipment-watch'); const work = await box(p, 'worklist');
  assert(watch && watch.y < 160 && work.y > watch.y + watch.height - 1, `Equipment watch first, worklist below (${watch?.y}, ${work?.y})`);
  const tiles = await p.locator(`${T('watch-strip')} .sr-tile`).count();
  assert(tiles >= 4, `a tile per monitored item (${tiles})`);
  const t = await p.textContent(T('watch-D-0001'));
  assert(/D-0001/.test(t) && /HP Separator/.test(t) && /bar/.test(t) && /Pressure/.test(t), `tile shows name, reading and status: ${t}`);
  assert(await p.locator(`${T('watch-D-0001')} svg`).count() >= 1, 'trend in place');
  assert(await p.locator(T('add-equipment')).isVisible(), 'Add equipment in view');
  assert(await p.getAttribute(T('worklist'), 'data-view') === 'issues' && await p.locator(T('issue-panel')).count() === 0, 'Open issues first; no panel until an issue is chosen');
  const asks = await p.locator(T('issue-card')).evaluateAll((xs) => xs.map((x) => `${x.dataset.issue}:${x.dataset.ask}`));
  assert(asks.length === 3 && asks.every((x) => x.endsWith(':decision')), `three open issues need a decision: ${asks}`);
  assert(await p.locator(T('review-list')).count() === 0, 'no Needs review: every update is in an issue');
  await p.screenshot({ path: `${OUT}/1-arrival-1366.png` });
  // Trend in place, from the strip.
  await p.click(T('watch-trend-D-0001')); await p.waitForSelector(T('trend-close')); await p.click(T('trend-close'));
  // Every reading in place; the strip comes back.
  await p.click(T('watch-toggle')); assert(await p.locator(`${T('cards')} [data-testid^="watcher-"]`).first().isVisible(), 'every watcher with its reading'); await p.click(T('watch-toggle'));
  // Incident Updates: same space, where each update went.
  await updates(p);
  const work2 = await box(p, 'worklist');
  assert(Math.abs(work2.y - work.y) < 1 && Math.abs(work2.height - work.height) < 1 && Math.abs(work2.width - work.width) < 1, 'both views use the same space');
  assert(await p.locator(T('equipment-watch')).isVisible(), 'Equipment watch still visible');
  const origins = await p.locator('.sr-row').evaluateAll((xs) => [...new Set(xs.map((x) => x.dataset.origin))].sort());
  assert(JSON.stringify(origins) === JSON.stringify(['agent', 'field', 'monitoring']), `origins: ${origins}`);
  const places = await p.locator('.sr-row').evaluateAll((xs) => Object.fromEntries(xs.map((x) => [x.dataset.update, `${x.dataset.place}|${x.querySelector('[data-testid="placement"]').textContent}`])));
  assert(/^opens\|Opened issue “Deluge on the propane area: no water flow”/.test(places['o4-1']), `the field report opens the deluge issue: ${places['o4-1']}`);
  assert(/^joins\|Added to “Deluge on the propane area: no water flow”/.test(places['o4-3']), `joins: ${places['o4-3']}`);
  assert(/^joins\|Added to “Deluge on the propane area: no water flow”/.test(places['a4-1']), `joins: ${places['a4-1']}`);
  assert(/^info\|Information only/.test(places['o1-2']), `info: ${places['o1-2']}`);
  await p.click(T('origin-people')); const filtered = await p.locator('.sr-row').evaluateAll((xs) => [...new Set(xs.map((x) => x.dataset.origin))]);
  assert(filtered.every((o) => o === 'field' || o === 'person'), `people filter: ${filtered}`); await p.click(T('origin-all'));
  await p.screenshot({ path: `${OUT}/2-incident-updates-1366.png` });
  // An issue opens on the right; Equipment watch stays in view; closing returns the wider workspace.
  await issues(p); await p.click(`${T('issue-card')}[data-issue="deluge"]`); await wait(p);
  const panel = await box(p, 'issue-panel'); const watch3 = await box(p, 'equipment-watch');
  assert(panel.x > 700 && panel.x + panel.width <= 1366 && await p.locator(T('equipment-watch')).isVisible() && panel.x - watch3.x > 600, `drawer from the right, Equipment watch in view (${JSON.stringify(panel)})`);
  const heads = await p.locator(`${T('issue-panel')} .ir-h`).allTextContents();
  assert(heads[0] === 'What happened' && heads[1] === 'ECC recommends' && heads[2] === 'Follow-up' && /^Evidence/.test(heads[3]) && await p.locator(`${T('issue-panel')} .sr-steps, ${T('issue-panel')} ${T('next-text')}`).count() === 0, `what happened, then what needs attention; no tracker or generic next step: ${heads}`);
  assert((await p.locator(T('issue-title')).count()) === 1 && /^DS-029\|Opened \d\d:\d\d\|Critical\|Awaiting decision$/.test((await p.locator(`${T('issue-meta')} > *`).allInnerTexts()).join('|')), `title once, then one compact line: ${(await p.locator(`${T('issue-meta')} > *`).allInnerTexts()).join(' · ')}`);
  assert(await p.locator(T('happened-lead')).isVisible() && !(await p.locator(T('issue-updates')).isVisible()), 'short story: related updates on demand');
  await p.screenshot({ path: `${OUT}/3-issue-open-1366.png` });
  // Evidence is listed in the response itself; each item opens its own evidence in a dialog.
  const ev = await p.locator(`${T('issue-panel')} ${T('evidence-item')}`).evaluateAll((xs) => xs.map((x) => x.dataset.kind));
  assert(ev.includes('reading') && ev.includes('document') && await p.locator(`${T('issue-panel')} ${T('evidence')}`).isVisible(), `evidence listed in the response: ${ev}`);
  assert(await p.locator(T('link-evidence')).count() === 0, 'no separate evidence list to open first');
  await p.locator(`${T('evidence-item')}[data-kind="document"]`).first().click(); await p.waitForSelector(T('viewer-overlay'));
  assert(await p.locator('[data-window="document"]').count() === 0, 'the document opens in a dialog, not docked');
  await p.keyboard.press('Escape'); await wait(p);
  assert(await p.locator(T('viewer-overlay')).count() === 0 && await p.locator(T('issue-panel')).isVisible(), 'closes back to the issue');
  await p.locator(`${T('evidence-item')}[data-kind="reading"]`).first().click(); await p.waitForSelector(T('trend-close')); await p.click(T('trend-close'));
  await p.click(`${T('issue-card')}[data-issue="fire"]`); await wait(p);
  assert(/^Show more \(\d+\)$/.test(await p.textContent(T('evidence-all'))) && await p.locator(`${T('evidence-item')}:visible`).count() === 3, 'a short evidence preview');
  await p.click(T('evidence-all'));
  assert(await p.textContent(T('evidence-all')) === 'Show less', 'Show less after Show more');
  await p.locator(`${T('evidence-item')}[data-kind="report"]`).first().click(); await p.waitForSelector(T('report-dialog'));
  assert(/not independently verified|Nobody has independently verified/.test(await p.textContent(T('report-dialog'))), 'a report opens as reported, unverified');
  await p.keyboard.press('Escape'); await wait(p);
  await p.click(`${T('issue-card')}[data-issue="deluge"]`); await wait(p);
  await p.click(`${T('related')} > summary`); assert(await p.locator(T('issue-updates')).isVisible(), 'related updates on demand');
  await p.click(T('panel-close')); await wait(p);
  const wide = await box(p, 'worklist');
  assert(await p.locator(T('issue-panel')).count() === 0 && wide.width > panel.x - 40, 'dismissed: back to the wider workspace');
  const ov = await p.evaluate(() => document.documentElement.scrollWidth > document.documentElement.clientWidth);
  assert(!ov, 'no horizontal overflow');
  await p.context().close();
});

await step('i: drawer and divider at 1366 and 1440: closed on arrival, opens from the right, outside click and Escape dismiss it and return focus, an evidence dialog closes first; the divider resizes Equipment watch', async () => {
  for (const [w, h] of [[1366, 768], [1440, 900]]) {
    const p = await fresh({ w, h }); await next(p, 3);
    await p.click(`${T('issue-card')}[data-issue="fire"]`); await p.waitForSelector(T('issue-panel'));
    await p.click(T('nav-overview')); await p.click(T('nav-situation')); await wait(p);
    assert(await p.locator(T('issue-panel')).count() === 0, `${w}: arriving from another tab, the drawer is closed`);
    await p.screenshot({ path: `${OUT}/r17-1-arrival-${w}.png` });
    const watch0 = await box(p, 'equipment-watch');
    await p.locator(`${T('issue-card')}[data-issue="fire"]`).focus(); await p.keyboard.press('Enter'); await p.waitForSelector(T('issue-panel')); await wait(p);
    const pb = await box(p, 'issue-panel');
    assert(pb.x + pb.width <= w && pb.x > w / 2 && Math.abs((await box(p, 'equipment-watch')).height - watch0.height) < 1, `${w}: opens from the right without moving the workspace`);
    // The decision is near the top even with eight evidence items.
    const decide = await box(p, 'decide-approved'); const ev = await box(p, 'evidence');
    assert(decide.y < ev.y && decide.y + decide.height <= h - 30, `${w}: the decision comes before the evidence and is on screen (${decide.y})`);
    assert(await p.locator(`${T('issue-panel')} ${T('evidence-item')}`).count() >= 8, `${w}: eight evidence items listed`);
    await p.screenshot({ path: `${OUT}/r17-2-drawer-${w}.png` });
    // An evidence dialog closes first, back to the same place in the drawer.
    if (/Show more/.test(await p.textContent(T('evidence-all')).catch(() => ''))) await p.click(T('evidence-all'));
    await p.locator(`${T('evidence-item')}[data-kind="document"]`).first().scrollIntoViewIfNeeded();
    const scroll0 = await p.locator(`${T('issue-panel')} .sr-pb`).evaluate((e) => e.scrollTop);
    await p.locator(`${T('evidence-item')}[data-kind="document"]`).first().click(); await p.waitForSelector(T('viewer-overlay'));
    await p.keyboard.press('Escape'); await wait(p);
    assert(await p.locator(T('viewer-overlay')).count() === 0 && await p.locator(T('issue-panel')).count() === 1, `${w}: Escape closes the dialog, not the drawer`);
    assert(await p.evaluate(() => document.activeElement?.dataset.kind) === 'document' && Math.abs(await p.locator(`${T('issue-panel')} .sr-pb`).evaluate((e) => e.scrollTop) - scroll0) < 2, `${w}: focus and scroll back where they were`);
    await p.screenshot({ path: `${OUT}/r17-3-after-evidence-${w}.png` });
    if (/Show more/.test(await p.textContent(T('evidence-all')).catch(() => ''))) await p.click(T('evidence-all'));
    await p.locator(`${T('evidence-item')}[data-kind="report"]`).first().click(); await p.waitForSelector(T('report-dialog'));
    await p.mouse.click(20, h - 60); await wait(p);
    assert(await p.locator(T('report-dialog')).count() === 0 && await p.locator(T('issue-panel')).count() === 1, `${w}: outside click closes the dialog first`);
    // Escape, then outside click, dismiss the drawer and return focus to the opener.
    await p.keyboard.press('Escape'); await wait(p);
    assert(await p.locator(T('issue-panel')).count() === 0 && await p.evaluate(() => document.activeElement?.dataset.issue) === 'fire', `${w}: Escape dismisses; focus back on the issue`);
    await p.click(`${T('issue-card')}[data-issue="deluge"]`); await p.waitForSelector(T('issue-panel'));
    await p.mouse.click(40, Math.round(watch0.y + watch0.height + 60)); await wait(p);
    assert(await p.locator(T('issue-panel')).count() === 0 && await p.evaluate(() => document.activeElement?.dataset.issue) === 'deluge', `${w}: outside click dismisses; focus back on the opener`);
    // Divider: drag down shows every reading; the worklist keeps room; keyboard and double-click work.
    const d = await box(p, 'divider-y');
    await p.mouse.move(d.x + 200, d.y + d.height / 2); await p.mouse.down(); await p.mouse.move(d.x + 200, d.y + 160, { steps: 8 }); await p.mouse.up(); await wait(p);
    const wb = await box(p, 'equipment-watch'), kb = await box(p, 'worklist');
    assert(wb.height > watch0.height + 120 && await p.getAttribute(T('watch-toggle'), 'aria-expanded') === 'true' && kb.height >= 240, `${w}: drag shows every reading; the worklist keeps ${Math.round(kb.height)} px`);
    await p.mouse.move(d.x + 200, d.y + 160); await p.mouse.down(); await p.mouse.move(d.x + 200, h, { steps: 8 }); await p.mouse.up(); await wait(p);
    assert((await box(p, 'worklist')).height >= 239, `${w}: the worklist keeps its minimum`);
    await p.screenshot({ path: `${OUT}/r17-4-divider-${w}.png` });
    await p.focus(T('divider-y')); const h1 = (await box(p, 'equipment-watch')).height; await p.keyboard.press('ArrowUp'); await wait(p);
    assert((await box(p, 'equipment-watch')).height < h1, `${w}: arrow keys resize`);
    await p.dblclick(T('divider-y')); await wait(p);
    assert(Math.abs((await box(p, 'equipment-watch')).height - watch0.height) < 2 && await p.getAttribute(T('watch-toggle'), 'aria-expanded') === 'false', `${w}: double-click returns to the strip`);
    // The drawer does not move the divider, and the divider does not move the drawer.
    await p.click(`${T('issue-card')}[data-issue="fire"]`); await p.waitForSelector(T('issue-panel'));
    assert(Math.abs((await box(p, 'issue-panel')).height - pb.height) < 2, `${w}: drawer independent of the divider`);
    await p.context().close();
  }
});

await step('b: one issue end to end: first update, decision, field report, verification, closure, Closed list, reopening, and a later update about the closed issue', async () => {
  const p = await fresh();
  await next(p, 3);
  await updates(p); await p.click(T('update-o4-3')); await p.waitForSelector(`${T('issue-panel')}[data-issue="deluge"]`);
  assert(await p.getAttribute(T('issue-panel'), 'data-focus') === 'o4-3' && await p.locator(`${T('issue-panel')} [data-update="o4-3"][data-opened]`).count() === 1, 'the issue opens with the clicked update marked');
  assert(await ask(p) === 'Awaiting decision' && /recommendation/.test(await p.textContent(T('needs-line'))), 'decision needed first');
  assert(await p.textContent(T('crumb-issue')) === 'Deluge on the propane area: no water flow', 'breadcrumb names the issue');
  assert(await p.locator(T('decide-approved')).count() === 1 && await p.locator(T('feedback-open')).count() === 1 && await p.locator(`${T('decide-deferred')}, ${T('decide-declined')}, ${T('decide-alternative')}`).count() === 0, 'Accept and Give feedback only');
  await p.click(T('decide-approved')); await p.fill(T('rationale'), 'Mobile monitors on D-0001 now'); await p.click(T('record-decision'));
  await wait(p, 90_000);
  assert(await ask(p) === 'Awaiting field update', `after decision: ${await ask(p)}`);
  assert(await p.locator(T('field-report')).count() === 0 && await p.locator(T('verification')).count() === 0, 'a decision is not a report or a check');
  await p.click(T('report-open')); await p.fill(T('report-text'), 'Two mobile monitors cooling the D-0001 shell; deluge supply valve found closed and opened.'); await p.click(T('report-save'));
  await wait(p, 120_000);
  assert(await ask(p) === 'Verification pending' && /a report is not proof/i.test(await p.textContent(T('needs-line'))), 'a report still needs a check');
  assert(/cooling water on the D-0001 shell/.test(await p.textContent(T('needs-check'))), 'what to check, in plain words');
  await p.click(T('verify-open')); await p.fill(T('verify-text'), 'Water seen on the D-0001 shell from the north road.'); await p.click(T('verify-save'));
  await wait(p, 60_000);
  assert(await ask(p) === 'Ready to close', `after verification: ${await ask(p)}`);
  const lanes = await p.evaluate(() => ['lane-decision', 'lane-field', 'lane-verified'].map((id) => document.querySelector(`[data-testid="${id}"] dd`).textContent));
  assert(/Accepted/.test(lanes[0]) && /mobile monitors/.test(lanes[1]) && /north road/.test(lanes[2]) && !/north road/.test(lanes[1]), `three separate lanes: ${lanes}`);
  await p.screenshot({ path: `${OUT}/journey-ready-1366.png` });
  await p.click(T('close-open')); await p.waitForSelector(T('close-form'));
  assert(await p.locator(T('close-gaps')).count() === 0, 'nothing outstanding when verified');
  assert(await p.locator(T('close-confirm')).isDisabled(), 'closing needs a reason');
  await p.fill(T('close-note'), 'Cooling confirmed on D-0001. No further follow-up.'); await p.click(T('close-confirm')); await wait(p);
  assert(await ask(p) === 'Closed' && await p.locator(T('closed-area')).isVisible(), 'closed in the panel');
  assert(await card(p, 'deluge').count() === 0, 'it leaves Open issues');
  await p.click(T('panel-close')); await issues(p); await p.click(T('list-closed')); await wait(p);
  assert(await card(p, 'deluge').count() === 1 && await card(p, 'deluge').getAttribute('data-ask') === 'closed', 'easy to find under Closed');
  await p.click(`${T('issue-card')}[data-issue="deluge"]`); await p.click(T('reopen-open'));
  assert(await p.locator(T('reopen-confirm')).isDisabled(), 'reopening needs a reason');
  await p.fill(T('reopen-note'), 'Want a second look at the flow'); await p.click(T('reopen-confirm')); await wait(p);
  assert(await ask(p) === 'Verification pending' && /reopened at/.test(await p.textContent(T('needs-line'))), 'reopened: the earlier check no longer settles it');
  assert(/Reopened \d\d:\d\d/.test(await p.textContent(T('issue-history'))), 'history shows closing and reopening');
  await p.click(T('verify-open')); await p.fill(T('verify-text'), 'Flow holding.'); await p.click(T('verify-save'));
  await p.click(T('close-open')); await p.fill(T('close-note'), 'Re-checked.'); await p.click(T('close-confirm')); await p.click(T('panel-close'));
  await next(p, 3); await p.click(T('list-open')); await wait(p);
  const item = p.locator(`${T('review-item')}[data-id="a7-3"]`);
  assert(await item.count() === 1 && /About closed issues/.test(await p.textContent(T('review-list'))) && /Deluge on the propane area/.test(await item.textContent()), 'a later update about the closed issue waits for a person');
  assert(await card(p, 'deluge').count() === 0, 'ECC does not reopen it on its own');
  await item.click(); await p.waitForSelector(T('place-closed'));
  assert(/Cooling confirmed|Re-checked/.test(await p.textContent(T('place-closed'))), 'shows how it was closed');
  await p.screenshot({ path: `${OUT}/journey-later-update-1366.png` });
  await p.click(T('place-reopen')); await p.waitForSelector(`${T('issue-panel')}[data-issue="deluge"]`); await wait(p);
  assert(await ask(p) === 'Verification pending' && await card(p, 'deluge').count() === 1, 'reopened with the update added');
  assert(await p.getAttribute(T('happened-lead'), 'data-update') === 'a7-3' || await p.locator(`${T('issue-updates')} [data-update="a7-3"]`).count() === 1, 'the new update is part of the story');
  const ev = await issueEvents(p);
  const titles = ev.map((e) => e.title);
  assert(titles.filter((t) => /^Issue closed: Deluge/.test(t)).length === 2 && titles.filter((t) => /^Issue reopened: Deluge/.test(t)).length === 2, `close and reopen recorded: ${titles.join(' / ')}`);
  assert(ev.some((e) => e.id === 'decision-a4-1' && /^Accepted:/.test(e.title)) && ev.filter((e) => e.kind === 'report' && e.status === 'verified').length === 2, 'decision and checks recorded separately');
  assert(titles.some((t) => /^Update added to issue “Deluge/.test(t)), 'placement recorded');
  await p.context().close();
});

await step('c: a second update about the same open issue: ECC revises its suggestion after a decision, and the issue says so', async () => {
  const p = await fresh(); await next(p, 3);
  await p.click(`${T('issue-card')}[data-issue="pressure"]`); await p.click(T('decide-approved')); await p.click(T('record-decision')); await wait(p);
  assert(await ask(p) === 'Awaiting field update', 'decided');
  await p.click(T('panel-close'));
  await next(p);
  const c = card(p, 'pressure');
  assert(await c.getAttribute('data-ask') === 'decision' && /\d new/.test(await c.textContent()), `card flags the new updates: ${await c.textContent()}`);
  assert(/normal relief route damaged/.test(await c.textContent()), 'title follows the development');
  await c.click(); await wait(p);
  assert(/ECC revised its (suggestion|recommendation)/.test(await p.textContent(T('needs-line'))) && /Hold depressurization via FH-01/.test(await p.textContent(T('suggestion-text'))), 'revised suggestion needs a decision');
  assert(await p.getAttribute(T('happened-lead'), 'data-update') === 'a5-1', 'leads with the update that changed the issue');
  assert(await p.locator(`${T('issue-panel')} .ir-tag.new`).count() >= 1, 'new updates are marked while the panel is open');
  assert(await p.locator(T('decision-earlier')).count() === 1, 'the earlier decision stays visible');
  await p.locator(T('sec-needs')).scrollIntoViewIfNeeded(); await p.screenshot({ path: `${OUT}/second-update-1366.png` });
  await p.click(T('panel-close')); await wait(p);
  assert(!/\d new/.test(await c.textContent()), 'opened: no longer new');
  await p.context().close();
});

await step('d: ECC recommends: Accept and Give feedback only; nothing is recorded until Record acceptance; feedback is saved with the proposal and is not a decision', async () => {
  const p = await fresh(); await next(p, 1);
  await p.click(`${T('issue-card')}[data-issue="fire"]`); await p.waitForSelector(T('issue-panel'));
  assert(await ask(p) === 'Awaiting decision' && await p.textContent(T('awaiting-decision')) === 'Awaiting decision', 'no action: Awaiting decision');
  await p.click(T('decide-approved')); await wait(p, 100);
  assert(await p.locator(`${T('decision-details')}[open]`).count() === 0 && await p.locator(T('rationale')).isVisible() === false, 'notes and who was told are behind Add details');
  await p.click(T('decision-cancel')); await wait(p, 100);
  assert((await issueEvents(p)).filter((e) => e.kind === 'decision').length === 0 && await ask(p) === 'Awaiting decision', 'cancelled: nothing recorded');
  await p.click(T('feedback-open')); await p.fill(T('feedback-text'), 'Say which isolation valve to close first.'); await p.selectOption(T('feedback-reason'), 'Unclear wording'); await p.click(T('feedback-save'));
  await p.waitForSelector(T('feedback-saved'));
  const r = await p.evaluate(() => { const s = window.__ecc.store.getState(); return s.records[s.incidentId]; });
  const f = r.feedback?.[0];
  assert(f && f.issueId === 'fire' && f.proposal.summary && f.proposal.version && f.evidence.length > 0 && f.by && f.t && f.reason === 'Unclear wording', 'feedback saved with the proposal, its evidence, the issue, who and when');
  assert(r.events.some((e) => e.kind === 'feedback') && (await issueEvents(p)).filter((e) => e.kind === 'decision').length === 0 && await ask(p) === 'Awaiting decision', 'feedback is in the record and is not a decision');
  await wait(p, 3000);
  assert(await p.locator(T('feedback-item')).count() === 1, 'kept with the recommendation');
  await p.click(T('decide-approved')); await p.click(T('record-decision')); await wait(p);
  assert(/^Accepted by .+ at \d\d:\d\d/.test(await p.textContent(T('decision-recorded'))) && await ask(p) === 'Awaiting field update', 'Record acceptance: who and when, and the next step under Follow-up');
  await p.context().close();
});

await step('e: every update lands in an issue; a person can move one: to another issue, to a new issue, or to information only', async () => {
  const p = await fresh(); await next(p, 3);
  await updates(p);
  await p.locator('.sr-row[data-update="o4-1"]').hover(); await p.locator(`.sr-row[data-update="o4-1"] ${T('placement-move')}`).click(); await p.waitForSelector(T('place-form'));
  await p.click(T('place-opt-fire')); await p.click(T('place-confirm')); await wait(p);
  assert(await p.getAttribute(T('issue-panel'), 'data-issue') === 'fire', 'opens the issue it was moved to');
  await updates(p); const row = p.locator('.sr-row[data-update="o4-1"]');
  assert(await row.getAttribute('data-place') === 'joins' && /by N\. Al-Harbi/.test(await row.locator(T('placement')).textContent()), 'moved by a person, shown as such');
  await next(p); await updates(p);
  await p.locator('.sr-row[data-update="o5-1"]').hover(); await p.locator(`.sr-row[data-update="o5-1"] ${T('placement-move')}`).click(); await p.waitForSelector(T('place-form'));
  await p.click(T('place-opt-new')); await p.fill(T('place-new-title'), 'Visible release at the flare header'); await p.click(T('place-confirm')); await wait(p);
  assert(await p.textContent(T('issue-title')) === 'Visible release at the flare header' && await ask(p) === 'Response needed', 'a new issue opened by a person, with no ECC suggestion');
  await updates(p); assert(await p.locator('.sr-row[data-update="o5-1"]').getAttribute('data-place') === 'opens', 'the update opened it');
  await issues(p); await p.click(`${T('issue-card')}[data-issue="u-1"]`); await p.waitForSelector(T('rationale'));
  await p.fill(T('rationale'), 'Isolate the header section upstream of the damage'); await p.click(T('record-decision')); await wait(p);
  assert(await ask(p) === 'Awaiting field update', 'a response recorded on a person-opened issue');
  await updates(p); await p.locator('.sr-row[data-update="o5-3"]').hover(); await p.locator(`.sr-row[data-update="o5-3"] ${T('placement-move')}`).click(); await p.waitForSelector(T('place-form'));
  await p.click(T('place-opt-info')); await p.click(T('place-confirm')); await wait(p);
  assert(await p.locator('.sr-row[data-update="o5-3"]').getAttribute('data-place') === 'info', 'moved to information only');
  const ev = (await issueEvents(p)).map((e) => e.title);
  assert(ev.includes('Issue opened: Visible release at the flare header') && ev.some((t) => /^Update recorded as information only/.test(t)) && ev.some((t) => /^Different response: Isolate the header/.test(t)), `recorded: ${ev.join(' / ')}`);
  await p.context().close();
});

await step('f: a report made in ECC goes straight into Open issues: the issue its equipment is in, or a new issue of its own', async () => {
  const p = await fresh(); await next(p, 3);
  const add = (o) => p.evaluate((o) => window.__ecc.store.getState().submitObservation(o, { sites: ['SG GSP'], types: [] }), o);
  await add({ text: 'Water is spraying from the deluge ring near D-0029', equipmentId: 'DS-029', sourceType: 'personal' });
  await p.clock.runFor(1500);
  await add({ text: 'Strong smell of gas near the control building', sourceType: 'personal' });
  await p.clock.runFor(30_000); await updates(p);
  const rows = await p.locator('.sr-row[data-origin="person"]').evaluateAll((xs) => xs.map((x) => `${x.dataset.place}|${x.textContent}`));
  assert(rows.length === 2, `two people updates: ${rows}`);
  assert(rows.some((r) => /^joins\|.*spraying.*Added to “Deluge on the propane area/.test(r)), `equipment report joins its issue: ${rows}`);
  assert(rows.some((r) => /^opens\|.*smell of gas.*Opened issue/.test(r)), `report with no equipment opens an issue of its own: ${rows}`);
  assert(/Reported in ECC/.test(rows.join(' ')), 'origin visible');
  await p.locator('.sr-row[data-origin="person"][data-place="opens"] .sr-row-main').first().click(); await p.waitForSelector(`${T('issue-panel')} [data-opened]`);
  assert(await p.locator(T('concern-response')).isVisible() && await ask(p) === 'Response needed', 'its own issue, with ECC’s assessment of the report; the person can respond or close it');
  await p.screenshot({ path: `${OUT}/person-review-1366.png` });
  await p.context().close();
});

await step('g: Overview to Situation Room and back: Open issue goes to that issue; View open items to the list with nothing open; ← Back to Overview stays and returns to the same place', async () => {
  const p = await fresh(); await next(p, 4); await signIn(p); await p.waitForSelector(T('page-overview'));
  const lead = p.locator(`${T('ov-item')}[data-issue="pressure"]`);
  assert(await lead.count() === 1 && await p.locator('text=Quick look').count() === 0, 'the issue has its row, and no Quick look');
  await lead.scrollIntoViewIfNeeded(); await wait(p, 200);
  const scroll = await p.evaluate(() => document.querySelector('[data-testid="page-overview"]').scrollTop);
  // 1. A specific issue, and back.
  await lead.click(); await p.waitForSelector(T('issue-panel'));
  const issue = await p.getAttribute(T('issue-panel'), 'data-issue');
  assert(issue === 'pressure' && await card(p, 'pressure').getAttribute('aria-current') === 'true', `that issue is open and selected: ${issue}`);
  assert((await p.textContent(T('ov-return-btn'))).trim() === '← Back to Overview' && await p.locator(T('ov-return')).count() === 0, 'one way back, at the top');
  await p.screenshot({ path: `${OUT}/from-overview-1366.png` });
  await p.click(T('panel-close')); await wait(p);
  assert(await p.locator(T('ov-return-btn')).isVisible(), 'still there after closing the issue');
  await card(p, 'fire').click(); await p.waitForSelector(`${T('issue-panel')}[data-issue="fire"]`);
  await p.click(T('ov-return-btn')); await p.waitForSelector(T('page-overview')); await wait(p, 200);
  assert(Math.abs(await p.evaluate(() => document.querySelector('[data-testid="page-overview"]').scrollTop) - scroll) < 4, 'back where I left off');
  // 2. The list, choose an issue, and back.
  await p.click(T('ov-attention-all')); await p.waitForSelector(T('worklist'));
  assert(await p.getAttribute(T('worklist'), 'data-view') === 'issues' && await p.locator(`${T('issue-panel')}, ${T('update-panel')}`).count() === 0, 'View open items: Open issues, nothing open');
  assert(await p.locator(T('ov-return-btn')).isVisible(), '← Back to Overview shown');
  await card(p, 'deluge').click(); await p.waitForSelector(`${T('issue-panel')}[data-issue="deluge"]`);
  assert(await p.locator(T('ov-return-btn')).isVisible(), 'still there with the chosen issue open');
  await p.click(T('ov-return-btn')); await p.waitForSelector(T('page-overview')); await wait(p, 200);
  assert(Math.abs(await p.evaluate(() => document.querySelector('[data-testid="page-overview"]').scrollTop) - scroll) < 4, 'back where I left off, again');
  // From the tab bar, the room shows its plain breadcrumb.
  await p.click(T('nav-situation')); await wait(p);
  assert(await p.locator(T('ov-return-btn')).count() === 0 && await p.locator(T('room-to-overview')).count() === 1, 'the room always links to the Overview');
  await p.context().close();
});

await step('h: the panel docks wide and back, closes, and overlays at narrow widths; both themes at 1366 and 1440', async () => {
  for (const [w, h] of [[1366, 768], [1440, 900]]) {
    const p = await fresh({ w, h }); await next(p, 4);
    await p.click(`${T('issue-card')}[data-issue="pressure"]`); await wait(p);
    const box = await p.locator(T('issue-panel')).boundingBox();
    assert(box.x + box.width <= w && box.y + box.height <= h - 30, `${w}: panel inside the viewport ${JSON.stringify(box)}`);
    const sizes = await p.evaluate(() => ['worklist', 'issue-panel'].map((id) => Math.round(document.querySelector(`[data-testid="${id}"]`).getBoundingClientRect().width)));
    assert(sizes[0] >= 600 && sizes[1] >= 400, `${w}: usable widths ${sizes}`);
    for (const theme of ['light', 'dark']) {
      await p.evaluate((t) => window.__ecc.store.getState().setTheme(t), theme); await wait(p, 200);
      await p.screenshot({ path: `${OUT}/panel-${w}-${theme}.png` });
      await p.locator(T('sec-needs')).scrollIntoViewIfNeeded(); await p.screenshot({ path: `${OUT}/panel-needs-${w}-${theme}.png` });
      await p.locator(`${T('issue-panel')} .sr-pb`).evaluate((e) => { e.scrollTop = 0; });
    }
    await p.click(T('panel-dock')); await wait(p);
    const wide = await p.locator(T('issue-panel')).boundingBox();
    assert(wide.width > box.width + 200 && await p.getAttribute(T('dock'), 'data-dock') === 'wide', `${w}: docks wide`);
    await p.screenshot({ path: `${OUT}/panel-wide-${w}.png` });
    await p.click(T('panel-dock')); await wait(p);
    assert(Math.abs((await p.locator(T('issue-panel')).boundingBox()).width - box.width) < 2, `${w}: back to the side`);
    await p.click(T('panel-close')); await wait(p);
    assert(await p.locator(T('issue-panel')).count() === 0, 'closes');
    await p.context().close();
  }
  const p = await fresh({ w: 1180, h: 760 }); await next(p, 3);
  await p.click(`${T('issue-card')}[data-issue="deluge"]`); await wait(p);
  const pb = await p.locator(T('issue-panel')).boundingBox();
  assert(pb.x > 500 && pb.x + pb.width <= 1180 && await p.locator(T('equipment-watch')).isVisible(), `1180: the panel overlays the right of the workspace ${JSON.stringify(pb)}`);
  await p.screenshot({ path: `${OUT}/panel-1180.png` });
  await p.context().close();
});

await step('j: the drawer opens only for a chosen item: an equipment bell filters its notifications and opens nothing; each row opens exactly that item', async () => {
  const p = await fresh(); await next(p, 4);
  await p.click(T('nav-situation')); await wait(p);
  for (const eq of ['DS-029', 'D-0001']) {
    await p.click(T(`watch-open-${eq}`)); await wait(p, 300);
    assert(await p.locator(`${T('issue-panel')}, ${T('update-panel')}`).count() === 0 && await p.evaluate(() => window.__ecc.store.getState().selectedAlertId) === null, `${eq} bell: nothing selected, the drawer stays closed`);
    assert((await p.textContent(T('feed-equipment'))).includes(eq), `${eq} bell: Incident Updates show only ${eq}`);
    const rows = p.locator(`${T('feed-rows')} > li.sr-row`);
    const n = await rows.count(); assert(n >= 2, `${eq} has several notifications (${n})`);
    for (let k = 0; k < n; k++) {
      const row = rows.nth(k); const id = await row.getAttribute('data-update'); const place = await row.getAttribute('data-place');
      await row.locator('.sr-row-main').click(); await wait(p, 300);
      if (place === 'review' || place === 'info') assert(await p.getAttribute(T('update-panel'), 'data-update') === id && await p.locator(T('issue-panel')).count() === 0, `${eq} row ${k}: an unlinked notification opens on its own, with its review state`);
      else assert(await p.getAttribute(T('issue-panel'), 'data-focus') === id && await p.locator(`${T('issue-panel')} [data-update="${id}"][data-opened]`).count() === 1, `${eq} row ${k}: its issue opens with the clicked update marked`);
      await p.keyboard.press('Escape'); await wait(p, 200);
      assert(await p.locator(`${T('issue-panel')}, ${T('update-panel')}`).count() === 0, 'Escape closes the drawer');
    }
    await p.click(T('feed-equipment'));
  }
  await p.context().close();
});

await step('k: Show all readings makes room for the first row of equipment; the worklist keeps its minimum; Hide returns to the strip', async () => {
  for (const [w, h] of [[1366, 768], [1440, 900]]) {
    const p = await fresh({ w, h }); await next(p, 3);
    await p.click(T('nav-situation')); await wait(p);
    await p.click(T('watch-toggle')); await wait(p, 300);
    const m = await p.evaluate(() => {
      const body = document.querySelector('.sr-watch-b').getBoundingClientRect();
      const cards = [...document.querySelectorAll('[data-testid="equipment-watch"] [data-testid^="card-"]')].map((c) => c.getBoundingClientRect());
      const row = cards.filter((c) => Math.abs(c.top - cards[0].top) < 4);
      const main = document.querySelector('.sr-main').getBoundingClientRect(); const watch = document.querySelector('[data-testid="equipment-watch"]').getBoundingClientRect();
      return { rowBottom: Math.max(...row.map((c) => c.bottom)), visible: body.bottom, rest: main.bottom - watch.bottom };
    });
    assert(m.rowBottom <= m.visible + 1, `${w}: the first row of equipment is fully in view (${Math.round(m.rowBottom)} ≤ ${Math.round(m.visible)})`);
    assert(m.rest >= 240, `${w}: the worklist keeps its minimum (${Math.round(m.rest)})`);
    await p.click(T('watch-toggle')); await wait(p, 200);
    assert(await p.locator(T('watch-strip')).isVisible(), `${w}: Hide returns to the strip`);
    await p.context().close();
  }
});

await step('l: tell someone with the decision (optional); the history keeps who, how and when; an overdue update shows quietly and can be followed up', async () => {
  const p = await fresh(); await next(p, 3);
  const open = async () => { await issues(p); await p.click(`${T('issue-card')}[data-issue="deluge"]`); await wait(p); };
  await open();
  // Optional: the Told row is offered with Accept, behind Add details.
  await p.click(T('decide-approved')); await p.click(`${T('decision-details')} > summary`); assert(await p.locator(T('decision-tell')).isVisible(), 'the Told row is offered with the decision');
  await p.click(T('decide-approved'));
  assert(await p.locator(T('decision-within')).isEnabled() && await p.locator(T('decision-via')).isEnabled(), 'How and Expect update can be chosen before a name is typed');
  await p.selectOption(T('decision-within'), '30'); assert(await p.inputValue(T('decision-within')) === '30', 'the expected-update choice opens and takes a value');
  await p.fill(T('decision-to'), 'Fire team leader'); await p.selectOption(T('decision-via'), 'Radio'); await p.selectOption(T('decision-within'), '15');
  await p.click(T('record-decision')); await wait(p);
  assert(/Told Fire team leader by radio[\s\S]*update expected by \d\d:\d\d[\s\S]*waiting/.test(await p.textContent(T('lane-told'))), 'who, how and when an update is expected');
  // What is open in the response record stays open while the clock ticks: the documents a decision relied on, a half-filled form.
  await p.click(`${T('decision-evidence')} > summary`); await p.click(T('contact-open')); await p.fill(T('contact-to'), 'Half typed');
  await wait(p, 15_000);
  assert(await p.locator(T('decision-evidence')).evaluate((d) => d.open) && await p.inputValue(T('contact-to')) === 'Half typed', 'the evidence list and a half-filled form stay open across clock ticks');
  await p.locator(T('contact-form')).locator('button', { hasText: 'Cancel' }).click();
  await p.keyboard.press('Escape');
  await wait(p, 16 * 60_000); await wait(p, 6000);
  assert(await p.locator(`${T('issue-card')}[data-issue="deluge"] ${T('issue-followup')}`).count() === 1, 'the card says Follow-up due');
  await open();
  assert(/No field update since you told Fire team leader/.test(await p.textContent(T('followup-due'))), 'the drawer says what is overdue');
  await p.click(T('followup-open')); await p.selectOption(T('followup-via'), 'Phone'); await p.click(T('followup-save')); await wait(p);
  assert(await p.locator(T('followup-due')).count() === 0 && /Followed up with Fire team leader by phone/.test(await p.textContent(T('lane-told'))), 'the follow-up is recorded and the reminder clears');
  await wait(p, 3000);
  const kinds = await p.evaluate(() => { const st = window.__ecc.store.getState(); return (st.records[st.incidentId]?.events ?? []).filter((e) => e.kind === 'notice').map((e) => e.title); });
  assert(kinds.length === 2 && /^Told Fire team leader by radio/.test(kinds[0]) && /^Followed up with Fire team leader by phone/.test(kinds[1]), `both contacts are in the incident record: ${kinds}`);
  await p.context().close();
});

await step('m: optional Split view: issues beside updates; selecting highlights without opening; This issue / All updates; divider; remembered; tabs when narrow', async () => {
  const p = await fresh({ w: 1366, h: 768 }); await next(p, 5);
  await p.click(T('nav-situation')); await wait(p);
  assert(await p.getAttribute(T('worklist'), 'data-layout') === 'tabs', 'tabs by default');
  await p.click(T('layout-split')); await wait(p);
  assert(await p.locator(T('pane-issues')).isVisible() && await p.locator(T('pane-updates')).isVisible() && await p.locator(T('equipment-watch')).isVisible(), 'issues left, updates right, Equipment watch above');
  const card = p.locator(`${T('pane-issues')} ${T('issue-card')}[data-issue="pressure"]`);
  await card.click(); await wait(p, 200);
  const rel = await p.locator(`${T('pane-updates')} .sr-row.in`).count();
  assert(rel >= 2 && await p.locator(`${T('issue-panel')}, ${T('update-panel')}`).count() === 0, 'selecting an issue highlights its updates and opens nothing');
  const all = await p.locator(`${T('pane-updates')} li.sr-row`).count();
  await p.click(T('feed-this-issue')); await wait(p, 200);
  assert(await p.locator(`${T('pane-updates')} li.sr-row`).count() === rel, 'This issue');
  await p.click(T('feed-all')); await wait(p, 200);
  assert(await p.locator(`${T('pane-updates')} li.sr-row`).count() === all, 'All updates');
  await card.locator(T('issue-open')).click(); await p.waitForSelector(`${T('issue-panel')}[data-issue="pressure"]`);
  await p.keyboard.press('Escape'); await wait(p, 200);
  const b0 = (await p.locator(T('pane-issues')).boundingBox()).width; const d = await p.locator(T('divider-split')).boundingBox();
  await p.mouse.move(d.x + d.width / 2, d.y + d.height / 2); await p.mouse.down(); await p.mouse.move(d.x + 140, d.y + d.height / 2, { steps: 6 }); await p.mouse.up(); await wait(p, 200);
  assert((await p.locator(T('pane-issues')).boundingBox()).width > b0 + 100, 'the divider drags');
  await p.reload(); await p.waitForSelector(T('worklist')); await wait(p, 500);
  assert(await p.getAttribute(T('worklist'), 'data-layout') === 'split', 'remembered after reload');
  await p.setViewportSize({ width: 860, height: 768 }); await p.waitForTimeout(300); await wait(p, 300);
  assert(await p.getAttribute(T('worklist'), 'data-layout') === 'tabs', 'tabs when narrow');
  await p.setViewportSize({ width: 1366, height: 768 }); await p.waitForTimeout(300); await wait(p, 300);
  await p.click(T('layout-tabs')); await wait(p);
  assert(await p.getAttribute(T('worklist'), 'data-layout') === 'tabs', 'back to Tabs in one click');
  await p.context().close();
});

await browser.close();
if (errors.length) { fail++; console.log('FAIL console errors:', [...new Set(errors)].slice(0, 5).join(' | ').slice(0, 800)); }
console.log(`\n${pass} passed, ${fail} failed. Screenshots in ${OUT}`);
