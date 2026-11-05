// Single scenario store. Every view reads this state, so a change appears everywhere at once.
import { createContext, useContext, useEffect, useReducer, type Dispatch, type ReactNode } from 'react';
import { answerQuestion, composeSitrep, recordLabel, resolveRecord } from './content';
import { INCIDENT } from './scenario';
import { addChange, addFeed, addLog, advanceMonitors, exec, fmt, initialState, publishRevision, PERSONNEL_REC, PEOPLE, RECORDERS, SCRIPT, syncPersonnel, syncResponse } from './scenario';
import { OUTCOME_LABEL } from './types';
import type { ActionStatus, DecisionOutcome, DraftSection, EccState, KDocType, PlatformRole, ViewId } from './types';

export type Action =
  | { type: 'SIM_TICK' } // the running simulation reached its next event
  | { type: 'SIM_STEP' } // facilitator stepped to the next event
  | { type: 'SIM_SKIP_PREP' } // facilitator skipped to the end of brief preparation
  | { type: 'SIM_SET_RUNNING'; running: boolean }
  | { type: 'RESET' }
  | { type: 'NAVIGATE'; view: ViewId }
  | { type: 'OPEN_RECORD'; id: string } // pushes onto the Details rail, keeps the current view
  | { type: 'RAIL_BACK' }
  | { type: 'RAIL_CLOSE' }
  | { type: 'RAIL_TAB'; tab: 'details' | 'assistant' }
  | { type: 'RECORD_DECISION'; recommendationId: string; outcome: DecisionOutcome; recordedById: string; rationale: string }
  | { type: 'RECORD_FIELD_UPDATE'; actionId?: string; reportedBy: string; status?: ActionStatus; text: string; observedAt?: number; enteredById: string }
  | { type: 'VERIFY_ACTION'; actionId: string; byId: string; basis: string }
  | { type: 'RETRY_RETRIEVAL'; docId: string }
  | { type: 'MARK_REVIEW_POINT' } // "Since you last reviewed" restarts here. Acknowledges no decision.
  | { type: 'SET_PROTOTYPE_ROLE'; role: PlatformRole }
  | { type: 'ADMIN_ACTIVATE_CONFIG'; version: string }
  | { type: 'ADMIN_SET_USER_ROLE'; id: string; role: PlatformRole }
  | { type: 'ADMIN_TEST_SOURCE'; id: string }
  | { type: 'KNOWLEDGE_UPLOAD'; title: string; docType: KDocType }
  | { type: 'KNOWLEDGE_UPLOAD_TICK'; id: string }
  | { type: 'KNOWLEDGE_PUBLISH'; id: string; rev: string }
  | { type: 'SHOW_NEW_FEED' }
  | { type: 'GENERATE_DRAFT' }
  | { type: 'REFRESH_DRAFT' }
  | { type: 'EDIT_SECTION'; id: string; text: string }
  | { type: 'RESOLVE_SECTION'; id: string; choice: 'keep-mine' | 'use-new' }
  | { type: 'MARK_DRAFT_REVIEWED'; byId: string }
  | { type: 'ASK'; question: string; focus?: string } // focus: the item selected in the current view
  | { type: 'DISMISS_TOAST' };

function person(id: string) {
  return RECORDERS.find((p) => p.id === id) ?? PEOPLE.sm;
}

function toast(s: EccState, message: string, ref?: string) {
  s.counters.toast += 1;
  s.toast = { id: s.counters.toast, message, ref };
}

/** Recording something takes a moment on the scenario clock, but never passes the next scripted event. */
function tick(s: EccState) {
  const next = SCRIPT[s.scriptIndex];
  s.now = next ? Math.min(s.now + 1, Math.max(s.now, next.at - 1)) : s.now + 1;
}

function applyNext(s: EccState) {
  const ev = SCRIPT[s.scriptIndex];
  if (!ev) return;
  s.now = Math.max(s.now, ev.at);
  ev.apply(s);
  advanceMonitors(s);
  s.scriptIndex += 1;
  // A user-recorded decision or update must survive any later scripted revision.
  if (!ev.isPrep) syncAfterScript(s);
}

function syncAfterScript(s: EccState) {
  syncPersonnel(s);
  if (s.actions.some((a) => a.id !== 'ACT-01' && a.id !== 'ACT-02')) syncResponse(s);
}

export function reducer(prev: EccState, a: Action): EccState {
  if (a.type === 'RESET') return initialState();
  const s = structuredClone(prev);
  // People see their own entries immediately; only incoming events wait behind "new updates".
  const feedCaughtUp = s.feedShownSeq === s.seq;
  switch (a.type) {
    case 'SIM_TICK':
      applyNext(s);
      if (!SCRIPT[s.scriptIndex]) s.sim.running = false;
      break;
    case 'SIM_STEP':
      if (SCRIPT[s.scriptIndex]) {
        const label = SCRIPT[s.scriptIndex].label;
        applyNext(s);
        s.trainingLog.push({ at: s.now, text: `Stepped to: ${label}` });
        if (!SCRIPT[s.scriptIndex]) s.sim.running = false;
      }
      break;
    case 'SIM_SKIP_PREP':
      while (s.preparing) applyNext(s);
      s.trainingLog.push({ at: s.now, text: 'Skipped to the end of brief preparation' });
      break;
    case 'SIM_SET_RUNNING':
      s.sim.running = a.running && !!SCRIPT[s.scriptIndex];
      s.trainingLog.push({ at: s.now, text: a.running ? 'Simulation resumed' : 'Simulation paused' });
      break;
    case 'NAVIGATE':
      s.view = a.view;
      break;
    case 'OPEN_RECORD':
      if (s.rail.stack[s.rail.stack.length - 1] !== a.id) s.rail.stack.push(a.id);
      s.rail.open = true;
      s.rail.tab = 'details';
      break;
    case 'RAIL_BACK':
      s.rail.stack.pop();
      if (s.rail.stack.length === 0 && s.rail.tab === 'details') s.rail.open = false;
      break;
    case 'RAIL_CLOSE':
      s.rail.open = false;
      s.rail.stack = [];
      break;
    case 'RAIL_TAB':
      s.rail.tab = a.tab;
      s.rail.open = true;
      break;
    case 'RECORD_DECISION': {
      const rec = s.recommendations.find((r) => r.id === a.recommendationId);
      if (!rec || rec.status === 'decided') break;
      tick(s);
      const who = person(a.recordedById);
      s.counters.decision += 1;
      const id = `DEC-${String(s.counters.decision).padStart(2, '0')}`;
      const proceeds = a.outcome === 'proceed' || a.outcome === 'proceed-with-changes';
      let actionId: string | undefined;
      if (proceeds) {
        s.counters.action += 1;
        actionId = `ACT-${String(s.counters.action).padStart(2, '0')}`;
        s.actions.push({ id: actionId, kind: 'action', title: rec.responseTitle, decisionId: id, status: 'no-report', updates: [] });
      }
      s.decisions.push({
        id,
        kind: 'decision',
        recommendationId: rec.id,
        outcome: a.outcome,
        recordedBy: who.name,
        recordedByRole: who.role,
        at: s.now,
        rationale: a.rationale.trim(),
        basis: {
          asOf: s.now,
          lines: s.rows.filter((r) => ['ROW-personnel', 'ROW-release'].includes(r.id)).map((r) => ({ label: r.label, statement: r.statement, trust: r.trust })),
        },
        actionId,
      });
      // A deferral stays on the review list; anything else closes the review.
      rec.status = a.outcome === 'defer' ? 'deferred' : 'decided';
      rec.decisionId = id;
      addLog(s, { at: s.now, kind: 'decision', title: `${who.role} recorded ${id}: ${a.outcome.replace(/-/g, ' ')} on ${rec.id}`, ref: id });
      if (rec.id === PERSONNEL_REC) syncPersonnel(s);
      syncResponse(s);
      const rx = exec(s, 'output-recorded', `Recorded decision on ${rec.shortTitle.toLowerCase()}`, { ms: 20 });
      addFeed(s, {
        feedKind: 'decision',
        supersedes: a.outcome === 'defer' ? undefined : rec.id === PERSONNEL_REC ? 'rec-people' : undefined,
        title: `Decision recorded: ${OUTCOME_LABEL[a.outcome].toLowerCase()}`,
        body: `${who.role} recorded "${OUTCOME_LABEL[a.outcome]}" on ${rec.shortTitle.toLowerCase()}.${proceeds ? ' No progress reported yet.' : ''}`,
        attribution: who.name,
        citations: [id, rec.id],
        action: { label: 'Open decision', ref: id },
        activity: [rx],
      });
      toast(s, proceeds ? `Decision recorded at ${fmt(s.now)}. Nothing has been sent to the field or to equipment.` : `Decision recorded at ${fmt(s.now)}.`, id);
      break;
    }
    case 'RECORD_FIELD_UPDATE': {
      tick(s);
      s.counters.report += 1;
      const id = `RPT-${String(s.counters.report).padStart(3, '0')}`;
      const by = person(a.enteredById);
      s.reports.push({
        id,
        kind: 'report',
        channel: 'user-entry',
        sourceName: a.reportedBy.trim() || 'Not stated',
        sourceRole: 'Field update',
        observation: 'direct',
        observedAt: a.observedAt ?? null,
        receivedAt: s.now,
        text: a.text.trim(),
        trust: 'reported',
        assetIds: [],
        enteredBy: by.name,
        actionId: a.actionId,
      });
      addLog(s, { at: s.now, eventAt: a.observedAt, kind: 'report', title: `Field update: ${a.text.trim().slice(0, 80)}`, ref: id });
      const act = a.actionId ? s.actions.find((x) => x.id === a.actionId) : undefined;
      if (act) {
        const status = a.status ?? act.status;
        act.status = status;
        act.updates.push({ at: s.now, reportedBy: a.reportedBy.trim() || 'Not stated', status, text: a.text.trim(), reportId: id });
        addLog(s, { at: s.now, kind: 'response', title: `${act.title}: reported by ${a.reportedBy.trim() || 'not stated'}`, ref: act.id });
        const dec = s.decisions.find((d) => d.id === act.decisionId);
        if (dec?.recommendationId === PERSONNEL_REC) syncPersonnel(s);
        syncResponse(s);
        toast(s, 'Field update added as reported, not verified.', id);
      } else {
        toast(s, 'Field update added as reported. The assessment has not changed from it.', id);
      }
      addChange(s, { at: s.now, title: 'Field update recorded', after: a.text.trim(), refs: [id] });
      const fx = exec(s, 'output-recorded', 'Recorded field update', { ms: 20 });
      addFeed(s, {
        feedKind: 'response',
        title: act ? `Field update: ${act.title}` : 'Field update recorded',
        body: a.text.trim(),
        uncertainty: act?.status === 'completion-reported' ? 'Completion reported, not verified.' : 'Reported, not verified.',
        trust: 'reported',
        attribution: a.reportedBy.trim() || 'Not stated',
        observedAt: a.observedAt,
        receivedAt: s.now,
        citations: [id],
        action: act ? { label: 'Open response', ref: act.id } : { label: 'Open field update', ref: id },
        activity: [fx],
      });
      break;
    }
    case 'VERIFY_ACTION': {
      const act = s.actions.find((x) => x.id === a.actionId);
      if (!act) break;
      tick(s);
      const who = person(a.byId);
      act.status = 'completion-verified';
      act.verification = { by: who.name, at: s.now, basis: a.basis.trim() };
      addLog(s, { at: s.now, kind: 'response', title: `${who.role} recorded verification of ${act.id}`, ref: act.id });
      const dec = s.decisions.find((d) => d.id === act.decisionId);
      if (dec?.recommendationId === PERSONNEL_REC) syncPersonnel(s);
      syncResponse(s);
      addFeed(s, {
        feedKind: 'response',
        title: `Verification recorded: ${act.title}`,
        body: `${who.name} recorded verification. Basis: ${a.basis.trim()}`,
        attribution: who.name,
        citations: [act.id],
        action: { label: 'Open response', ref: act.id },
      });
      toast(s, `Verification recorded at ${fmt(s.now)}.`, act.id);
      break;
    }
    case 'RETRY_RETRIEVAL': {
      const doc = s.docs.find((d) => d.id === a.docId);
      if (!doc) break;
      tick(s);
      doc.attempts = (doc.attempts ?? 1) + 1;
      doc.retrievedAt = s.now;
      addLog(s, { at: s.now, kind: 'agent', title: `Retry failed: ${doc.title}`, ref: doc.id, material: false });
      // A repeat updates the existing feed entry rather than adding another.
      const repeated = s.feed.find((f) => f.key === 'source-maint');
      if (repeated) {
        repeated.repeatCount = doc.attempts;
        repeated.lastRepeatAt = s.now;
        repeated.body = `The maintenance system did not respond to ${doc.attempts} attempts.`;
        repeated.activity.push(exec(s, 'retry', `Retried maintenance system for P-3104B`, { source: 'Maintenance system', status: 'failed', ms: 5000, attempt: doc.attempts }));
      }
      toast(s, `Retry at ${fmt(s.now)} failed. ${doc.title} is still unavailable.`);
      break;
    }
    case 'MARK_REVIEW_POINT':
      s.changesSeenSeq = s.seq;
      s.reviewedAt = s.now;
      break;
    case 'SET_PROTOTYPE_ROLE':
      s.prototypeRole = a.role;
      break;
    case 'ADMIN_ACTIVATE_CONFIG': {
      s.configs.forEach((c) => {
        if (c.status === 'active') c.status = 'retired';
      });
      const c = s.configs.find((x) => x.version === a.version);
      if (c) {
        c.status = 'active';
        c.activatedAt = `Today, ${fmt(s.now)}`;
        s.audit.push({ at: s.now, actor: 'Prototype administrator', action: 'Activated agent configuration', target: c.version });
        toast(s, `${c.version} active from ${fmt(s.now)}. Recorded assessments keep the configuration they used.`);
      }
      break;
    }
    case 'ADMIN_SET_USER_ROLE': {
      const u = s.users.find((x) => x.id === a.id);
      if (u) {
        s.audit.push({ at: s.now, actor: 'Prototype administrator', action: `Changed platform role to ${a.role}`, target: u.name });
        u.platformRole = a.role;
      }
      break;
    }
    case 'ADMIN_TEST_SOURCE': {
      const src = s.sources.find((x) => x.id === a.id);
      if (src) {
        s.audit.push({ at: s.now, actor: 'Prototype administrator', action: 'Tested source connection (simulated)', target: src.name });
        toast(s, src.state === 'connected' ? `Simulated test passed: ${src.name}. This says nothing about the equipment.` : `Simulated test failed: ${src.name} is ${src.state}.`);
      }
      break;
    }
    case 'KNOWLEDGE_UPLOAD': {
      s.counters.upload += 1;
      const isDrawing = a.docType === 'P&ID' || a.docType === 'Area layout';
      const id = `KD-UP${s.counters.upload}`;
      s.knowledge.unshift({
        id,
        kind: 'kdoc',
        title: a.title.trim() || 'Untitled document',
        docNumber: `UP-${s.counters.upload}`,
        docType: a.docType,
        facility: INCIDENT.facility,
        area: 'Not yet assigned',
        equipment: [],
        accessScope: 'Knowledge stewards until published',
        revisions: [{ rev: 'Rev A', approval: 'draft', uploadedAt: `Today, ${fmt(s.now)}`, processing: 'uploaded', processingNote: isDrawing ? 'Simulated upload. A processed drawing has not necessarily been understood correctly.' : 'Simulated upload.', sections: [] }],
      });
      s.audit.push({ at: s.now, actor: 'Prototype user', action: 'Uploaded document (simulated)', target: a.title.trim() || id });
      toast(s, 'Upload simulated. Not approved, and not used by the agent.');
      break;
    }
    case 'KNOWLEDGE_UPLOAD_TICK': {
      const rev = s.knowledge.find((d) => d.id === a.id)?.revisions[0];
      if (!rev) break;
      if (rev.processing === 'uploaded') rev.processing = 'processing';
      else if (rev.processing === 'processing') {
        const drawing = rev.processingNote?.includes('drawing');
        rev.processing = drawing ? 'partial' : 'searchable';
        rev.processingNote = drawing ? 'Simulated: tags recognised, connections unchecked. Needs review before use.' : 'Simulated: text extracted and searchable. Still needs approval.';
        rev.sections = [{ id: 's1', page: 1, title: 'Extracted content', text: 'Simulated extraction for this prototype.' }];
      }
      break;
    }
    case 'KNOWLEDGE_PUBLISH': {
      const doc = s.knowledge.find((d) => d.id === a.id);
      const rev = doc?.revisions.find((r) => r.rev === a.rev);
      if (doc && rev && rev.processing !== 'failed') {
        publishRevision(s, a.id, { ...rev, approval: 'effective', effectiveFrom: `Today, ${fmt(s.now)}` }, 'Prototype steward');
        toast(s, `${doc.docNumber} ${rev.rev} published (simulated). Past findings keep the revision they cited.`);
      }
      break;
    }
    case 'SHOW_NEW_FEED':
      s.feedShownSeq = s.seq;
      break;
    case 'GENERATE_DRAFT': {
      const sections: DraftSection[] = composeSitrep(s).map((c) => ({ ...c, baseText: c.text }));
      s.draft = { version: 1, asOf: s.now, basedOnSeq: s.seq, sections, history: [] };
      toast(s, `SITREP draft generated with information as of ${fmt(s.now)}.`);
      break;
    }
    case 'REFRESH_DRAFT': {
      if (!s.draft) break;
      const next = composeSitrep(s);
      s.draft.history.push({
        version: s.draft.version,
        asOf: s.draft.asOf,
        reviewed: s.draft.reviewed,
        sections: s.draft.sections.map(({ id, title, text }) => ({ id, title, text })),
      });
      let held = 0;
      s.draft.sections = next.map((c) => {
        const cur = s.draft!.sections.find((x) => x.id === c.id);
        if (!cur) return { ...c, baseText: c.text };
        const edited = cur.text !== cur.baseText;
        const agentChanged = c.text !== cur.baseText;
        if (edited && agentChanged) {
          held += 1;
          return { ...cur, incomingText: c.text, changedInLastRefresh: false };
        }
        if (edited) return { ...cur, incomingText: undefined, changedInLastRefresh: false };
        return { ...cur, text: c.text, baseText: c.text, incomingText: undefined, changedInLastRefresh: agentChanged };
      });
      s.draft.version += 1;
      s.draft.asOf = s.now;
      s.draft.basedOnSeq = s.seq;
      delete s.draft.reviewed;
      toast(s, held ? `Draft refreshed to ${fmt(s.now)}. Your edits were kept; ${held} ${held === 1 ? 'section has' : 'sections have'} new text to review.` : `Draft refreshed to ${fmt(s.now)}.`);
      break;
    }
    case 'EDIT_SECTION': {
      const sec = s.draft?.sections.find((x) => x.id === a.id);
      if (!sec || !s.draft) break;
      sec.text = a.text;
      delete s.draft.reviewed;
      break;
    }
    case 'RESOLVE_SECTION': {
      const sec = s.draft?.sections.find((x) => x.id === a.id);
      if (!sec?.incomingText) break;
      if (a.choice === 'use-new') sec.text = sec.incomingText;
      sec.baseText = sec.incomingText; // either way, this agent text has now been considered
      delete sec.incomingText;
      break;
    }
    case 'MARK_DRAFT_REVIEWED': {
      if (!s.draft) break;
      tick(s);
      s.draft.reviewed = { by: person(a.byId).name, at: s.now };
      toast(s, `Draft ${s.draft.version} marked reviewed at ${fmt(s.now)}. It has not been sent anywhere.`);
      break;
    }
    case 'ASK': {
      const q = a.question.trim();
      if (!q) break;
      const focus = a.focus ?? s.rail.stack[s.rail.stack.length - 1];
      const focused = focus ? resolveRecord(s, focus) : undefined;
      s.counters.msg += 2;
      s.chat.push({ id: s.counters.msg - 1, role: 'user', at: s.now, text: q, contextLabel: focused ? recordLabel(s, focus) : undefined });
      s.chat.push({ id: s.counters.msg, role: 'assistant', at: s.now, parts: answerQuestion(s, q, focus) });
      break;
    }
    case 'DISMISS_TOAST':
      s.toast = null;
      break;
  }
  const userRecorded = ['RECORD_DECISION', 'RECORD_FIELD_UPDATE', 'VERIFY_ACTION', 'RETRY_RETRIEVAL'].includes(a.type);
  if (userRecorded && feedCaughtUp) s.feedShownSeq = s.seq;
  return s;
}

const Ctx = createContext<{ state: EccState; dispatch: Dispatch<Action> } | null>(null);

export function EccProvider({ children }: { children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, undefined, initialState);
  useEffect(() => {
    const next = SCRIPT[state.scriptIndex];
    if (!state.sim.running || !next) return;
    const t = setTimeout(() => dispatch({ type: 'SIM_TICK' }), next.delayMs);
    return () => clearTimeout(t);
  }, [state.sim.running, state.scriptIndex]);
  // Simulated processing of an uploaded document.
  const uploading = state.knowledge.find((d) => d.revisions[0]?.processing === 'uploaded' || d.revisions[0]?.processing === 'processing');
  const uploadStatus = uploading?.revisions[0]?.processing;
  useEffect(() => {
    if (!uploading) return;
    const t = setTimeout(() => dispatch({ type: 'KNOWLEDGE_UPLOAD_TICK', id: uploading.id }), 1800);
    return () => clearTimeout(t);
  }, [uploading?.id, uploadStatus]);
  return <Ctx.Provider value={{ state, dispatch }}>{children}</Ctx.Provider>;
}

export function useEcc() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useEcc must be used inside EccProvider');
  return c;
}
