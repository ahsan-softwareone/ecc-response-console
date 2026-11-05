// Panels available on each tab. Situation windows use their window id; the other tabs
// use a SplitPane id with pane a/b. Hidden panels stay mounted, so nothing inside is lost.
import { useStore, type State, type Nav } from '../store';

export interface PanelDef { key: string; label: string; split?: string; pane?: 'a' | 'b'; window?: string }
const SPLIT = (split: string, a: string, b: string): PanelDef[] => [{ key: `${split}.a`, label: a, split, pane: 'a' }, { key: `${split}.b`, label: b, split, pane: 'b' }];
export function panelsFor(nav: Nav, knowledgeView: State['knowledgeView'], hasDocument: boolean): PanelDef[] {
  if (nav === 'situation') return [
    { key: 'situation.equipment', label: 'Equipment', window: 'equipment' }, { key: 'situation.log', label: 'Alert log', window: 'log' }, { key: 'situation.response', label: 'Investigation', window: 'response' },
    ...(hasDocument ? [{ key: 'situation.document', label: 'Document', window: 'document' }] : []),
  ];
  if (nav === 'sitrep') return SPLIT('sitrep', 'Incident timeline', 'Reports and status');
  if (nav === 'agentlog') return SPLIT('agentlog', 'Agent tasks', 'Task detail');
  if (knowledgeView === 'documents') return SPLIT('knowledge-documents', 'Documents', 'Original document');
  if (knowledgeView === 'incidents') return SPLIT('knowledge-incidents', 'Incidents', 'Incident record');
  return [];
}
export function usePanels() {
  const nav = useStore((s) => s.nav);
  const kv = useStore((s) => s.knowledgeView);
  const hasDoc = useStore((s) => !!s.viewer && s.viewer.dock !== false);
  return panelsFor(nav, kv, hasDoc);
}
export function resetCurrentTab() {
  const s = useStore.getState();
  // Reset covers every panel on the tab, including one that is not currently listed (a closed document).
  const panels = panelsFor(s.nav, s.knowledgeView, true);
  s.resetPanels(panels.map((p) => p.key), [...new Set(panels.flatMap((p) => (p.split ? [p.split] : [])))], s.nav === 'situation');
}
/** Bring a panel forward: restore from hidden or from another panel's maximize, then draw the eye to it. */
export function focusPanel(p: PanelDef) {
  const s = useStore.getState();
  if (s.hiddenPanels[p.key]) s.showPanel(p.key);
  if (p.split && s.maximizedPanes[p.split] && s.maximizedPanes[p.split] !== p.pane) s.setMaximizedPane(p.split, null);
  if (p.window && s.layout.maximized && s.layout.maximized !== p.window) s.maximize(null);
  window.setTimeout(() => {
    const el = document.querySelector<HTMLElement>(`[data-panel="${p.key}"]`);
    if (!el) return;
    el.scrollIntoView({ block: 'nearest' });
    el.classList.remove('panel-flash'); void el.offsetWidth; el.classList.add('panel-flash');
    el.setAttribute('tabindex', '-1'); el.focus({ preventScroll: true });
    window.setTimeout(() => el.classList.remove('panel-flash'), 1200);
  }, 30);
}
