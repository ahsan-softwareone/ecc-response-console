// Generates the illustrative PDF fixtures into public/docs using installed Chrome.
// Every page carries a fixture marker. Nothing here is an approved document.
import { chromium } from 'playwright-core';
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import quotes from '../src/data/quotes.json' with { type: 'json' };
import drawings from '../src/data/drawings.json' with { type: 'json' };

const here = dirname(fileURLToPath(import.meta.url));
const out = resolve(here, '../public/docs');

const PORTRAIT = { w: 794, h: 1123 };
const LANDSCAPE = { w: 1123, h: 794 };

const css = (size) => `
  * { box-sizing: border-box; }
  html, body { margin: 0; padding: 0; }
  body { font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; color: #1b2230; font-variant-ligatures: none; }
  .page { width: ${size.w}px; height: ${size.h}px; position: relative; page-break-after: always; overflow: hidden; background: #fff; }
  .page:last-child { page-break-after: auto; }
  .marker { position: absolute; top: 0; left: 0; right: 0; height: 34px; background: #f3f4f6; border-bottom: 1px solid #d5d9e0;
    font-size: 11px; letter-spacing: .08em; text-transform: uppercase; color: #5b6472; display: flex; align-items: center; justify-content: center; }
  .foot { position: absolute; bottom: 0; left: 0; right: 0; height: 40px; border-top: 1px solid #d5d9e0; font-size: 11px; color: #5b6472;
    display: flex; align-items: center; justify-content: space-between; padding: 0 48px; }
  .body { position: absolute; top: 34px; bottom: 40px; left: 0; right: 0; padding: 48px 64px; }
  h1 { font-size: 24px; margin: 0 0 4px; font-weight: 600; }
  .meta { font-size: 12px; color: #5b6472; margin-bottom: 28px; }
  h2 { font-size: 15px; margin: 26px 0 8px; font-weight: 600; }
  p { font-size: 13px; line-height: 1.55; margin: 0 0 10px; }
  ol, ul { font-size: 13px; line-height: 1.55; margin: 0 0 10px 20px; padding: 0; }
  li { margin-bottom: 4px; }
  table { border-collapse: collapse; font-size: 12.5px; width: 100%; margin: 8px 0 14px; }
  th, td { border: 1px solid #c9cfd8; padding: 6px 8px; text-align: left; }
  th { background: #f3f4f6; font-weight: 600; }
  .note { font-size: 12px; color: #5b6472; border-left: 3px solid #c9cfd8; padding: 6px 10px; margin: 10px 0; }
  svg { position: absolute; inset: 0; }
  .tb { font-size: 11px; }
`;

function page(size, inner, foot) {
  return `<section class="page">
    <div class="marker">Illustrative fixture — not an approved document</div>
    <div class="body">${inner}</div>
    <div class="foot"><span>${foot.left}</span><span>${foot.right}</span></div>
  </section>`;
}

function textDoc({ title, number, rev, status, pages }) {
  const total = pages.length;
  return pages.map((inner, i) => page(PORTRAIT, inner, {
    left: `${number} · Rev ${rev} · ${status}`,
    right: `${title} · Page ${i + 1} of ${total}`,
  })).join('');
}

// ---------- Fire response (Rev 1) ----------
const fire = textDoc({
  title: 'Process area fire response — generic guidance', number: 'ECC-FX-001', rev: '1', status: 'Fixture',
  pages: [
    `<h1>Process area fire response — generic guidance</h1>
     <div class="meta">ECC-FX-001 · Revision 1 · Illustrative fixture for prototype demonstration · Not site-specific</div>
     <h2>1. Scope</h2>
     <p>This generic guidance describes the sequence of considerations for a fire involving process equipment in a gas plant area. It is written for a prototype demonstration and contains no site-specific instructions, valve identities or authoritative limits.</p>
     <h2>2. Initial response</h2>
     <p>${quotes.fire_initial}</p>
     <p>Account for personnel, establish an exclusion zone around the affected equipment, and brief the Incident Commander at the location on the known condition of the equipment involved.</p>
     <h2>3. Isolation</h2>
     <p>Where isolation of the inventory feeding a fire can be carried out safely, it should be considered early. The identity and position of isolation points are site-specific and must be confirmed from the applicable drawings and from the field before any action is taken.</p>`,
    `<h2>4. Fixed fire protection</h2>
     <p>Fixed deluge systems protecting the affected equipment should be activated according to the site arrangement. ${quotes.fire_confirm_flow}; a command signal alone does not confirm coverage.</p>
     <h2>5. Mobile cooling</h2>
     <p>Where fixed protection is unavailable or unconfirmed, mobile monitors and hose streams may be used to cool exposed equipment. ${quotes.fire_confirm_flow} and reassess coverage whenever the water supply or the fire condition changes.</p>
     <h2>6. Hydrant supply</h2>
     <p>Hydrant supply should be checked against the firewater demand of the systems in use. ${quotes.fire_confirm_flow} rather than relying on pump running status or header pressure alone.</p>`,
    `<h2>7. Adjacent equipment</h2>
     <p>Equipment adjacent to a fire may be affected by radiant heat even when it is not directly involved. Rising pressure or temperature on an adjacent vessel is a significant condition and should be reported to the Incident Manager together with the applicable depressurization guidance.</p>
     <h2>8. Reporting</h2>
     <p>Field reports of extinguishment, isolation or system activation should be recorded as reported until independently verified by instrumentation or a second observer.</p>
     <div class="note">Illustrative fixture. The wording is generic and has not been validated by subject-matter experts.</div>`,
  ],
});

// ---------- Depressurization (Rev 2 and Rev 3) ----------
function depress(rev, status, extraSection) {
  return textDoc({
    title: 'Emergency depressurization — generic guidance', number: 'ECC-FX-002', rev, status,
    pages: [
      `<h1>Emergency depressurization — generic guidance</h1>
       <div class="meta">ECC-FX-002 · Revision ${rev} · ${status} · Illustrative fixture for prototype demonstration</div>
       <h2>1. Purpose</h2>
       <p>This generic guidance outlines considerations for the emergency depressurization of a pressure vessel exposed to external heat. It does not define site limits or valve line-ups.</p>
       <h2>2. Applicability</h2>
       <p>Applies to pressure vessels with a defined relief route to a flare system. Site-specific procedures take precedence where they exist.</p>
       <h2>3. Roles</h2>
       <p>The Incident Manager provides strategic direction from the Emergency Control Center. The Incident Commander directs the tactical response at the incident location. Where a step requires a decision, the role recording the decision is noted in the emergency record.</p>`,
      `<h2>4. Preparation</h2>
       <h2>4.1 Assessment</h2>
       <p>Assess the heat input to the vessel from available readings: vessel pressure, shell or outlet temperature and their trends. A rising trend on both is a significant condition.</p>
       <h2>4.2 Relief route</h2>
       <p>${quotes.depress_prepare}</p>
       <p>Route availability should be recorded as verified, reported or unknown. A reported availability is not an independently verified one.</p>
       <h2>4.3 Personnel</h2>
       <p>Position personnel according to the site plan and keep them clear of the relief discharge path for the duration of the depressurization.</p>`,
      `<h2>5. Initiation</h2>
       <h2>5.1 Decision</h2>
       <p>${quotes.depress_initiate}</p>
       <h2>5.2 Execution</h2>
       <p>The field execution of a depressurization is reported by the Incident Commander. A report that the action has started is recorded separately from the observed effect on vessel pressure.</p>
       <h2>5.3 Rate</h2>
       <p>The depressurization rate and any time-to-limit estimate require a validated method and vessel-specific inputs. Where these are not available, no figure should be stated.</p>`,
      `<h2>6. Alternative routes</h2>
       <h2>6.1 Availability</h2>
       <p>${quotes.depress_alternative}</p>
       <h2>6.2 Record</h2>
       <p>The route actually used, the revision of guidance applied and the role that recorded the decision are preserved in the emergency record.</p>
       <h2>6.3 Monitoring</h2>
       <p>${quotes.depress_monitor}</p>
       ${extraSection || ''}
       <div class="note">Illustrative fixture. The wording is generic and has not been validated by subject-matter experts.</div>`,
    ],
  });
}
const depressRev2 = depress('2', 'Fixture');
const depressRev3 = depress('3', 'Fixture', `<h2>6.4 Review</h2><p>Revision 3 adds a post-event review of the route selection. This section did not exist in Revision 2.</p>`);

// ---------- Operating limits (page-only citation) ----------
const limits = textDoc({
  title: 'Operating limits register — illustrative values', number: 'ECC-FX-003', rev: 'A', status: 'Fixture',
  pages: [
    `<h1>Operating limits register — illustrative values</h1>
     <div class="meta">ECC-FX-003 · Revision A · Illustrative fixture · Values are placeholders, not engineering limits</div>
     <p>This register lists placeholder alarm limits used by the prototype to demonstrate limit display and breach alerts. None of the values has been validated by subject-matter experts and none should be used for operation.</p>
     <h2>1. Conventions</h2>
     <p>High and High-High limits are shown per variable. The basis column records where a value came from; in this fixture every basis is “placeholder”.</p>`,
    `<h2>2. Vessels</h2>
     <table><tr><th>Tag</th><th>Variable</th><th>High</th><th>High-High</th><th>Basis</th></tr>
       <tr><td>D-0001</td><td>Pressure (bar)</td><td>18.0</td><td>20.5</td><td>placeholder</td></tr>
       <tr><td>D-0001</td><td>Shell temperature (°C)</td><td>120</td><td>150</td><td>placeholder</td></tr>
       <tr><td>D-0001</td><td>Level (%)</td><td>85</td><td>92</td><td>placeholder</td></tr>
       <tr><td>D-0029</td><td>Pressure (bar)</td><td>17.5</td><td>19.0</td><td>placeholder</td></tr>
       <tr><td>D-0029</td><td>Level (%)</td><td>80</td><td>90</td><td>placeholder</td></tr>
       <tr><td>V-0007</td><td>Level (%)</td><td>60</td><td>75</td><td>placeholder</td></tr>
     </table>
     <div class="note">The register does not record passage locations for individual limits; a citation can identify the page only.</div>`,
    `<h2>3. Fire and flare systems</h2>
     <table><tr><th>Tag</th><th>Variable</th><th>High</th><th>Low</th><th>Basis</th></tr>
       <tr><td>FH-01</td><td>Header pressure (bar)</td><td>2.5</td><td>—</td><td>placeholder</td></tr>
       <tr><td>FW-01</td><td>Firewater pressure (bar)</td><td>—</td><td>7.0</td><td>placeholder</td></tr>
     </table>`,
  ],
});

// ---------- Past incident report ----------
const pastIncident = textDoc({
  title: 'Past-incident report — propane area fire (training record)', number: 'ECC-FX-901', rev: '1', status: 'Fixture',
  pages: [
    `<h1>Past-incident report — propane area fire (training record)</h1>
     <div class="meta">ECC-FX-901 · Revision 1 · Training exercise record · Illustrative fixture</div>
     <h2>1. Summary</h2>
     <p>A training exercise simulated a small fire at a propane pump seal. The exercise tested the activation of area deluge and communication between the field and the Emergency Control Center.</p>
     <h2>2. Observations</h2>
     <ul><li>Deluge activation was confirmed by a flow reading, not by the command signal.</li><li>Field reports and instrument readings were recorded separately.</li></ul>`,
    `<h2>3. Lessons</h2>
     <ul><li>Confirm water flow at the protected equipment before relying on coverage.</li><li>Record decisions with the revision of guidance used.</li></ul>
     <div class="note">Past-incident records support learning and retrieval. Their actions do not become the protocol for a new emergency.</div>`,
  ],
});

// ---------- Drawings ----------
const W = LANDSCAPE.w, H = LANDSCAPE.h;
const px = (r) => ({ x: r.x * W, y: r.y * H, w: r.w * W, h: r.h * H });

function titleBlock(title, number, rev) {
  return `<g font-family="Helvetica, Arial" font-size="11" fill="#1b2230">
    <rect x="${W - 372}" y="${H - 118}" width="324" height="70" fill="#fff" stroke="#1b2230" />
    <line x1="${W - 372}" y1="${H - 94}" x2="${W - 48}" y2="${H - 94}" stroke="#1b2230"/>
    <text x="${W - 362}" y="${H - 102}" font-weight="700">${title}</text>
    <text x="${W - 362}" y="${H - 78}">${number} · Rev ${rev} · Illustrative fixture</text>
    <text x="${W - 362}" y="${H - 60}">Not an approved drawing · Prototype demonstration only</text>
  </g>`;
}
function drawingPage(title, number, rev, svgInner) {
  return `<section class="page" style="width:${W}px;height:${H}px">
    <div class="marker">Illustrative fixture — not an approved drawing</div>
    <svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
      <rect x="24" y="48" width="${W - 48}" height="${H - 72}" fill="none" stroke="#1b2230" stroke-width="1.5"/>
      ${svgInner}
      ${titleBlock(title, number, rev)}
    </svg>
  </section>`;
}
const label = (x, y, t, size = 12, weight = 400, anchor = 'middle') => `<text x="${x}" y="${y}" font-family="Helvetica, Arial" font-size="${size}" font-weight="${weight}" text-anchor="${anchor}" fill="#1b2230">${t}</text>`;

// P&ID
const P = drawings.pid;
const d29 = px(P.d0029), d01 = px(P.d0001), rl = px(P.d0001_relief);
const pid = drawingPage('P&amp;ID — Propane recovery D-0029 / HP Separator D-0001', 'ECC-FX-101', '0', `
  <!-- D-0029 horizontal drum -->
  <rect x="${d29.x + 10}" y="${d29.y + d29.h * 0.3}" width="${d29.w - 20}" height="${d29.h * 0.4}" rx="${d29.h * 0.2}" fill="none" stroke="#1b2230" stroke-width="2"/>
  ${label(d29.x + d29.w / 2, d29.y + 14, 'D-0029', 13, 700)}
  ${label(d29.x + d29.w / 2, d29.y + 30, 'PROPANE ACCUMULATOR', 10)}
  ${label(d29.x + d29.w / 2 - 12, d29.y + d29.h + 40, 'PT-0029  LT-0029  TT-0029', 10, 400, 'end')}
  <!-- D-0001 vertical vessel -->
  <rect x="${d01.x + d01.w * 0.25}" y="${d01.y + 10}" width="${d01.w * 0.5}" height="${d01.h - 20}" rx="${d01.w * 0.25}" fill="none" stroke="#1b2230" stroke-width="2"/>
  ${label(d01.x + d01.w / 2, d01.y + d01.h + 16, 'D-0001', 13, 700)}
  ${label(d01.x + d01.w / 2, d01.y + d01.h + 32, 'HP SEPARATOR', 10)}
  ${label(d01.x + d01.w / 2, d01.y + d01.h + 48, 'PT-0001  TT-0001  LT-0001', 10)}
  <!-- feed into D-0001 -->
  <line x1="${d01.x - 110}" y1="${d01.y + d01.h * 0.45}" x2="${d01.x + d01.w * 0.25}" y2="${d01.y + d01.h * 0.45}" stroke="#1b2230" stroke-width="1.5"/>
  ${label(d01.x - 106, d01.y + d01.h * 0.45 - 8, 'FROM INLET MANIFOLD', 10, 400, 'start')}
  <!-- relief line -->
  <line x1="${d01.x + d01.w / 2}" y1="${d01.y + 10}" x2="${d01.x + d01.w / 2}" y2="${rl.y + 40}" stroke="#1b2230" stroke-width="1.5"/>
  <line x1="${d01.x + d01.w / 2}" y1="${rl.y + 40}" x2="${rl.x + rl.w - 20}" y2="${rl.y + 40}" stroke="#1b2230" stroke-width="1.5"/>
  <polygon points="${rl.x + rl.w * 0.55},${rl.y + 30} ${rl.x + rl.w * 0.55 + 16},${rl.y + 40} ${rl.x + rl.w * 0.55},${rl.y + 50}" fill="none" stroke="#1b2230" stroke-width="1.5"/>
  ${label(rl.x + rl.w * 0.55 + 8, rl.y + 20, 'PSV-0001', 10)}
  ${label(rl.x + rl.w - 20, rl.y + 60, 'TO FH-01 FLARE HEADER', 10, 700, 'end')}
  <!-- D-0029 outlet (bottom nozzle, routed down) -->
  <line x1="${d29.x + d29.w / 2}" y1="${d29.y + d29.h * 0.7}" x2="${d29.x + d29.w / 2}" y2="${d29.y + d29.h + 70}" stroke="#1b2230" stroke-width="1.5"/>
  <line x1="${d29.x + d29.w / 2}" y1="${d29.y + d29.h + 70}" x2="${d29.x + d29.w + 60}" y2="${d29.y + d29.h + 70}" stroke="#1b2230" stroke-width="1.5"/>
  ${label(d29.x + d29.w + 66, d29.y + d29.h + 74, 'TO PROPANE PUMPS P-0012A/B', 10, 400, 'start')}
  ${label(48, H - 60, 'ILLUSTRATIVE P&amp;ID — EQUIPMENT ARRANGEMENT AND RELIEF PATH ONLY', 11, 700, 'start')}
`);

// Area layout
const L = drawings.layout;
const pa = px(L.propane_area), l29 = px(L.d0029), l01 = px(L.d0001), ds = px(L.ds029), fh = px(L.fh01_damaged), dz = px(L.debris_zone);
const layout = drawingPage('Area layout — SG GSP propane recovery (plan)', 'ECC-FX-201', '0', `
  <line x1="40" y1="88" x2="${W - 40}" y2="88" stroke="#1b2230" stroke-width="2" stroke-dasharray="14 6"/>
  ${label(W / 2, 80, 'NORTH PERIMETER FENCE', 11, 700)}
  <ellipse cx="${dz.x + dz.w / 2}" cy="${dz.y + dz.h / 2}" rx="${dz.w / 2}" ry="${dz.h / 2}" fill="none" stroke="#5b6472" stroke-dasharray="6 5"/>
  ${label(dz.x + dz.w / 2, dz.y + 44, 'REPORTED DEBRIS FALL ZONE (ILLUSTRATIVE)', 10, 400)}
  <rect x="${pa.x}" y="${pa.y}" width="${pa.w}" height="${pa.h}" fill="none" stroke="#1b2230" stroke-width="1.5"/>
  ${label(pa.x + 8, pa.y + 18, 'PROPANE RECOVERY AREA', 11, 700, 'start')}
  <rect x="${pa.x + pa.w + 24}" y="${pa.y}" width="${pa.w * 0.7}" height="${pa.h}" fill="none" stroke="#1b2230" stroke-width="1.5"/>
  ${label(pa.x + pa.w + 32, pa.y + 18, 'INLET SEPARATION', 11, 700, 'start')}
  <rect x="${l29.x}" y="${l29.y}" width="${l29.w}" height="${l29.h}" rx="${l29.h / 2}" fill="#fff" stroke="#1b2230" stroke-width="2"/>
  ${label(l29.x + l29.w / 2, l29.y + l29.h / 2 + 4, 'D-0029', 12, 700)}
  <circle cx="${l01.x + l01.w / 2}" cy="${l01.y + l01.h / 2}" r="${l01.w / 2}" fill="#fff" stroke="#1b2230" stroke-width="2"/>
  ${label(l01.x + l01.w / 2, l01.y + l01.h / 2 + 4, 'D-0001', 12, 700)}
  <rect x="${ds.x}" y="${ds.y}" width="${ds.w}" height="${ds.h}" fill="#fff" stroke="#1b2230" stroke-width="1.5"/>
  ${label(ds.x + ds.w / 2, ds.y + ds.h / 2 + 4, 'DS-029', 11, 700)}
  ${label(ds.x + ds.w / 2, ds.y + ds.h + 14, 'DELUGE SKID', 9)}
  <line x1="${pa.x}" y1="${fh.y + fh.h / 2}" x2="${W - 120}" y2="${fh.y + fh.h / 2}" stroke="#1b2230" stroke-width="3"/>
  ${label(pa.x + 4, fh.y + fh.h / 2 - 10, 'FH-01 FLARE HEADER', 11, 700, 'start')}
  <circle cx="${W - 110}" cy="${fh.y + fh.h / 2}" r="16" fill="none" stroke="#1b2230" stroke-width="2"/>
  ${label(W - 110, fh.y + fh.h / 2 + 36, 'FLARE', 10, 700)}
  ${label(fh.x + fh.w / 2, fh.y + fh.h + 10, 'HEADER SECTION NEAR PROPANE AREA', 9)}
  ${label(48, H - 60, 'ILLUSTRATIVE PLAN — RELATIVE POSITIONS ONLY, NOT TO SCALE', 11, 700, 'start')}
`);

// Dependency view
const Dp = drawings.dependency;
const nr = px(Dp.normal_route), ur = px(Dp.upstream_route), dl = px(Dp.deluge);
const box = (x, y, w, h, t, sub) => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="6" fill="#fff" stroke="#1b2230" stroke-width="1.5"/>${label(x + w / 2, y + h / 2 + (sub ? -2 : 5), t, 12, 700)}${sub ? label(x + w / 2, y + h / 2 + 14, sub, 9) : ''}`;
const arrow = (x1, y1, x2, y2, dash) => `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="#1b2230" stroke-width="1.5" ${dash ? 'stroke-dasharray="6 5"' : ''} marker-end="url(#ah)"/>`;
const dependency = drawingPage('Depressurization dependency view — D-0001', 'ECC-FX-301', '0', `
  <defs><marker id="ah" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" fill="#1b2230"/></marker></defs>
  ${label(W / 2, 80, 'DEPENDENCY VIEW — WHAT D-0001 DEPRESSURIZATION DEPENDS ON (ILLUSTRATIVE)', 11, 700)}
  ${box(60, 300, 130, 60, 'D-0029', 'Propane accumulator')}
  ${box(230, 300, 130, 60, 'D-0001', 'HP Separator')}
  ${arrow(190, 330, 230, 330)}
  ${label(210, 320, 'heat', 9)}
  <!-- normal route -->
  ${box(nr.x + 10, nr.y + 20, 140, 56, 'FH-01', 'Flare header')}
  ${box(nr.x + 190, nr.y + 20, 140, 56, 'V-0007', 'Flare KO drum')}
  ${box(nr.x + 370, nr.y + 20, 120, 56, 'FLARE', 'Stack')}
  ${arrow(nr.x + 150, nr.y + 48, nr.x + 190, nr.y + 48)}
  ${arrow(nr.x + 330, nr.y + 48, nr.x + 370, nr.y + 48)}
  ${arrow(360, 318, nr.x + 10, nr.y + 48)}
  ${label(nr.x + 10, nr.y + 8, 'NORMAL ROUTE — PSV-0001 TO FH-01', 10, 700, 'start')}
  <!-- upstream route -->
  ${box(ur.x + 10, ur.y + 20, 140, 56, 'INLET MANIFOLD', 'Upstream isolation')}
  ${box(ur.x + 190, ur.y + 20, 140, 56, 'V-0007', 'Flare KO drum')}
  ${box(ur.x + 370, ur.y + 20, 120, 56, 'FLARE', 'Stack')}
  ${arrow(ur.x + 150, ur.y + 48, ur.x + 190, ur.y + 48, true)}
  ${arrow(ur.x + 330, ur.y + 48, ur.x + 370, ur.y + 48, true)}
  ${arrow(360, 342, ur.x + 10, ur.y + 48, true)}
  ${label(ur.x + 10, ur.y + 8, 'UPSTREAM ROUTE — VIA INLET MANIFOLD (DASHED: NOT NORMALLY IN SERVICE)', 10, 700, 'start')}
  <!-- deluge -->
  ${box(dl.x + 10, dl.y + 20, 120, 50, 'FW-01', 'Firewater pumps')}
  ${box(dl.x + 170, dl.y + 20, 120, 50, 'DS-029', 'Area deluge')}
  ${arrow(dl.x + 130, dl.y + 45, dl.x + 170, dl.y + 45)}
  ${arrow(dl.x + 230, dl.y + 20, 125, 360)}
  ${arrow(dl.x + 240, dl.y + 20, 295, 360)}
  ${label(dl.x + 10, dl.y + 8, 'FIRE PROTECTION — COOLING FOR D-0029 AND D-0001', 10, 700, 'start')}
  ${label(48, H - 60, 'RELATIONSHIPS ARE ILLUSTRATIVE. NOT A P&amp;ID, NOT A LAYOUT.', 11, 700, 'start')}
`);

const docs = [
  { file: 'ECC-FX-001_rev1.pdf', size: PORTRAIT, html: fire },
  { file: 'ECC-FX-002_rev2.pdf', size: PORTRAIT, html: depressRev2 },
  { file: 'ECC-FX-002_rev3.pdf', size: PORTRAIT, html: depressRev3 },
  { file: 'ECC-FX-003_revA.pdf', size: PORTRAIT, html: limits },
  { file: 'ECC-FX-901_rev1.pdf', size: PORTRAIT, html: pastIncident },
  { file: 'ECC-FX-101_rev0.pdf', size: LANDSCAPE, html: pid },
  { file: 'ECC-FX-201_rev0.pdf', size: LANDSCAPE, html: layout },
  { file: 'ECC-FX-301_rev0.pdf', size: LANDSCAPE, html: dependency },
];

await mkdir(out, { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const pg = await browser.newPage();
for (const d of docs) {
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${css(d.size)}</style></head><body>${d.html}</body></html>`;
  await pg.setContent(html, { waitUntil: 'load' });
  const buf = await pg.pdf({ width: `${d.size.w}px`, height: `${d.size.h}px`, printBackground: true, margin: { top: 0, right: 0, bottom: 0, left: 0 }, preferCSSPageSize: false });
  await writeFile(resolve(out, d.file), buf);
  console.log('wrote', d.file, buf.length, 'bytes');
}
await browser.close();
