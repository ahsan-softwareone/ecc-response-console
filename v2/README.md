# ECC — emergency-response support prototype (v2)

Interactive React prototype of ECC for the SG GSP drone-interception scenario. All data, limits, procedure wording and documents are illustrative fixtures; nothing is SME-validated.

## Run

```
npm install
npm run docs      # regenerates the PDF fixtures in public/docs with installed Chrome (already generated)
npm run dev       # http://localhost:5188
npm run build     # tsc + vite build
npm run verify    # end-to-end checks with headless Chrome; screenshots to SHOTS_DIR (defaults to the session scratchpad)
```

Node 24, installed Google Chrome. Dependencies are pinned.

## Walkthrough

The bottom strip is the **facilitator control** (deliberately styled apart from the operational UI). *Next* reveals the next scenario step, *Auto* advances every 12 s, *Reset* starts a fresh emergency. State persists across reloads.

1. **Step 1 — Drone intercepted.** Four relevant items are on the dashboard. One Medium alert. The timer starts at 00 h 00 m.
2. **Step 2 — Shrapnel damages D-0029, fire.** Critical alert. Select it: the Investigation window shows the chain *Observed condition → Applicable protocol → Suggested response → Decision → Reported execution → Observed outcome*. Click the procedure reference to open the original PDF in the docked Document window on the cited page with the passage highlighted from the real text layer.
3. **Step 3 — Heat affects D-0001.** Pressure and temperature rise; the recommendation carries a calculation that is *not computed* because no validated method exists.
4. **Step 4 — Deluge fails.** Field report and flow reading conflict. The cited passage occurs three times in the fire-response guidance: the viewer shows match navigation instead of an arbitrary highlight. The operating-limits citation is page-only and says so. D-0029 temperature signal is lost (source health, not severity).
5. **Step 5 — Normal flare route damaged.** Record a decision on the FH-01 alert; the decision pins the guidance revision it used (Rev 2).
6. **Step 6 — Upstream route used.** A field report arrives as *Reported*, distinct from the decision and from verification.
7. **Step 7 — Stabilizing.** Earlier alerts transition to *Cleared*. Knowledge sync makes Rev 3 effective; the earlier decision and its evidence keep Rev 2 and the viewer says so.

Other destinations: **Agent Activity** (task → steps → operations → logs, with config version and linked outputs), **Knowledge** (same viewer, revisions, equipment links), **SITREP** (agent drafts → review → approve → export as Markdown), **Records** (accumulating record of this emergency, and searchable historical emergencies with real vs training clearly distinct).

Monitoring interactions: *Add equipment* (window header), *+ Watcher* and the row menu on each card (trend window, limit shown, hide), the value itself to inspect a measurement, and the card's alert indicator to filter the log (important alerts on other equipment stay announced below the log). Dividers drag; windows swap, maximize and restore; the document window is the optional third docked window; when the viewport is too narrow for both sides the workspace goes into focus mode instead of squeezing columns.

## Design notes

- Navy frame, white surfaces, cool neutral workspace; teal only for interaction; red/amber only for operational severity.
- Severity, evidence status, source health, read/unread, decision state and execution state are separate fields and separate visual treatments. *Verified* is a neutral outline, never green.
- New alerts are held behind an "N new" affordance while the log is scrolled, so nothing being read moves. Selecting marks read; acknowledgement and decisions are explicit.
- One quiet persistent marker ("Training scenario · illustrative data") in the top bar; per-value labelling in inspection detail; every fixture PDF page carries its own marker.
- Docking is hand-built (two columns, two vertical splits, swap, maximize/restore, focus mode, persisted layout) rather than a library; it was more predictable for this set of behaviours.

## Assumptions to validate with the customer

- **Severity mapping.** Critical / High / Medium / Low and their colours are provisional. The scenario's assignments (e.g. deluge no-flow = Critical, signal loss = Low) are illustrative.
- **Authority wording.** The prototype user is a Shift Manager acting until the Incident Manager reaches ECC; decisions are recorded under that role. The Incident Commander appears only as the source of field reports. No handover or command-transfer workflow exists; which role may record which decision is not enforced.
- **Illustrative data.** All limits ("placeholder" basis), readings, document contents, procedure wording, route descriptions and historical records are fixtures. Calculations are withheld when no validated method exists, rather than estimated.
- **Alert grouping.** Repeated notifications of an unchanged condition are grouped (×n); the rule for what counts as a meaningful change is provisional.
- **Clock behaviour.** The elapsed timer is derived from the persisted emergency start time. For demonstration, revealing a step jumps the clock forward to that step's nominal offset when the demo is ahead of it; it never restarts. After a reveal the step's events unfold in real time over the next ~30–45 s: no alert, observation, report, clear or supersession is visible before its own timestamp, and each reading settles 10 s before the alert that quotes it.
- **Superseded recommendations.** A later alert can supersede an earlier recommendation (e.g. the FH-01 damage report supersedes "depressurize via the normal relief route"). The original text stays visible and marked, decision controls are removed, and a decision recorded before the supersession is kept exactly as recorded and flagged for review. Which events should supersede which is scenario data to validate.
- **Alert states.** Active / Unconfirmed (source lost) / Recovered / Reported (not independently verified) / Cleared. Card indicators count only Active and Unconfirmed; the Situation badge counts unread rows.
- **Stabilization criteria** and closure/post-incident review are placeholders in the record.
