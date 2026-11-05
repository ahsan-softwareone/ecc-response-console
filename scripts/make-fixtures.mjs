// Generates the fictional demonstration documents in public/docs. Run: node scripts/make-fixtures.mjs
// These are interaction fixtures, not operating guidance. Uses the installed Chrome to print real PDFs,
// so text pages have a genuine text layer and the scanned page is genuinely image-only.
import { chromium } from 'playwright-core';
import fs from 'node:fs';

const OUT = new URL('../public/docs/', import.meta.url).pathname;
const NOTE = 'FICTIONAL TRAINING DOCUMENT. NOT OPERATING GUIDANCE.';
const browser = await chromium.launch({ channel: 'chrome' });
const page = await browser.newPage({ viewport: { width: 794, height: 1123 } });

const css = `
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  body { margin: 0; font: 13.5px/1.6 Georgia, 'Times New Roman', serif; color: #111; }
  .page { width: 794px; height: 1123px; padding: 64px 76px; position: relative; page-break-after: always; overflow: hidden; }
  .head { display: flex; justify-content: space-between; font: 10.5px Arial, sans-serif; border-bottom: 1px solid #444; padding-bottom: 6px; margin-bottom: 44px; }
  .foot { position: absolute; left: 76px; right: 76px; bottom: 44px; display: flex; justify-content: space-between; font: 10.5px Arial, sans-serif; border-top: 1px solid #999; padding-top: 6px; }
  h1 { font: bold 25px Arial, sans-serif; margin: 150px 0 10px; }
  h2 { font: bold 16px Arial, sans-serif; margin: 0 0 14px; }
  h3 { font: bold 13px Arial, sans-serif; margin: 22px 0 6px; }
  p { margin: 0 0 12px; }
  table { border-collapse: collapse; width: 100%; font: 12px Arial, sans-serif; margin: 12px 0 18px; }
  td, th { border: 1px solid #666; padding: 7px 9px; text-align: left; vertical-align: top; }
  .meta { font: 12.5px Arial, sans-serif; }
`;
const shell = (number, rev, title, n, total, body) => `<section class="page"><div class="head"><span>${number} ${rev}</span><span>${NOTE}</span></div>${body}<div class="foot"><span>${title}</span><span>Page ${n} of ${total}</span></div></section>`;
const pdf = async (name, html, opts = { format: 'A4' }) => {
  await page.setContent(`<!doctype html><meta charset="utf-8"><style>${css}</style>${html}`);
  await page.pdf({ path: OUT + name, printBackground: true, preferCSSPageSize: !opts.width, ...opts });
};

function erp(rev, from, s4) {
  const n = 'ERP-T-07', t = 'Emergency response procedure', T = 5;
  return [
    shell(n, rev, t, 1, T, `<h1>${t}</h1><p class="meta">Document ${n}, ${rev}<br>Effective from ${from}<br>Wadi Sarab Processing Facility (fictional)</p><p class="meta">Training placeholder. A customer procedure would appear here.</p>`),
    shell(n, rev, t, 2, T, `<h2>Section 1. Purpose of this training document</h2><p>This document exists so that the ECC prototype can demonstrate opening an original source at a cited page. It describes no real facility and instructs nobody.</p><p>Section 2 and Section 4 are cited by the demonstration incident.</p>`),
    shell(n, rev, t, 3, T, `<h2>Section 2. Access to the affected area</h2><p>The person responsible decides how access to an affected area is managed while its status is unclear.</p><p>This placeholder does not set out how that decision is made. In a customer procedure, the person responsible would be defined here.</p><p>Training placeholder. A customer procedure would appear here.</p>`),
    shell(n, rev, t, 4, T, `<h2>Section 3. Recording what happened</h2><p>Decisions and reported actions are recorded with who recorded them and when.</p><p>Training placeholder. A customer procedure would appear here.</p>`),
    shell(n, rev, t, 5, T, `<h2>Section 4. Personnel accountability</h2><p>${s4}</p><p>Training placeholder. A customer procedure would appear here.</p>`),
  ].join('');
}
await pdf('erp-t-07-rev-c.pdf', erp('Rev C', '12 Jan (fictional)', 'Establish who was in the affected area and where they are now.'));
await pdf('erp-t-07-rev-d.pdf', erp('Rev D', 'Today, 14:24 (fictional)', 'Establish who was in the affected area and where they are now, including contractors on open permits.'));

await pdf('eq-p-3104b.pdf', shell('EQ-P-3104B', 'Record of 12 Mar', 'Equipment record', 1, 1, `<h2>Equipment register entry: P-3104B</h2><table>
  <tr><th>Tag</th><td>P-3104B</td></tr><tr><th>Service</th><td>Condensate transfer</td></tr>
  <tr><th>Position</th><td>Position: duty, with standby P-3104A.</td></tr>
  <tr><th>Location</th><td>Location: Area 31 pump skid.</td></tr><tr><th>Record last updated</th><td>12 Mar (fictional)</td></tr></table>`));

await pdf('wp-58821.pdf', shell('WP-58821', 'Issue 1', 'Work permit', 1, 1, `<h2>Work permit WP-58821</h2><table>
  <tr><th>Work</th><td>Scaffolding, PR-31 south side</td></tr><tr><th>Crew</th><td>Crew: 4 contractors.</td></tr>
  <tr><th>Opened</th><td>07:30</td></tr><tr><th>Valid until</th><td>16:00</td></tr><tr><th>Close-out</th><td>Close-out: none recorded.</td></tr></table>
  <p>A permit shows where work was authorised. It does not show where the crew is now.</p>`));

// Manual: page 4 is a picture of a page, with no text layer.
const scanHtml = `<!doctype html><style>${css} body{background:#f4f1e8} .page{transform:rotate(-.7deg);filter:contrast(.92) blur(.25px)}</style>${shell('MAN-3104', 'Edition 2', 'Condensate transfer pump manual', 4, 4, `<h2>Section 6. Seal arrangement</h2><table><tr><th>Item</th><th>Description</th><th>Part ref.</th></tr><tr><td>1</td><td>Seal assembly, schematic only</td><td>FX-101</td></tr><tr><td>2</td><td>Seal housing</td><td>FX-102</td></tr><tr><td>3</td><td>Flush connection</td><td>FX-103</td></tr></table><p>Fictional scanned table for the training scenario.</p>`)}`;
await page.setContent(scanHtml);
const scan = (await page.screenshot({ clip: { x: 0, y: 0, width: 794, height: 1123 } })).toString('base64');
const m = 'MAN-3104', mr = 'Edition 2', mt = 'Condensate transfer pump manual';
await pdf('man-3104.pdf', [
  shell(m, mr, mt, 1, 4, `<h1>${mt}</h1><p class="meta">Excerpt for the training scenario. Fictional.</p>`),
  shell(m, mr, mt, 2, 4, `<h2>Section 1. General description</h2><p>Duty and standby pumps share a skid. Placeholder description for training.</p>`),
  shell(m, mr, mt, 3, 4, `<h2>Section 2. Identification</h2><p>Fictional pump tags P-3104A and P-3104B are covered by this excerpt.</p>`),
  `<section class="page" style="padding:0"><img src="data:image/png;base64,${scan}" style="width:794px;height:1123px;display:block"></section>`,
].join(''));

// Drawings: a 900x560 sheet, so catalog regions are simply x/900 and y/560.
const sheetCss = `<style>
  svg text { font-family: Arial, sans-serif; fill: #111; } .tag { font-size: 16px; font-weight: 700; } .sub { font-size: 12px; } .small { font-size: 11px; } .note { font-size: 11px; }
  .l { fill: none; stroke: #111; stroke-width: 1.8; } .b { fill: #fff; stroke: #111; stroke-width: 1.8; } .d { fill: none; stroke: #555; stroke-width: 1; stroke-dasharray: 5 4; } .bold { font-weight: 700; }
</style>`;
const frame = (number, rev, sheet, title, body) => `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="560" viewBox="0 0 900 560" style="display:block">
  <rect x="0" y="0" width="900" height="560" fill="#fff"/><rect x="14" y="14" width="872" height="532" class="l"/>
  <rect x="646" y="464" width="240" height="82" class="l"/><line x1="646" y1="490" x2="886" y2="490" class="l"/><line x1="646" y1="518" x2="886" y2="518" class="l"/><line x1="796" y1="490" x2="796" y2="546" class="l"/>
  <text x="654" y="481" class="small bold">${title}</text><text x="654" y="508" class="small">Drawing ${number}</text><text x="804" y="508" class="small">${rev}</text><text x="654" y="536" class="small">Sheet ${sheet}</text><text x="804" y="536" class="small bold">ILLUSTRATIVE</text>
  <text x="28" y="522" class="small">Illustrative drawing for training. Not a validated engineering drawing. Not to scale.</text><text x="28" y="537" class="small">${NOTE}</text>${body}</svg>`;
const valve = (x, y) => `<path transform="translate(${x} ${y})" d="M-9 -7 L9 7 L9 -7 L-9 7 Z" class="b"/>`;
const pump = (x, y, tag, sub) => `<circle cx="${x}" cy="${y}" r="22" class="b"/><path d="M${x} ${y - 22} L${x + 30} ${y - 22} L${x + 30} ${y - 15}" class="l"/><path d="M${x - 18} ${y + 22} L${x + 18} ${y + 22} L${x + 24} ${y + 30} L${x - 24} ${y + 30} Z" class="b"/><text x="${x}" y="${y - 30}" class="tag" text-anchor="middle">${tag}</text><text x="${x}" y="${y + 46}" class="sub" text-anchor="middle">${sub}</text>`;
const pid = frame('PID-31-02', 'Rev B', '2 of 4', 'P&amp;ID, condensate transfer, Area 31/32', `
  <path d="M110 150 Q110 128 150 128 Q190 128 190 150 L190 320 Q190 342 150 342 Q110 342 110 320 Z" class="b"/><line x1="118" y1="230" x2="182" y2="230" class="d"/>
  <text x="150" y="116" class="tag" text-anchor="middle">T-3201</text><text x="150" y="362" class="sub" text-anchor="middle">Rundown tank, Area 32</text>
  <path d="M190 300 L250 300 L250 240 L468 240 M250 300 L250 360 L468 360" class="l"/>${valve(300, 240)}${valve(300, 360)}
  <text x="340" y="230" class="small">31-CD-101-6"</text><text x="340" y="378" class="small">31-CD-102-6"</text>
  ${pump(490, 240, 'P-3104A', 'standby')}${pump(490, 360, 'P-3104B', 'duty')}
  <path d="M520 225 L590 225 L590 300 L760 300 M520 345 L590 345 L590 300" class="l"/>${valve(560, 225)}${valve(560, 345)}${valve(700, 300)}
  <text x="600" y="290" class="small">31-CD-110-4"</text>
  <path d="M760 286 L840 286 L856 300 L840 314 L760 314 Z" class="b"/><text x="770" y="304" class="small">via PR-31</text><text x="868" y="336" class="sub" text-anchor="end">to Area 33, sheet 3</text>
  <rect x="440" y="186" width="110" height="234" class="d"/><text x="446" y="436" class="sub">Shared pump skid</text>
  <text x="30" y="48" class="note">NOTES: 1. Line connections extracted automatically; not engineer-checked.</text><text x="30" y="66" class="note">2. Instrumentation omitted on this training sheet.</text>`);
const lay = frame('PLT-31-02', 'Rev A', '1 of 1', 'Plot plan, Area 31 layout', `
  <path transform="translate(70 70)" d="M0 -26 L10 10 L0 2 L-10 10 Z" class="b"/><text x="70" y="102" class="sub" text-anchor="middle">N</text>
  <rect x="60" y="120" width="190" height="300" class="l"/><text x="72" y="142" class="sub bold">AREA 32</text><text x="72" y="158" class="sub">Condensate rundown</text>
  <circle cx="155" cy="280" r="52" class="b"/><circle cx="155" cy="280" r="46" class="l"/><text x="155" y="280" class="tag" text-anchor="middle">T-3201</text><text x="155" y="296" class="sub" text-anchor="middle">tank</text>
  <rect x="290" y="120" width="320" height="240" class="l"/><text x="302" y="142" class="sub bold">AREA 31</text><text x="302" y="158" class="sub">Condensate transfer</text>
  <rect x="360" y="200" width="190" height="120" class="d"/><text x="368" y="216" class="sub">Pump skid</text>
  <rect x="380" y="240" width="58" height="52" class="b"/><text x="409" y="262" class="small bold" text-anchor="middle">P-3104A</text><text x="409" y="278" class="small" text-anchor="middle">standby</text>
  <rect x="470" y="240" width="58" height="52" class="b"/><text x="499" y="262" class="small bold" text-anchor="middle">P-3104B</text><text x="499" y="278" class="small" text-anchor="middle">duty</text>
  <rect x="250" y="372" width="430" height="40" class="b"/><text x="300" y="398" class="tag">PR-31</text><text x="360" y="396" class="small">pipe rack, south side of Area 31, services continue east</text>
  <rect x="400" y="426" width="210" height="22" class="d"/><text x="408" y="441" class="small">WP-58821 scaffolding (permit area)</text>
  <rect x="700" y="200" width="150" height="220" class="l"/><text x="712" y="222" class="sub bold">AREA 33</text><text x="712" y="238" class="sub">Downstream</text>
  <path d="M680 392 L700 392" class="l"/><rect x="60" y="452" width="570" height="16" class="d"/><text x="70" y="464" class="small">Plant road</text>
  <text x="110" y="48" class="note">NOTES: 1. Distances not to scale. 2. Fire detector locations omitted on this training sheet.</text>`);
const sheetOpts = { width: '900px', height: '560px', printBackground: true, pageRanges: '1' };
await page.setViewportSize({ width: 900, height: 560 });
for (const [name, svg] of [['pid-31-02-rev-b.pdf', pid], ['plt-31-02-rev-a.pdf', lay]]) {
  await page.setContent(`<!doctype html><meta charset="utf-8"><style>@page{size:900px 560px;margin:0}body{margin:0}</style>${sheetCss}${svg}`);
  await page.pdf({ path: OUT + name, ...sheetOpts });
}
await browser.close();
console.log(fs.readdirSync(OUT).join('\n'));
