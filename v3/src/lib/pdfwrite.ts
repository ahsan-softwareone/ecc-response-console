// Minimal PDF writer (no dependency): A4 pages, Helvetica / Helvetica-Bold,
// word-wrapped text, rules, a running header and footer. Enough for a properly
// formatted report whose text layer can be parsed back by pdf.js.

const PAGE_W = 595.28, PAGE_H = 841.89, MARGIN = 56;

// WinAnsi mapping for the few non-ASCII characters the UI uses.
const WINANSI: Record<string, number> = { '·': 0xb7, '—': 0x97, '–': 0x96, '°': 0xb0, '³': 0xb3, '’': 0x92, '‘': 0x91, '“': 0x93, '”': 0x94, '×': 0xd7, '…': 0x85, '§': 0xa7, '→': 0x2d, '²': 0xb2, '≤': 0x3c, '≥': 0x3e, '•': 0x95 };
function enc(s: string): string {
  let out = '';
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    let code = c < 128 ? c : (WINANSI[ch] ?? 0x3f);
    if (ch === '→') { out += '->'; continue; }
    if (code === 0x28 || code === 0x29 || code === 0x5c) out += '\\' + String.fromCharCode(code);
    else if (code < 32 || code > 126) out += '\\' + code.toString(8).padStart(3, '0');
    else out += String.fromCharCode(code);
  }
  return out;
}

// Helvetica average widths (per 1000 em) for wrapping; close enough for layout.
const W: Record<string, number> = {};
'abcdeghknopqsuvxyz'.split('').forEach((c) => (W[c] = 556)); 'fjtrI'.split('').forEach((c) => (W[c] = 278)); W.i = 222; W.l = 222; W.m = 833; W.w = 722;
'ABEKPSVXY'.split('').forEach((c) => (W[c] = 667)); 'CDHNRUw'.split('').forEach((c) => (W[c] = 722)); 'GOQ'.split('').forEach((c) => (W[c] = 778)); W.M = 833; W.W = 944; W.F = 611; W.T = 611; W.Z = 611; W.L = 556; W.J = 500;
'0123456789'.split('').forEach((c) => (W[c] = 556)); W[' '] = 278; W['.'] = 278; W[','] = 278; W[':'] = 278; W[';'] = 278; W['-'] = 333; W['('] = 333; W[')'] = 333; W['/'] = 278; W['·'] = 278; W['•'] = 350;
function width(s: string, size: number, bold = false) { let w = 0; for (const ch of s) w += (W[ch] ?? 600) * (bold ? 1.05 : 1); return (w / 1000) * size; }

export interface PdfMeta { title: string; subtitle: string; footer: string; marker: string }

export class PdfDoc {
  private pages: string[][] = [];
  private cur: string[] = [];
  private y = PAGE_H - MARGIN;
  private meta: PdfMeta;
  constructor(meta: PdfMeta) { this.meta = meta; this.newPage(); }

  private newPage() {
    if (this.cur.length) this.pages.push(this.cur);
    this.cur = [];
    this.y = PAGE_H - MARGIN;
    // running header: marker + title
    this.raw(`BT /F1 8 Tf 0.36 0.39 0.45 rg ${MARGIN} ${PAGE_H - 30} Td (${enc(this.meta.marker.toUpperCase())}) Tj ET`);
    this.raw(`BT /F1 8 Tf 0.36 0.39 0.45 rg ${PAGE_W - MARGIN - width(this.meta.title, 8)} ${PAGE_H - 30} Td (${enc(this.meta.title)}) Tj ET`);
    this.raw(`0.78 0.8 0.84 RG 0.5 w ${MARGIN} ${PAGE_H - 38} m ${PAGE_W - MARGIN} ${PAGE_H - 38} l S`);
  }
  private raw(s: string) { this.cur.push(s); }
  private ensure(h: number) { if (this.y - h < MARGIN + 24) this.newPage(); }

  text(s: string, opts: { size?: number; bold?: boolean; color?: [number, number, number]; indent?: number; gap?: number } = {}) {
    const size = opts.size ?? 10, bold = opts.bold ?? false, indent = opts.indent ?? 0;
    const maxW = PAGE_W - MARGIN * 2 - indent;
    const lines: string[] = [];
    for (const para of s.split('\n')) {
      let line = '';
      for (const word of para.split(/\s+/)) {
        const cand = line ? `${line} ${word}` : word;
        if (width(cand, size, bold) > maxW && line) { lines.push(line); line = word; } else line = cand;
      }
      lines.push(line);
    }
    const lh = size * 1.4;
    for (const ln of lines) {
      this.ensure(lh);
      const [r, g, b] = opts.color ?? [0.08, 0.13, 0.18];
      this.raw(`BT /${bold ? 'F2' : 'F1'} ${size} Tf ${r} ${g} ${b} rg ${MARGIN + indent} ${this.y - size} Td (${enc(ln)}) Tj ET`);
      this.y -= lh;
    }
    this.y -= opts.gap ?? 2;
  }
  /** Word-wrap to a width without drawing. */
  wrap(s: string, size: number, maxW: number, bold = false): string[] {
    const lines: string[] = [];
    for (const para of s.split('\n')) { let line = ''; for (const word of para.split(/\s+/)) { const cand = line ? `${line} ${word}` : word; if (width(cand, size, bold) > maxW && line) { lines.push(line); line = word; } else line = cand; } lines.push(line); }
    return lines;
  }
  /** A bullet with a hanging indent: wrapped lines align with the text, not the bullet. */
  bullet(s: string, opts: { size?: number; indent?: number; color?: [number, number, number]; gap?: number } = {}) {
    const size = opts.size ?? 10, indent = opts.indent ?? 0, hang = 13;
    const lines = this.wrap(s, size, PAGE_W - MARGIN * 2 - indent - hang);
    const lh = size * 1.38;
    this.ensure(lh * Math.min(lines.length, 2));
    const [r, g, b] = opts.color ?? [0.08, 0.13, 0.18];
    this.raw(`BT /F1 ${size} Tf 0.45 0.5 0.56 rg ${MARGIN + indent + 2} ${this.y - size} Td (${enc('•')}) Tj ET`);
    for (const ln of lines) { this.ensure(lh); this.raw(`BT /F1 ${size} Tf ${r} ${g} ${b} rg ${MARGIN + indent + hang} ${this.y - size} Td (${enc(ln)}) Tj ET`); this.y -= lh; }
    this.y -= opts.gap ?? 3;
  }
  /** Text on a light panel, for the one thing to read first. */
  callout(s: string, opts: { size?: number; bold?: boolean } = {}) {
    const size = opts.size ?? 11.5, bold = opts.bold ?? true, pad = 10;
    const lines = this.wrap(s, size, PAGE_W - MARGIN * 2 - pad * 2, bold);
    const lh = size * 1.4, h = lines.length * lh + pad * 2 - (lh - size);
    this.ensure(h + 4);
    this.raw(`0.945 0.953 0.965 rg ${MARGIN} ${this.y - h} ${PAGE_W - MARGIN * 2} ${h} re f`);
    let y = this.y - pad;
    for (const ln of lines) { this.raw(`BT /${bold ? 'F2' : 'F1'} ${size} Tf 0.08 0.13 0.18 rg ${MARGIN + pad} ${y - size} Td (${enc(ln)}) Tj ET`); y -= lh; }
    this.y -= h + 6;
  }
  /** A section heading with a hairline under it. */
  section(s: string) { this.space(8); this.text(s, { size: 11, bold: true, gap: 0 }); this.raw(`0.82 0.84 0.87 RG 0.6 w ${MARGIN} ${this.y - 1} m ${PAGE_W - MARGIN} ${this.y - 1} l S`); this.y -= 7; }
  heading(s: string, level: 1 | 2 = 1) { this.space(level === 1 ? 10 : 6); this.text(s, { size: level === 1 ? 15 : 11.5, bold: true, gap: level === 1 ? 6 : 3 }); if (level === 1) this.rule(); }
  label(s: string) { this.text(s.toUpperCase(), { size: 7.5, bold: true, color: [0.36, 0.39, 0.45], gap: 1 }); }
  rule() { this.ensure(6); this.raw(`0.78 0.8 0.84 RG 0.5 w ${MARGIN} ${this.y - 2} m ${PAGE_W - MARGIN} ${this.y - 2} l S`); this.y -= 8; }
  space(h: number) { this.y -= h; }
  /** A timeline row: time column + category + text. */
  row(time: string, cat: string, text: string, sub?: string) {
    this.ensure(28);
    const top = this.y;
    this.raw(`BT /F1 9 Tf 0.3 0.33 0.4 rg ${MARGIN} ${top - 9} Td (${enc(time)}) Tj ET`);
    this.raw(`BT /F2 7.5 Tf 0.36 0.39 0.45 rg ${MARGIN + 44} ${top - 9} Td (${enc(cat.toUpperCase())}) Tj ET`);
    const indent = 150;
    this.text(text, { size: 9.5, indent, gap: 0 });
    if (sub) this.text(sub, { size: 8, indent, color: [0.4, 0.44, 0.5], gap: 0 });
    this.y -= 5;
    this.raw(`0.9 0.91 0.93 RG 0.4 w ${MARGIN} ${this.y + 1} m ${PAGE_W - MARGIN} ${this.y + 1} l S`);
  }

  build(): Blob {
    if (this.cur.length) { this.pages.push(this.cur); this.cur = []; }
    const n = this.pages.length;
    const objs: string[] = [];
    const add = (s: string) => { objs.push(s); return objs.length; };
    const fontN = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    const fontB = add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    const pagesId = objs.length + 1 + n * 2; // computed after pages are added
    const pageIds: number[] = [];
    this.pages.forEach((content, i) => {
      const footer = `BT /F1 8 Tf 0.36 0.39 0.45 rg ${MARGIN} 28 Td (${enc(`${this.meta.footer}   ·   Page ${i + 1} of ${n}`)}) Tj ET`;
      const stream = [...content, footer].join('\n');
      const cId = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
      const pId = add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${PAGE_W} ${PAGE_H}] /Contents ${cId} 0 R /Resources << /Font << /F1 ${fontN} 0 R /F2 ${fontB} 0 R >> >> >>`);
      pageIds.push(pId);
    });
    const realPagesId = add(`<< /Type /Pages /Kids [${pageIds.map((p) => `${p} 0 R`).join(' ')}] /Count ${n} >>`);
    if (realPagesId !== pagesId) throw new Error('pdf object numbering');
    const catalog = add(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
    const info = add(`<< /Title (${enc(this.meta.title)}) /Producer (ECC prototype) >>`);
    let out = '%PDF-1.4\n%\xe2\xe3\xcf\xd3\n';
    const offsets: number[] = [];
    objs.forEach((o, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
    const xref = out.length;
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n`;
    for (const off of offsets) out += `${String(off).padStart(10, '0')} 00000 n \n`;
    out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R /Info ${info} 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
    const bytes = new Uint8Array(out.length);
    for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 0xff;
    return new Blob([bytes], { type: 'application/pdf' });
  }
}

export function download(blob: Blob, filename: string) {
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = filename; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
}
