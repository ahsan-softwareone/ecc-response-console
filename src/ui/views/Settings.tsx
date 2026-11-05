import { useUi } from '../App';
import { resolvedTheme, type Density, type SidebarChoice, type ThemeChoice } from '../settings';

const THEMES: { id: ThemeChoice; label: string; note: string }[] = [
  { id: 'light', label: 'Light', note: 'White and cool-neutral surfaces.' },
  { id: 'dark', label: 'Dark', note: 'Designed dark surfaces, not an inversion.' },
  { id: 'system', label: 'System', note: 'Follows the operating system setting and changes with it.' },
];
const DENSITIES: { id: Density; label: string; note: string }[] = [
  { id: 'comfortable', label: 'Comfortable', note: 'Default spacing.' },
  { id: 'compact', label: 'Compact', note: 'Tighter spacing in lists and tables. Type size is unchanged.' },
];
const SIDEBARS: { id: SidebarChoice; label: string }[] = [
  { id: 'auto', label: 'Automatic (collapses on narrow windows)' },
  { id: 'expanded', label: 'Always expanded' },
  { id: 'collapsed', label: 'Always collapsed' },
];

/** Personal, per-browser preferences. Nothing here is governed configuration. */
export function SettingsView() {
  const { settings, updateSettings } = useUi();
  return (
    <div className="page page-narrow">
      <div className="settings">
        <section className="card" aria-labelledby="s-app">
          <h3 id="s-app">Appearance</h3>
          <fieldset className="radio-group">
            <legend>
              Theme <span className="muted small">(now {resolvedTheme(settings.theme)})</span>
            </legend>
            {THEMES.map((t) => (
              <label key={t.id} className="radio radio-block">
                <input type="radio" name="theme" value={t.id} checked={settings.theme === t.id} onChange={() => updateSettings({ theme: t.id })} />
                <span>
                  <span className="radio-title">{t.label}</span>
                  <span className="radio-note">{t.note}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <fieldset className="radio-group">
            <legend>Display density</legend>
            {DENSITIES.map((d) => (
              <label key={d.id} className="radio radio-block">
                <input type="radio" name="density" value={d.id} checked={settings.density === d.id} onChange={() => updateSettings({ density: d.id })} />
                <span>
                  <span className="radio-title">{d.label}</span>
                  <span className="radio-note">{d.note}</span>
                </span>
              </label>
            ))}
          </fieldset>
          <fieldset className="radio-group">
            <legend>Navigation</legend>
            {SIDEBARS.map((s) => (
              <label key={s.id} className="radio">
                <input type="radio" name="sidebar" value={s.id} checked={settings.sidebar === s.id} onChange={() => updateSettings({ sidebar: s.id })} />
                <span>{s.label}</span>
              </label>
            ))}
          </fieldset>
        </section>

        <section className="card" aria-labelledby="s-not">
          <h3 id="s-not">Notifications</h3>
          <label className="check check-block">
            <input type="checkbox" checked={settings.announceUpdates} onChange={(e) => updateSettings({ announceUpdates: e.target.checked })} />
            <span>
              <span className="radio-title">Announce new feed entries to screen readers</span>
              <span className="radio-note">A polite announcement when an entry arrives or is held. Never interrupts.</span>
            </span>
          </label>
          <label className="check check-block">
            <input type="checkbox" checked={settings.confirmations} onChange={(e) => updateSettings({ confirmations: e.target.checked })} />
            <span>
              <span className="radio-title">Show confirmations</span>
              <span className="radio-note">A short message after something is recorded here, with a link to the record.</span>
            </span>
          </label>
          <p className="muted small">The prototype has no alarm or escalation policy. These preferences only change how this screen behaves.</p>
        </section>

        <p className="muted small">Settings are stored in this browser only. They survive a scenario reset and are separate from the governed agent configuration in Administration.</p>
      </div>
    </div>
  );
}
