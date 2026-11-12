import { useEffect, useState } from 'react';
import { useStore } from './store';
import { TopBar } from './shell/TopBar';
import { Facilitator } from './shell/Facilitator';
import { AgentNotice, NotificationBanner, StatusBar } from './shell/StatusBar';
import { Dialogs } from './shell/Dialogs';
import { Settings } from './shell/Settings';
import { NoIncident } from './shell/NoIncident';
import { Situation } from './situation/Situation';
import { SitRep } from './pages/SitRep';
import { AgentLog } from './pages/AgentLog';
import { Knowledge } from './pages/Knowledge';
import { Assistant } from './assistant/Assistant';
import { ViewerOverlay } from './viewer/DocViewer';
import { TrendOverlay } from './situation/TrendOverlay';
import { setClockSkew } from './lib/time';
import { useRecordSync } from './record/sync';
import { useInvestigationRunner } from './investigate/useRunner';
import { Overview, ReturnToOverview } from './pages/Overview';
import { buildIndex } from './lib/indexer';
import { Toast } from './ui/ui';
import { retrieval } from './lib/retrieval';
(window as unknown as { __ecc: unknown }).__ecc = { retrieval, store: useStore, setClockSkew };


export function App() {
  const nav = useStore((s) => s.nav);
  const theme = useStore((s) => s.theme);
  const assistantOpen = useStore((s) => s.assistantOpen);
  const loadLocalData = useStore((s) => s.loadLocalData);
  const storageReady = useStore((s) => s.storageReady);
  const toast = useStore((s) => s.toast);
  const noIncident = useStore((s) => !s.incidentId);
  const setToast = useStore((s) => s.setToast);
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);
  useEffect(() => { void loadLocalData(); }, [loadLocalData]);
  useRecordSync();
  useInvestigationRunner();
  useIndexBuild(storageReady);
  // Signing in as the Incident Manager lands on the briefing; a reload counts as signing in again.
  useEffect(() => { if (storageReady && useStore.getState().persona === 'incident-manager') useStore.getState().setNav('overview'); }, [storageReady]);
  useEffect(() => { if (!toast) return; const t = window.setTimeout(() => setToast(null), 6000); return () => window.clearTimeout(t); }, [toast, setToast]);

  // On Situation the Assistant overlays when pushing would squeeze the workspace below usable minimums.
  const [vw, setVw] = useState(window.innerWidth);
  useEffect(() => { const on = () => setVw(window.innerWidth); window.addEventListener('resize', on); return () => window.removeEventListener('resize', on); }, []);
  // Push only when the workspace keeps comfortable reading widths; otherwise overlay.
  const assistantWidth = useStore((s) => s.assistantWidth);
  // The Assistant docks beside the workspace on every tab, the way it does on Overview: the page makes room for it.
  // It only floats over the page when the window is too narrow to keep any usable workspace beside it.
  const overlay = vw - assistantWidth < 720;

  return (
    <div className="app" data-nav={nav} data-assistant={assistantOpen ? (overlay ? 'overlay' : 'push') : 'closed'}>
      <TopBar />
      <div className="statusstack"><StatusBar /><NotificationBanner /><AgentNotice /><ReturnToOverview /></div>
      <div className="main-row">
        <div className="main" style={{ marginRight: assistantOpen && !overlay ? assistantWidth : 0 }}>
          {noIncident && nav !== 'knowledge' && <NoIncident overview={nav === 'overview'} />}
          {!noIncident && nav === 'overview' && <Overview />}
          {!noIncident && nav === 'situation' && <Situation />}
          {!noIncident && nav === 'sitrep' && <SitRep />}
          {!noIncident && nav === 'agentlog' && <AgentLog />}
          {nav === 'knowledge' && <Knowledge />}
        </div>
        {assistantOpen && <Assistant overlay={overlay} width={assistantWidth} />}
      </div>
      <Facilitator />
      <ViewerOverlay />
      <TrendOverlay />
      <Dialogs />
      <Settings />
      <Toast text={toast} />
    </div>
  );
}

/** Rebuild the local retrieval index when records or uploads change (debounced). */
function useIndexBuild(ready: boolean) {
  const records = useStore((s) => s.records);
  const uploads = useStore((s) => s.uploads);
  const uploadPages = useStore((s) => s.uploadPages);
  const sig = Object.values(records).map((r) => `${r.id}:${r.events.length}:${r.status}`).join('|') + '#' + uploads.map((u) => u.id).join(',');
  useEffect(() => {
    if (!ready) return;
    const t = window.setTimeout(() => {
      const superseded = new Set(uploads.filter((u) => u.revisionOf).map((u) => `${u.revisionOf}:*`));
      void buildIndex(Object.values(records), uploads, uploadPages, superseded).then(() => useStore.getState().setIndexReady(true));
    }, 1500);
    return () => window.clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ready, sig]);
}
