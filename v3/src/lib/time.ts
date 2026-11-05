import { useEffect, useState } from 'react';

// One scenario clock for everything: wall clock plus a persisted skew that the
// facilitator's Next adds to. People's entries and scenario events are stamped
// from the same clock, so record order always matches knowledge order.
const listeners = new Set<() => void>();
let skew = 0;
export function setClockSkew(ms: number) { skew = ms; listeners.forEach((l) => l()); }
export function clockSkew() { return skew; }
export function now() { return Date.now() + skew; }

// One shared ticking clock. Components subscribe at the cadence they need.
let timer: number | null = null;
function ensureTimer() {
  if (timer != null) return;
  timer = window.setInterval(() => listeners.forEach((l) => l()), 1000);
}

export function useNow(stepMs = 1000): number {
  const [t, setT] = useState(() => now());
  useEffect(() => {
    ensureTimer();
    let last = now();
    const l = () => {
      const cur = now();
      if (cur - last >= stepMs - 20) { last = cur; setT(cur); }
    };
    listeners.add(l);
    return () => { listeners.delete(l); };
  }, [stepMs]);
  return t;
}

export function pad2(n: number) { return n < 10 ? `0${n}` : String(n); }

export function elapsedParts(ms: number) {
  const total = Math.max(0, Math.floor(ms / 60000));
  return { h: Math.floor(total / 60), m: total % 60 };
}

/** Clock time, 24 h, local. */
export function clock(ts: number) {
  const d = new Date(ts);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}
export function clockSec(ts: number) {
  const d = new Date(ts);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}:${pad2(d.getSeconds())}`;
}
export function dateTime(ts: number) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())} ${clock(ts)}`;
}

/** "T+14 m" style elapsed label relative to emergency start. */
export function tPlus(ts: number, startedAt: number) {
  const { h, m } = elapsedParts(ts - startedAt);
  return h > 0 ? `T+${h} h ${pad2(m)} m` : `T+${m} m`;
}

export function ago(ms: number) {
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s} s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.floor(m / 60);
  return `${h} h ${m % 60} min ago`;
}
