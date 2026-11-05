// Retrieval provider interface and the local, in-browser implementation.
//
// What is implemented: keyword retrieval (BM25-style ranking over tokens) across
// passages extracted by pdf.js page by page, plus incident-record events. There is
// no semantic or vector search and no language model. A production backend can be
// connected by implementing RetrievalProvider.

export type ContentType = 'procedure' | 'drawing' | 'manual' | 'policy' | 'limits' | 'incident';
export type Approval = 'approved' | 'not-established' | 'declared' | 'superseded' | 'draft';

export interface Passage {
  id: string;
  score: number;
  text: string;                 // the passage (page text excerpt)
  snippet: string;              // short excerpt around the best match
  source: {
    kind: 'document' | 'incident';
    id: string;                 // docId or incident id
    title: string;
    site: string;
    contentType: ContentType;
    revision?: string;
    page?: number;              // page / sheet
    approval: Approval;
    incidentMode?: 'real' | 'training';
    incidentStatus?: string;
    eventId?: string;           // for incident passages
    eventTitle?: string;        // the entry itself (incident passages)
    category?: string;          // entry category (incident passages)
    t?: number;                 // event time (incident passages)
    incidentStartedAt?: number; // for T+ display
    locate: 'exact' | 'page-only';
    quote?: string;             // text to highlight in the viewer when exact
  };
}

export interface RetrievalScope {
  sites?: string[];             // empty / undefined = all
  contentTypes?: ContentType[]; // empty / undefined = all
  /** Only incident events at or before this time are eligible (current-incident gating). */
  incidentTimeCutoff?: { incidentId: string; t: number };
  limit?: number;
}

export type RetrievalResult = { ok: true; passages: Passage[]; indexedPassages: number } | { ok: false; error: string };

export interface RetrievalProvider {
  readonly name: string;
  readonly description: string;
  search(query: string, scope: RetrievalScope): Promise<RetrievalResult>;
}

/** One indexable unit: a document page or an incident event. */
export interface IndexUnit {
  id: string;
  text: string;
  source: Passage['source'];
}

const STOP = new Set('the a an and or of to in on for with at by is are be was were it this that as from into not no yes if then than when where which who whom will may can shall should must do does did has have had its their there here these those such per via'.split(' '));
export function tokenize(s: string): string[] {
  return s.toLowerCase().replace(/[’']/g, '').split(/[^a-z0-9\-°³]+/).filter((t) => t.length > 1 && !STOP.has(t));
}

export class LocalRetrievalProvider implements RetrievalProvider {
  readonly name = 'Local keyword retrieval';
  readonly description = 'BM25-style keyword ranking over text extracted by pdf.js page by page, plus incident-record events. No semantic or vector search; no language model.';
  private units: IndexUnit[] = [];
  private df = new Map<string, number>();
  private avgLen = 1;
  private tokens = new Map<string, string[]>();
  public simulateFailure = false;

  setUnits(units: IndexUnit[]) {
    this.units = units;
    this.df.clear(); this.tokens.clear();
    let total = 0;
    for (const u of units) {
      const toks = tokenize(u.text);
      this.tokens.set(u.id, toks);
      total += toks.length;
      for (const t of new Set(toks)) this.df.set(t, (this.df.get(t) ?? 0) + 1);
    }
    this.avgLen = units.length ? total / units.length : 1;
  }
  get size() { return this.units.length; }

  async search(query: string, scope: RetrievalScope): Promise<RetrievalResult> {
    if (this.simulateFailure) return { ok: false, error: 'Retrieval backend unreachable (simulated failure)' };
    const q = tokenize(query);
    if (q.length === 0) return { ok: true, passages: [], indexedPassages: this.units.length };
    const N = this.units.length || 1;
    const k1 = 1.4, b = 0.75;
    const out: Passage[] = [];
    for (const u of this.units) {
      const s = u.source;
      if (scope.sites?.length && !scope.sites.includes(s.site)) continue;
      if (scope.contentTypes?.length && !scope.contentTypes.includes(s.contentType)) continue;
      if (s.kind === 'incident' && scope.incidentTimeCutoff && s.id === scope.incidentTimeCutoff.incidentId && (s.t ?? 0) > scope.incidentTimeCutoff.t) continue;
      const toks = this.tokens.get(u.id) ?? [];
      if (!toks.length) continue;
      const tf = new Map<string, number>();
      for (const t of toks) tf.set(t, (tf.get(t) ?? 0) + 1);
      let score = 0, matched = 0;
      for (const term of q) {
        const f = tf.get(term) ?? 0;
        if (!f) continue;
        matched++;
        const df = this.df.get(term) ?? 1;
        const idf = Math.log(1 + (N - df + 0.5) / (df + 0.5));
        score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * toks.length) / this.avgLen)));
      }
      if (score <= 0) continue;
      score *= 1 + 0.5 * (matched / q.length);
      out.push({ id: u.id, score, text: u.text, snippet: snippetFor(u.text, q), source: { ...s, quote: s.locate === 'exact' ? bestSentence(u.text, q) : undefined } });
    }
    out.sort((a, b2) => b2.score - a.score);
    return { ok: true, passages: out.slice(0, scope.limit ?? 12), indexedPassages: this.units.length };
  }
}

function sentences(text: string): string[] {
  return text.replace(/\s+/g, ' ').split(/(?<=[.!?])\s+(?=[A-Z0-9])/).map((s) => s.trim()).filter((s) => s.length > 20);
}
/** The sentence with the most query terms; used as the exact highlight target. */
export function bestSentence(text: string, q: string[]): string | undefined {
  let best: string | undefined, bestN = 0;
  for (const s of sentences(text)) {
    const toks = new Set(tokenize(s));
    const n = q.filter((t) => toks.has(t)).length;
    if (n > bestN) { bestN = n; best = s; }
  }
  return best && best.length <= 220 ? best : best?.slice(0, 200);
}
/** 2–3 lines around the best sentence: the sentence plus its neighbour, trimmed. */
function snippetFor(text: string, q: string[]): string {
  const ss = sentences(text);
  const best = bestSentence(text, q);
  const i = best ? ss.findIndex((s) => s.startsWith(best.slice(0, 40))) : -1;
  const parts = i >= 0 ? [ss[i], ss[i + 1] ?? ''].filter(Boolean) : [text.slice(0, 220)];
  const s = parts.join(' ');
  return s.length > 300 ? `${s.slice(0, 297)}…` : s;
}

/** Split text into [plain, match, plain, …] segments for query-term emphasis. */
export function emphasize(text: string, terms: string[]): { text: string; hit: boolean }[] {
  const ts = terms.filter((t) => t.length > 2);
  if (!ts.length) return [{ text, hit: false }];
  const re = new RegExp(`(${ts.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})`, 'gi');
  return text.split(re).filter((x) => x.length).map((x) => ({ text: x, hit: re.test(x) && (re.lastIndex = 0) === 0 }));
}

export const retrieval = new LocalRetrievalProvider();
