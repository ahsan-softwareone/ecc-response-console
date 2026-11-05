import { EMERGENCY_META, USER } from '../data/scenario';
import { useDerived } from '../lib/derive';
import { elapsedParts, pad2, useNow } from '../lib/time';
import { useStore, type Nav } from '../store';
import { IconButton } from '../ui/ui';

const NAV: { id: Nav; label: string }[] = [
  { id: 'situation', label: 'Situation' },
  { id: 'activity', label: 'Agent Activity' },
  { id: 'knowledge', label: 'Knowledge' },
  { id: 'sitrep', label: 'SITREP' },
  { id: 'records', label: 'Records' },
];

export function TopBar() {
  const nav = useStore((s) => s.nav);
  const setNav = useStore((s) => s.setNav);
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const d = useDerived();
  const unread = useStore((s) => d.alerts.filter((a) => !s.alertUser[a.id]?.readAt).length);

  return (
    <header className="topbar">
      <div className="brand">
        <div className="mark"><svg width="16" height="16" viewBox="0 0 16 16" fill="none" stroke="var(--accent)" strokeWidth="2.6"><circle cx="8" cy="8" r="5" /></svg></div>
        <div className="wordmark">ECC</div>
        <div className="emergency">
          <span className="t">{EMERGENCY_META.facility} · {EMERGENCY_META.title}</span>
          <span className="s"><span>{d.phase}</span><span className="dot" /><span data-testid="mode-marker">Training scenario · illustrative data</span></span>
        </div>
      </div>
      <nav className="nav" aria-label="Primary">
        {NAV.map((n) => (
          <button key={n.id} onClick={() => setNav(n.id)} aria-current={nav === n.id ? 'page' : undefined}>
            {n.label}
            {n.id === 'situation' && unread > 0 && <span className="badge frame" title={`${unread} unread alerts`}>{unread}</span>}
          </button>
        ))}
      </nav>
      <div className="topright">
        <Timer />
        <div className="user">
          <div className="av" aria-hidden="true">NA</div>
          <div>
            <div className="n">{USER.name}</div>
            <div className="r" title={USER.note}>{USER.role} · ECC</div>
          </div>
        </div>
        <IconButton className="frame" name={theme === 'light' ? 'moon' : 'sun'} title={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'} onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} />
      </div>
    </header>
  );
}

function Timer() {
  const startedAt = useStore((s) => s.startedAt);
  const now = useNow(1000);
  const { h, m } = elapsedParts(now - startedAt);
  return (
    <div className="timer" data-testid="timer" aria-live="off">
      <div className="v num"><span data-testid="timer-h">{pad2(h)}</span><small>h</small><span data-testid="timer-m">{pad2(m)}</span><small>m</small></div>
      <div className="l">Since emergency started</div>
    </div>
  );
}

