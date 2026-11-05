// Personal settings. Kept in the browser, apart from the scenario and from governed configuration,
// so a scenario reset never touches them. Every storage access is guarded.
import { useCallback, useEffect, useState } from 'react';

export type ThemeChoice = 'light' | 'dark' | 'system';
export type Density = 'comfortable' | 'compact';
export type SidebarChoice = 'auto' | 'expanded' | 'collapsed';

export interface Settings {
  theme: ThemeChoice;
  density: Density;
  sidebar: SidebarChoice;
  /** Announce new feed entries to assistive technology. */
  announceUpdates: boolean;
  /** Show confirmation toasts for things recorded here. */
  confirmations: boolean;
}

const KEY = 'ecc.settings';
export const DEFAULTS: Settings = { theme: 'system', density: 'comfortable', sidebar: 'auto', announceUpdates: true, confirmations: true };

function load(): Settings {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<Settings>;
    return { ...DEFAULTS, ...parsed };
  } catch {
    return DEFAULTS;
  }
}

function save(s: Settings) {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* storage may be unavailable; the choice still applies for this session */
  }
}

const mq = () => (typeof window !== 'undefined' && window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null);

/** Applies the theme to <html>. "System" follows the OS live. */
export function resolvedTheme(choice: ThemeChoice): 'light' | 'dark' {
  if (choice !== 'system') return choice;
  return mq()?.matches ? 'dark' : 'light';
}

export function useSettings() {
  const [settings, setSettings] = useState<Settings>(load);
  const update = useCallback((patch: Partial<Settings>) => {
    setSettings((prev) => {
      const next = { ...prev, ...patch };
      save(next);
      return next;
    });
  }, []);

  useEffect(() => {
    const apply = () => {
      const t = resolvedTheme(settings.theme);
      document.documentElement.setAttribute('data-theme', t);
      document.documentElement.style.colorScheme = t;
    };
    apply();
    const m = mq();
    if (settings.theme === 'system' && m) {
      m.addEventListener('change', apply);
      return () => m.removeEventListener('change', apply);
    }
  }, [settings.theme]);

  useEffect(() => {
    document.documentElement.setAttribute('data-density', settings.density);
  }, [settings.density]);

  return { settings, update };
}
