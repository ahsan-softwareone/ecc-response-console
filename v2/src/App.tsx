import { useEffect } from 'react';
import { useStore } from './store';
import { TopBar } from './shell/TopBar';
import { Facilitator } from './shell/Facilitator';
import { Situation } from './situation/Situation';
import { Activity } from './pages/Activity';
import { Knowledge } from './pages/Knowledge';
import { Sitrep } from './pages/Sitrep';
import { Records } from './pages/Records';
import { ViewerOverlay } from './viewer/DocViewer';

export function App() {
  const nav = useStore((s) => s.nav);
  const theme = useStore((s) => s.theme);
  useEffect(() => { document.documentElement.dataset.theme = theme; }, [theme]);

  return (
    <div className="app" data-nav={nav}>
      <TopBar />
      <div className="main">
        {nav === 'situation' && <Situation />}
        {nav === 'activity' && <Activity />}
        {nav === 'knowledge' && <Knowledge />}
        {nav === 'sitrep' && <Sitrep />}
        {nav === 'records' && <Records />}
      </div>
      <Facilitator />
      <ViewerOverlay />
    </div>
  );
}
