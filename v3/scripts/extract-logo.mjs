// Derives the dotted "A" symbol from the supplied PNG: finds every dot (connected
// component of non-background pixels in the symbol area), its centre, radius and
// mean colour, and writes a transparent SVG plus JSON. Nothing is redrawn by hand.
import { chromium } from 'playwright-core';
import { readFile, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
const here = dirname(fileURLToPath(import.meta.url));
const png = await readFile(resolve(here, '../brand-source/upstream-ecc-ai-agent-supplied.png'));
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage();
const data = await page.evaluate(async (b64) => {
  const img = new Image(); img.src = 'data:image/png;base64,' + b64; await img.decode();
  const c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0);
  const { data } = ctx.getImageData(0, 0, c.width, c.height);
  return { w: c.width, h: c.height, px: Array.from(data) };
}, png.toString('base64'));
await browser.close();
const { w, h, px } = data;
const at = (x, y) => { const i = (y * w + x) * 4; return [px[i], px[i + 1], px[i + 2]]; };
// background estimate from the corners
const bg = at(1, 1);
const isFg = (x, y) => { const [r, g, b] = at(x, y); return Math.abs(r - bg[0]) + Math.abs(g - bg[1]) + Math.abs(b - bg[2]) > 90; };
// symbol area: leftmost columns before the text block; find the first text column gap
let symbolRight = 0; const colHas = Array.from({ length: w }, (_, x) => { for (let y = 0; y < h; y++) if (isFg(x, y)) return true; return false; });
let x = 0; while (x < w && !colHas[x]) x++; while (x < w && colHas[x]) x++; symbolRight = x;
// Dots sit on a ~3 px lattice and often touch, so connected components merge them.
// Instead: build an intensity map (distance from background), upsample it 4x with
// bilinear interpolation, blur, and take local maxima (one per dot). Each dot's
// radius comes from the intensity mass around it; its colour from the mean of its
// pixels, smoothed with its nearest neighbours to remove sub-pixel colour noise.
const U = 4;
const inten = new Float32Array(w * h);
for (let y = 0; y < h; y++) for (let x0 = 0; x0 < symbolRight; x0++) { const [r, g, b] = at(x0, y); inten[y * w + x0] = Math.min(1, (Math.abs(r - bg[0]) + Math.abs(g - bg[1]) + Math.abs(b - bg[2])) / 360); }
const W = symbolRight * U, H = h * U;
const up = new Float32Array(W * H);
for (let Y = 0; Y < H; Y++) for (let X = 0; X < W; X++) {
  const fx = (X + 0.5) / U - 0.5, fy = (Y + 0.5) / U - 0.5; const x0 = Math.floor(fx), y0 = Math.floor(fy); const tx = fx - x0, ty = fy - y0;
  const g = (xx, yy) => (xx < 0 || yy < 0 || xx >= symbolRight || yy >= h ? 0 : inten[yy * w + xx]);
  up[Y * W + X] = g(x0, y0) * (1 - tx) * (1 - ty) + g(x0 + 1, y0) * tx * (1 - ty) + g(x0, y0 + 1) * (1 - tx) * ty + g(x0 + 1, y0 + 1) * tx * ty;
}
const blurU = (src, rad) => { const out = new Float32Array(W * H); for (let Y = 0; Y < H; Y++) for (let X = 0; X < W; X++) { let s2 = 0, n = 0; for (let dy = -rad; dy <= rad; dy++) for (let dx = -rad; dx <= rad; dx++) { const xx = X + dx, yy = Y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; s2 += src[yy * W + xx]; n++; } out[Y * W + X] = s2 / n; } return out; };
const bl = blurU(blurU(up, 2), 2);
const NMS = 5; // upsampled px (~1.25 px original)
const raw = [];
for (let Y = 0; Y < H; Y++) for (let X = 0; X < W; X++) {
  const v = bl[Y * W + X]; if (v < 0.3) continue;
  let isMax = true;
  for (let dy = -NMS; dy <= NMS && isMax; dy++) for (let dx = -NMS; dx <= NMS; dx++) { if (!dx && !dy) continue; const xx = X + dx, yy = Y + dy; if (xx < 0 || yy < 0 || xx >= W || yy >= H) continue; const u2 = bl[yy * W + xx]; if (u2 > v || (u2 === v && (dy < 0 || (dy === 0 && dx < 0)))) { isMax = false; break; } }
  if (!isMax) continue;
  // intensity mass within 1.6 px of the centre -> radius
  const cx = (X + 0.5) / U, cy = (Y + 0.5) / U; let mass = 0, rr = 0, gg = 0, bb = 0, cn = 0;
  for (let yy = Math.floor(cy - 2); yy <= Math.ceil(cy + 2); yy++) for (let xx = Math.floor(cx - 2); xx <= Math.ceil(cx + 2); xx++) { if (xx < 0 || yy < 0 || xx >= symbolRight || yy >= h) continue; const d2 = (xx + 0.5 - cx) ** 2 + (yy + 0.5 - cy) ** 2; if (d2 > 1.6 * 1.6) continue; const iv = inten[yy * w + xx]; mass += iv; if (iv > 0.5) { const c = at(xx, yy); rr += c[0]; gg += c[1]; bb += c[2]; cn++; } }
  raw.push({ cx: +cx.toFixed(2), cy: +cy.toFixed(2), r: +Math.max(1.05, Math.min(2.2, Math.sqrt(mass / Math.PI) * 1.16)).toFixed(2), n: Math.round(mass), col: cn ? [rr / cn, gg / cn, bb / cn] : [0, 200, 200] });
}
// colour smoothing with nearest neighbours (within 4 px); keep the bright white centre dot as is
const dots = raw.map((d) => {
  const isWhite = d.col[0] > 150 && d.col[1] > 150 && d.col[2] > 150;
  if (isWhite) return { cx: d.cx, cy: d.cy, r: +Math.max(d.r, 2.1).toFixed(2), n: d.n, color: '#e8fbf7' };
  const nb = raw.filter((o) => !(o.col[0] > 150 && o.col[1] > 150 && o.col[2] > 150) && (o.cx - d.cx) ** 2 + (o.cy - d.cy) ** 2 <= 16);
  const m = [0, 1, 2].map((i) => nb.reduce((s2, o) => s2 + o.col[i], 0) / nb.length);
  return { cx: d.cx, cy: d.cy, r: d.r, n: d.n, color: `#${m.map((v2) => Math.round(v2).toString(16).padStart(2, '0')).join('')}` };
});
const minX = Math.min(...dots.map((d) => d.cx - d.r)), maxX = Math.max(...dots.map((d) => d.cx + d.r)), minY = Math.min(...dots.map((d) => d.cy - d.r)), maxY = Math.max(...dots.map((d) => d.cy + d.r));
const pad = 1; const vb = [minX - pad, minY - pad, maxX - minX + pad * 2, maxY - minY + pad * 2].map((v) => +v.toFixed(2));
const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${vb.join(' ')}" width="${vb[2]}" height="${vb[3]}" aria-hidden="true">\n${dots.map((d) => `  <circle cx="${d.cx}" cy="${d.cy}" r="${d.r}" fill="${d.color}"/>`).join('\n')}\n</svg>\n`;
await writeFile(resolve(here, '../brand-source/symbol-dots.json'), JSON.stringify({ image: { w, h, bg: `rgb(${bg.join(',')})`, symbolRight }, viewBox: vb, dots }, null, 1));
await writeFile(resolve(here, '../public/brand/ecc-symbol.svg'), svg).catch(async () => { const { mkdir } = await import('node:fs/promises'); await mkdir(resolve(here, '../public/brand'), { recursive: true }); await writeFile(resolve(here, '../public/brand/ecc-symbol.svg'), svg); });
console.log('image', w, 'x', h, 'bg', bg, 'symbolRight', symbolRight, 'dots', dots.length, 'viewBox', vb.join(' '));
console.log('sizes', dots.map((d) => d.n).sort((a, b) => a - b).join(','));
console.log('colours', [...new Set(dots.map((d) => d.color))].slice(0, 12).join(' '));
