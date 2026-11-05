import { STEPS, WATCHERS } from '../data/scenario';
import type { ScenarioStep, SourceHealth, Trend, WatcherDef } from '../data/types';

export const RAMP_MS = 12_000;      // a revealed reading ramps in over this period
export const CADENCE_MS = 5_000;    // simulated observation cadence
export const SETTLE_MS = 10_000;    // a reading has settled this long before an alert quotes it

/**
 * Length of a step's event window after its reveal: everything the step contains
 * (alerts, repeats, observations, findings, field reports, task runs, reading ramps)
 * becomes visible only when the scenario clock reaches its own timestamp.
 */
export function stepWindowSec(step: ScenarioStep): number {
  const xs = [RAMP_MS / 1000,
    ...step.alerts.map((a) => a.offsetSec),
    ...(step.reiterations ?? []).map((r) => r.offsetSec),
    ...step.observations.map((o) => o.offsetSec),
    ...step.findings.map((f) => f.offsetSec),
    ...(step.fieldReports ?? []).map((r) => r.offsetSec),
    ...step.tasks.map((t) => t.startSec + t.durationSec)];
  return Math.ceil(Math.max(...xs));
}

/** The ramp for a watcher at a step settles SETTLE_MS before the first alert quoting it. */
function rampEndSec(step: ScenarioStep, watcherId: string): number {
  const cites = step.alerts.filter((a) => a.watcherId === watcherId).map((a) => a.offsetSec);
  return cites.length ? Math.max(RAMP_MS / 1000, Math.min(...cites) - SETTLE_MS / 1000) : RAMP_MS / 1000;
}

export interface Clock { startedAt: number; revealedAt: number[] }

const WATCHER_BY_ID = new Map(WATCHERS.map((w) => [w.id, w]));
export function watcherDef(id: string): WatcherDef | undefined { return WATCHER_BY_ID.get(id); }

function hash(seed: number, bucket: number) {
  const x = Math.sin(seed * 12.9898 + bucket * 78.233) * 43758.5453;
  return x - Math.floor(x);
}
function seedOf(id: string) { let h = 0; for (let i = 0; i < id.length; i++) h = (h * 31 + id.charCodeAt(i)) % 100000; return h; }

function interp(from: number, to: number, s: number, e: number, t: number) {
  if (e <= s) return to;
  const p = Math.min(1, Math.max(0, (t - s) / (e - s)));
  return from + (to - from) * p;
}

interface Keypoint { t: number; t1: number; value: number; trend: Trend; source: SourceHealth }

/** Keypoints revealed so far for a watcher, in scenario order. */
export function keypoints(w: WatcherDef, clock: Clock): Keypoint[] {
  const out: Keypoint[] = [];
  for (let k = 0; k < clock.revealedAt.length && k < STEPS.length; k++) {
    const kp = STEPS[k].readings[w.id];
    if (!kp) continue;
    const end = clock.startedAt + clock.revealedAt[k] + (kp.rampSec ?? rampEndSec(STEPS[k], w.id)) * 1000;
    out.push({ t: Math.max(clock.startedAt + clock.revealedAt[k], end - RAMP_MS), t1: end, value: kp.value, trend: kp.trend, source: kp.source ?? 'live' });
  }
  return out;
}

export interface Sample { value: number; source: SourceHealth; trend: Trend; observedAt: number }

/** Value of a watcher at time t, built only from revealed keypoints. */
export function sampleAt(w: WatcherDef, t: number, clock: Clock): Sample {
  const kps = keypoints(w, clock);
  let segFrom = w.baseline, segTo = w.baseline, segStart = clock.startedAt, segEnd = clock.startedAt;
  let trend: Trend = 'steady';
  let source: SourceHealth = 'live';
  let lostAt: number | null = null;
  for (const kp of kps) {
    if (t < kp.t) break;
    const vAtK = interp(segFrom, segTo, segStart, segEnd, kp.t);
    segFrom = vAtK; segTo = kp.value; segStart = kp.t; segEnd = kp.t1;
    trend = kp.trend;
    source = kp.source;
    if (kp.source === 'lost' && lostAt == null) lostAt = kp.t;
    if (kp.source !== 'lost') lostAt = null;
  }
  if (lostAt != null) {
    // Frozen at the last good observation; no noise, no updates.
    const frozenT = Math.floor(lostAt / CADENCE_MS) * CADENCE_MS;
    const v = interp(segFrom, segTo, segStart, segEnd, frozenT);
    return { value: round(w, v), source: 'lost', trend: 'steady', observedAt: frozenT };
  }
  const observedAt = Math.floor(t / CADENCE_MS) * CADENCE_MS;
  const base = interp(segFrom, segTo, segStart, segEnd, observedAt);
  const amp = w.unit === 'status' ? 0 : 0.004 * Math.max(Math.abs(base), w.unit === '%' ? 5 : 1);
  const n = (hash(seedOf(w.id), Math.floor(observedAt / CADENCE_MS)) - 0.5) * 2 * amp;
  return { value: round(w, base + n), source, trend, observedAt };
}

function round(w: WatcherDef, v: number) {
  if (w.unit === 'status') return v >= 0.5 ? 1 : 0;
  const f = Math.pow(10, w.decimals);
  return Math.round(v * f) / f;
}

/** Sparkline series: `n` samples across `windowMs` ending at `t`. */
export function series(w: WatcherDef, t: number, clock: Clock, windowMs: number, n = 48): { t: number; v: number }[] {
  const out: { t: number; v: number }[] = [];
  const start = t - windowMs;
  for (let i = 0; i < n; i++) {
    const st = start + (windowMs * i) / (n - 1);
    out.push({ t: st, v: sampleAt(w, st, clock).value });
  }
  return out;
}

export function formatValue(w: WatcherDef, v: number) {
  if (w.unit === 'status') return (w.statusLabels ?? ['Off', 'On'])[v >= 0.5 ? 1 : 0];
  return v.toFixed(w.decimals);
}
