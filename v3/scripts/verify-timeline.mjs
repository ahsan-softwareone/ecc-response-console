// Focused checks for the Timeline workspace: one chronological view with collapsed history, and the editable Sit. Rep.
// Usage: node scripts/verify-timeline.mjs [--only=a,b,...]   Needs the dev server on 5189. Fixed page clock.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';

const URL = 'http://localhost:5189/';
const OUT = process.env.SHOTS_DIR ?? resolve(tmpdir(), 'ecc-timeline');
await mkdir(OUT, { recursive: true });
const ONLY = (process.argv.find((a) => a.startsWith('--only=')) ?? '').slice(7).split(',').filter(Boolean);
const want = (s) => !ONLY.length || ONLY.includes(s);
if (process.platform === 'darwin') spawn('caffeinate', ['-i', '-w', String(process.pid)], { stdio: 'ignore', detached: true }).unref();
const assert = (c, m) => { if (!c) throw new Error(`assertion failed: ${m}`); };
const T = (id) => `[data-testid="${id}"]`;
let pass = 0, fail = 0;
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];

async function fresh({ w = 1366, h = 768, theme = 'light' } = {}) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h }, colorScheme: theme, acceptDownloads: true });
  await ctx.grantPermissions(['clipboard-read', 'clipboard-write'], { origin: URL });
  const p = await ctx.newPage();
  p.on('pageerror', (e) => errors.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error' && !m.text().includes('favicon')) errors.push(m.text()); });
  await p.clock.install({ time: new Date('2026-11-09T10:45:40') });
  await p.goto(URL); await p.waitForSelector(T('no-incident'));
  await p.evaluate((t) => window.__ecc.store.getState().setTheme(t), theme);
  await p.clock.runFor(2000);
  await p.click(T('start-training')); await p.click(T('start-submit')); await p.waitForSelector(T('dock'));
  return p;
}
const next = async (p, n = 1) => { for (let i = 0; i < n; i++) { await p.clock.runFor(60_000); await p.click(T('facil-next')); await p.clock.runFor(61_500); } };
const wait = (p, ms = 500) => p.clock.runFor(ms);
const room = async (p, issue) => { await p.click(T('nav-situation')); await p.click(T('view-issues')); await p.click(`${T('issue-card')}[data-issue="${issue}"]`); await p.waitForSelector(T('issue-panel')); };
const story = (p) => p.locator(`${T('story')} ${T('story-item')}`).evaluateAll((xs) => xs.map((x) => ({ kind: x.dataset.kind, issue: x.dataset.issue, basis: x.dataset.basis, events: x.dataset.events, text: x.innerText })));
// The report as freshly generated from the incident now (the Generate report action), as text.
const brief = async (p) => { await p.click(T('sitrep-generate')); await p.waitForSelector(T('sitrep-input-situation')); return (await p.locator('[data-testid^="sitrep-input-"]').evaluateAll((els) => els.map((e) => e.value))).join('\n'); };
const pane = async (p) => { await p.click(T('nav-sitrep')); await wait(p); };
const moment = (p, kind, text) => p.locator(`${T('story-item')}[data-kind="${kind}"]`, { hasText: text }).last();
async function step(name, fn) {
  if (!want(name.split(':')[0])) return;
  try { await fn(); pass++; console.log('PASS', name); } catch (e) { fail++; console.log('FAIL', name, '-', String(e.message ?? e).split('\n').slice(0, 3).join(' ')); }
}

await step('a: arrival: one chronological view, latest moments in sight, groups collapsed, one filter row; the Sit. Rep is open on the right', async () => {
  const p = await fresh(); await next(p, 3);
  await pane(p);
  assert((await p.textContent(T('nav-sitrep'))).startsWith('Timeline'), 'the tab is the Timeline');
  for (const gone of ['tl-story', 'tl-full', 'story-scope', 'story-legend', 'story-record', 'brief-preview']) assert(await p.locator(T(gone)).count() === 0, `no ${gone}`);
  const filters = await p.locator('[data-testid^="story-filter-"]').allInnerTexts();
  assert(filters.join('·') === 'All·Developments·Decisions·Actions & results', `one filter row: ${filters}`);
  assert(await p.locator(T('moment-group')).count() === 0, 'groups collapsed by default');
  const s = await story(p);
  assert(s.length >= 5 && s.every((x) => ['development', 'decision', 'action', 'result', 'verified'].includes(x.kind)), `significant moments only: ${[...new Set(s.map((x) => x.kind))]}`);
  const list = p.locator(T('story-list'));
  const sc = await list.evaluate((el) => ({ top: el.scrollTop, max: el.scrollHeight - el.clientHeight }));
  assert(sc.max <= 0 || sc.top >= sc.max - 4, `opens at the latest moments (${sc.top}/${sc.max})`);
  const sb = await p.locator(T('brief')).boundingBox(), tb = await p.locator(T('story')).boundingBox();
  assert(sb && tb && sb.x > tb.x + tb.width - 1, 'the Sit. Rep is open on the right');
  assert(await p.locator(T('sitrep-none')).isVisible() && await p.locator(T('sitrep-generate')).count() === 1, 'no report yet: Generate report');
  await p.click(T('sitrep-generate')); await p.waitForSelector(T('sitrep-input-situation'));
  const a = await p.inputValue(T('sitrep-input-situation'));
  assert(/^(Developing|Escalating|Responding|Stabilizing)\. /.test(a) && a.length < 220, `short assessment: ${a}`);
  // Filters
  await p.click(T('story-filter-actions')); await wait(p, 100);
  assert((await story(p)).every((x) => ['action', 'result', 'verified'].includes(x.kind)), 'actions & results filter');
  await p.click(T('story-filter-all'));
  // Collapse and reopen the Sit. Rep.
  await p.click(T('brief-collapse')); await wait(p);
  assert(!(await p.locator(T('brief')).isVisible()) && await p.locator(T('brief-reopen')).isVisible(), 'collapsed, with a way back');
  await p.click(T('brief-reopen')); await wait(p);
  assert(await p.locator(T('brief')).isVisible(), 'reopened');
  await p.screenshot({ path: `${OUT}/a-arrival.png` });
  await p.context().close();
});

await step('b: one issue from decision to field action to verification; the qualifier sits beside each claim; the report agrees', async () => {
  const p = await fresh(); await next(p, 3);
  await room(p, 'deluge'); await p.click(T('decide-approved')); await p.click(`${T('decision-details')} > summary`); await p.fill(T('rationale'), 'Mobile cooling now'); await p.click(T('record-decision')); await p.keyboard.press('Escape');
  await pane(p);
  const dec = moment(p, 'decision', 'Treat deluge coverage');
  assert(/decision only · no action reported yet/.test(await dec.innerText()), `the decision says it is not an action: ${await dec.innerText()}`);
  assert(/Deluge on the propane area[^\n]*decision by[^\n]*No action reported yet/.test(await brief(p)), 'report: decided, no action yet');
  await room(p, 'deluge'); await p.click(T('report-open')); await p.fill(T('report-text'), 'Two mobile monitors cooling the D-0001 shell.'); await p.fill(T('report-by'), 'Fire team leader (field)'); await p.click(T('report-save')); await p.keyboard.press('Escape');
  await wait(p, 60_000); await pane(p);
  const act = moment(p, 'action', 'mobile monitors');
  const at = await act.innerText();
  assert(/reported · verification pending/.test(at) && /Fire team leader/.test(at), `action reported, unverified, attributed: ${at}`);
  assert(!/decision only/.test(await dec.innerText()), 'the decision is no longer alone');
  const b = await brief(p);
  assert(/mobile monitors[^\n]*not yet verified/.test(b) && /No verified result yet/.test(b) && /Deluge on the propane area[^\n]*needs a check/.test(b), `report: action reported, result pending: ${b}`);
  await room(p, 'deluge'); await p.click(T('verify-open')); await p.fill(T('verify-text'), 'Cooling water confirmed on the shell from the north road.'); await p.click(T('verify-save')); await p.keyboard.press('Escape');
  await pane(p);
  const v = moment(p, 'verified', 'Cooling water confirmed');
  assert(/verified by/.test(await v.innerText()), 'verified, with who checked');
  { const b2 = await brief(p); assert(/Cooling water confirmed[^\n]*verified/i.test(b2), `report: verified result: ${b2.slice(b2.indexOf('ACTIONS'), b2.indexOf('ACTIONS') + 600)}`); }
  await p.context().close();
});

await step('c: DS-029 reset to standby reads as an action; the report still says the no-flow fault is open and coverage unconfirmed', async () => {
  const p = await fresh(); await next(p, 3);
  await room(p, 'deluge'); await p.click(T('decide-approved')); await p.click(T('record-decision')); await p.keyboard.press('Escape');
  await next(p, 3); await pane(p);
  const reset = (await story(p)).find((x) => x.kind === 'action' && /reset to standby/i.test(x.text));
  assert(reset, 'reset to standby is an action');
  const b = await brief(p);
  assert(/coverage unconfirmed/i.test(b) && /no-flow fault open/i.test(b), 'report: fault open, coverage unconfirmed');
  assert(/action seen on instruments: DS-029 reset to standby/.test(b) && /No verified result yet/.test(b), 'the reset is an action, not a verified result');
  assert(!/Deluge on the propane area[^\n]*ready to close/.test(b), 'not ready to close while the fault is open');
  await p.context().close();
});

await step('d: the issue shortcut jumps to that issue in the same Timeline with its history open; groups hold every record entry once', async () => {
  const p = await fresh(); await next(p, 4);
  await room(p, 'pressure'); await p.click(T('link-record')); await wait(p, 300);
  assert(await p.locator(T('story')).isVisible(), 'the same Timeline');
  const on = p.locator(`${T('story-item')}.on`);
  assert(await on.count() === 1 && await on.getAttribute('data-issue') === 'pressure', 'the issue’s latest moment is highlighted');
  assert(await on.locator(T('moment-group')).count() === 1 && await on.locator(T('timeline-row')).count() >= 1, 'its history group is open');
  assert((await story(p)).some((x) => x.issue !== 'pressure'), 'the rest of the incident is still there');
  const box = await on.boundingBox(), lb = await p.locator(T('story-list')).boundingBox();
  assert(box.y >= lb.y - 1 && box.y < lb.y + lb.height, 'scrolled into view');
  for (let k = 0; k < 200 && await p.locator(`${T('moment-toggle')}[aria-expanded="false"]`).count(); k++) await p.locator(`${T('moment-toggle')}[aria-expanded="false"]`).first().click();
  const ids = await p.locator(T('timeline-row')).evaluateAll((els) => els.map((e) => e.getAttribute('data-event')));
  const n = await p.evaluate(async () => (await window.__ecc.currentRecord()).events.length).catch(() => null);
  assert(new Set(ids).size === ids.length, 'no record entry twice');
  if (n != null) assert(ids.length === n, `every record entry reachable (${ids.length}/${n})`);
  await p.context().close();
});

await step('e: Sit. Rep: edit a sentence, download through the existing action; the PDF carries the edit, real bullets, three sections, one page', async () => {
  const p = await fresh(); await next(p, 6); await pane(p);
  await p.click(T('sitrep-generate')); await p.waitForSelector(T('sitrep-input-situation'));
  await p.fill(T('sitrep-input-situation'), 'EDITED ASSESSMENT by the Incident Manager.'); await wait(p, 300);
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click(T('download-sitrep'))]);
  const pdf = (await readFile(await dl.path())).toString('latin1');
  assert(pdf.startsWith('%PDF') && pdf.includes('EDITED ASSESSMENT by the Incident Manager.'), 'the PDF carries the edit');
  for (const h of ['Current situation', 'Actions and results', 'What needs attention']) assert(pdf.includes(`(${h})`), `section ${h}`);
  assert((pdf.includes('(\x95)') || pdf.includes('(\\225)')) && !/\(\?\) Tj/.test(pdf), 'bullets are bullets');
  assert(/\/Count 1\b/.test(pdf), 'one page');
  await p.context().close();
});

await step('f: layout at 1366 and 1440 in both themes: no overflow; decision, action and result read differently', async () => {
  for (const [w, h] of [[1366, 768], [1440, 900]]) {
    const p = await fresh({ w, h }); await next(p, 3);
    await room(p, 'deluge'); await p.click(T('decide-approved')); await p.click(T('record-decision'));
    await p.click(T('report-open')); await p.fill(T('report-text'), 'Mobile monitors set up.'); await p.click(T('report-save')); await p.keyboard.press('Escape');
    await next(p, 3); await pane(p);
    const looks = await p.evaluate(() => Object.fromEntries(['decision', 'action', 'result', 'development'].map((k) => { const el = document.querySelector(`[data-testid="story-item"][data-kind="${k}"] .tl2-dot`); const c = el && getComputedStyle(el); return [k, c ? c.backgroundColor + c.borderColor + c.borderRadius : null]; })));
    assert(new Set(Object.values(looks)).size === 4, `kinds read differently: ${JSON.stringify(looks)}`);
    await p.locator(T('moment-toggle')).last().click();
    for (const theme of ['light', 'dark']) {
      await p.evaluate((t) => window.__ecc.store.getState().setTheme(t), theme); await wait(p, 200);
      const ov = await p.evaluate(() => document.documentElement.scrollWidth > innerWidth || [...document.querySelectorAll('[data-testid="brief"] *, [data-testid="story"] *')].some((e) => e.getBoundingClientRect().right > innerWidth + 1));
      assert(!ov, `${w} ${theme}: no overflow`);
      await p.screenshot({ path: `${OUT}/f-workspace-${w}-${theme}.png` });
    }
    await p.context().close();
  }
});

await browser.close();
if (errors.length) { fail++; console.log('FAIL console errors:', [...new Set(errors)].slice(0, 5).join(' | ').slice(0, 800)); }
console.log(`\n${pass} passed, ${fail} failed. Screenshots in ${OUT}`);
