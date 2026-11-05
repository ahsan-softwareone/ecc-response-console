import { USER } from '../data/scenario';
import { useDerived } from '../lib/derive';
import { clock, elapsedParts, pad2, useNow } from '../lib/time';
import { useStore, type Nav } from '../store';
import { IconButton, Popover } from '../ui/ui';

const NAV: { id: Nav; label: string }[] = [
  { id: 'situation', label: 'Situation' },
  { id: 'sitrep', label: 'Sit. Rep' },
  { id: 'agentlog', label: 'Agent Log' },
  { id: 'knowledge', label: 'Knowledge' },
];

/** Header lockup from the supplied branding: vector symbol derived from the PNG plus crisp text. */
function Brand() {
  return (
    <a className="brand-lockup" href="#" onClick={(e) => e.preventDefault()} aria-label="Upstream ECC AI Agent" data-testid="brand">
      <img className="brand-symbol" src="/brand/ecc-symbol.svg" alt="" width={34} height={26} data-testid="brand-symbol" />
      <span className="brand-text">
        <span className="brand-upstream">Upstream</span>
        <span className="brand-ecc">ECC</span>
        <span className="brand-agent">AI Agent</span>
      </span>
    </a>
  );
}

/** Conversation mark echoing the dotted-arc motif: a speech bubble whose top edge is an arc of dots. */
function AssistantIcon({ open }: { open: boolean }) {
  const dots = [-5, -3, -1, 1, 3, 5].map((x) => ({ x: 10 + x * 1.3, y: 6.2 - Math.cos((x / 6) * 1.2) * 1.2 }));
  return (
    <svg className="assist-icon" width="18" height="18" viewBox="0 0 20 20" fill="none" aria-hidden="true">
      <path d="M3.5 9.5c0-3.3 2.9-5.5 6.5-5.5s6.5 2.2 6.5 5.5-2.9 5.5-6.5 5.5c-.8 0-1.6-.1-2.3-.3L4.6 16.4l.6-2.9C4.2 12.5 3.5 11.1 3.5 9.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" fill={open ? 'currentColor' : 'none'} fillOpacity={open ? 0.18 : 0} />
      {dots.map((d, i) => <circle key={i} cx={d.x} cy={d.y + 2.2} r="0.9" fill="currentColor" />)}
      <circle cx="7.4" cy="10.6" r="0.95" fill="currentColor" /><circle cx="10" cy="10.6" r="0.95" fill="currentColor" /><circle cx="12.6" cy="10.6" r="0.95" fill="currentColor" />
    </svg>
  );
}

export function TopBar() {
  const nav = useStore((s) => s.nav);
  const setNav = useStore((s) => s.setNav);
  const theme = useStore((s) => s.theme);
  const setTheme = useStore((s) => s.setTheme);
  const role = useStore((s) => s.role);
  const setRole = useStore((s) => s.setRole);
  const assistantOpen = useStore((s) => s.assistantOpen);
  const setAssistantOpen = useStore((s) => s.setAssistantOpen);
  const d = useDerived();
  const unread = useStore((s) => d.alerts.filter((a) => !s.alertUser[a.id]?.readAt).length);

  return (
    <header className="topbar">
      <div className="brand">
        <Brand />
      </div>
      <nav className="nav" aria-label="Primary" data-testid="nav">
        {NAV.map((n) => (
          <button key={n.id} onClick={() => setNav(n.id)} aria-current={nav === n.id ? 'page' : undefined} data-testid={`nav-${n.id}`}>
            {n.label}
            {n.id === 'situation' && unread > 0 && <span className="badge frame" title={`${unread} unread alerts`}>{unread}</span>}
          </button>
        ))}
      </nav>
      <div className="topright" data-testid="topright">
        <Timer />
        <IconButton className="frame" name={theme === 'light' ? 'moon' : 'sun'} title={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'} onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')} testId="theme-toggle" />
        <button className="assist-btn" onClick={() => setAssistantOpen(!assistantOpen)} aria-expanded={assistantOpen} aria-controls="assistant-panel" data-testid="assistant-toggle" data-open={assistantOpen} title={assistantOpen ? 'Close the Assistant panel' : 'Open the Assistant: retrieved evidence from Knowledge'}>
          <AssistantIcon open={assistantOpen} /><span className="assist-label">Assistant</span>
        </button>
        <Popover width={300} trigger={(open, toggle) => (
          <button className="user" onClick={toggle} aria-expanded={open} data-testid="user-menu" title={`${USER.name} · ${role === 'admin' ? 'Admin (prototype role)' : USER.role}`}>
            <div className="av" aria-hidden="true">NA</div>
            <div className="user-text">
              <div className="n">{USER.name}</div>
              <div className="r">{role === 'admin' ? 'Admin (prototype role)' : `${USER.role} · ECC`}</div>
            </div>
          </button>
        )}>
          {() => (
            <>
              <div className="head"><div style={{ fontWeight: 600 }}>{USER.name}</div><div className="sidenote">{role === 'admin' ? 'Admin (prototype role)' : USER.role} · {USER.note}</div></div>
              <div className="sep" />
              <div className="head label">Prototype role switch</div>
              <div style={{ padding: '0 10px 6px' }}><span className="seg"><button aria-pressed={role === 'user'} onClick={() => setRole('user')} data-testid="role-user">User</button><button aria-pressed={role === 'admin'} onClick={() => setRole('admin')} data-testid="role-admin">Admin</button></span></div>
              <div className="sidenote" style={{ padding: '0 10px 8px' }}>Demonstration only: changes what Agent Log shows and who may edit agent defaults. This is not real authorization.</div>
            </>
          )}
        </Popover>
      </div>
    </header>
  );
}

function Timer() {
  const startedAt = useStore((s) => s.startedAt);
  const noIncident = useStore((s) => !s.incidentId);
  const closure = useStore((s) => s.records[s.incidentId]?.closure);
  const now = useNow(1000);
  const end = closure ? closure.t : now;
  const { h, m } = elapsedParts(end - startedAt);
  if (noIncident) return <div className="timer" data-testid="timer" data-frozen="false"><div className="v num"><span data-testid="timer-h">--</span><small>h</small><span data-testid="timer-m">--</span><small>m</small></div><div className="l" data-testid="timer-caption">No active incident</div></div>;
  return (
    <div className="timer" data-testid="timer" aria-live="off" data-frozen={!!closure}>
      <div className="v num"><span data-testid="timer-h">{pad2(h)}</span><small>h</small><span data-testid="timer-m">{pad2(m)}</span><small>m</small></div>
      <div className="l" data-testid="timer-caption">{closure ? `Emergency closed ${clock(closure.t)}` : 'Since emergency started'}</div>
    </div>
  );
}
