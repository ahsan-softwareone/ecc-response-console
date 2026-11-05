# ECC — emergency-response support prototype (v3)

Interactive React prototype of ECC for the SG GSP drone-interception scenario, extended with a self-contained incident record, Sit. Rep reports, Agent Log, unified Knowledge (search, documents, incidents), real document ingestion and a retrieval-based Assistant. All data, limits, procedure wording and documents are illustrative fixtures; nothing is SME-validated.

## Run

```
npm install
npm run docs      # regenerates the PDF fixtures in public/docs with installed Chrome (already generated)
npm run dev       # http://localhost:5189
npm run build     # tsc + vite build
npm run verify    # full end-to-end checks (about 12 min); add -- --only=core,reports,agentlog,knowledge,persist,assistant,shots to run sections
npm run verify:lifecycle   # focused lifecycle, agent, saving and window checks
```

Both check scripts need the dev server running on port 5189 and use installed Google Chrome. Screenshots go to `SHOTS_DIR`, or a folder in the system temp directory by default. Developed with Node 24. Dependencies are pinned; PDF generation and IndexedDB access are hand-written.

## Walkthrough

Tabs: **Situation | Sit. Rep | Agent Log | Knowledge**. The **Assistant** is a header control that opens a fixed-width right panel on any tab. The bottom strip is the **facilitator control** (Next / Auto / Simulate / New training / Clear all local data; Simulate holds the incoming notification, agent error, retrieval failure and local save failure demonstrations).

1. **Situation**: equipment cards with watchers, alert log, Investigation window with the chain *Observed condition → Applicable protocol → Suggested response → Decision → Reported execution → Observed outcome*, docked document viewer. Reveal steps with *Next*; each step's events unfold over ~30–45 s and nothing appears before its own timestamp.
2. **Sit. Rep**: the complete chronological incident timeline (search, category filter, "what was known at" a decision, evidence chips opening the shared viewer, append-only corrections). Right pane: SITREP versions (draft from the record as of now → edit → refresh keeps your edits and offers newer text → submit for review → approve) and Status & closure (Resolve, then closure review with required rationale and outstanding issues, lessons learned; older records may still show a stabilization entry). Two PDF downloads: **Incident Timeline Report** (full record, filters never apply) and **SITREP** (point-in-time: nothing after its as-of time).
3. **Agent Log**: readable task summaries (sources checked, documents consulted, findings produced, failures/retries) with drill-down Task → steps → operations. Run identifiers, timings, retries, errors, configuration versions and raw logs appear only for the **Admin** role (prototype role switch in the user menu; not real authorization). All agent activity is simulated and marked so once.
4. **Knowledge**: *Search* (keyword retrieval over extracted text and incident records, scope by site and content type), *Documents* (filters: site, type, status, equipment; add document; revisions; per-upload states; reference a revision in the current incident), *Incidents* (filters: status, real/training, site, year; detail with timeline; JSON export). The single local-storage note sits here.
5. **Assistant**: ranked cited passages grouped by Approved documents / Other documents / Incident records (historical evidence, not protocol). Each citation opens the shared viewer with the same exact / ambiguous / page-only honesty rules; closing it returns to the conversation and page. Scope controls and the active incident context are always visible. A Critical alert stays discoverable through the compact indicator at the top of the panel.

## What is real vs simulated

| Area | Real | Simulated / fixture |
|---|---|---|
| Scenario, readings, alerts, agent tasks | — | Scenario data (`src/data/scenario.ts`), time-gated per step |
| Incident record | Append-only record materialized from visible events and user actions, stored in IndexedDB; renders without `scenario.ts` | Seeded historical incidents are illustrative |
| Reports | PDF files generated in the browser (`src/lib/pdfwrite.ts`, text layer parseable), JSON export | — |
| Retrieval | `RetrievalProvider` interface (`src/lib/retrieval.ts`); local BM25-style keyword ranking over text extracted by pdf.js page by page (cached in IndexedDB) and incident-record events | No semantic / vector search, no language model. "Retrieval failure" under Simulate in the facilitator strip returns a simulated error result. |
| Ingestion | Real file picker; original stored as a Blob in IndexedDB; PDFs parsed by pdf.js; states stored / extraction / index / approval / use-in-incident | No OCR: a PDF without a text layer is stored and viewable but not searchable |
| Assistant | Retrieval results only, grouped and cited | Nothing is synthesized; no LLM is connected |
| Persistence | IndexedDB for records, uploads, extracted text; localStorage for layout, preferences, scenario state and the Assistant conversation | Browser-local only; storage failures are reported, never silent |
| Roles | — | User / Admin switch is a prototype control, not authorization |


## Round 4 changes (UI refinements)

- **Dividers.** One shared `Divider`/`SplitPane` (`src/ui/Split.tsx`) now drives Situation and every adjacent-panel layout (Sit. Rep, Agent Log, Knowledge → Documents / Incidents, the Assistant's left edge): drag, arrow keys (Shift ×4), double-click reset, `role="separator"`, minimum sizes, text selection and PDF canvas pointer capture suppressed while dragging. Sizes persist per layout; a small window clamps for display without overwriting the stored size. Each pane has the same maximize/restore control as the Situation windows (per layout, persisted; the hidden pane stays mounted so scroll, selection and half-edited text survive). The Assistant panel has no maximize (it is a fixed-width side panel).
- **Assistant.** Resizable 320–640 px (persisted). It pushes the workspace only when the remaining width keeps every column above its minimum for the current tab, otherwise it overlays.
- **Header.** Timer → theme toggle → Assistant → profile (profile at the extreme right at all widths; name/role text drops before the avatar). The Assistant button uses a conversation mark echoing the dotted-arc motif, a thin green–cyan–blue border, and an open state with a filled icon and an underline bar (`aria-expanded`).
- **Branding.** The header lockup uses a transparent SVG symbol derived from the supplied PNG by detecting dot centres, radii and colours (`scripts/extract-logo.mjs` → `public/brand/ecc-symbol.svg`), plus text in the supplied hierarchy (UPSTREAM teal, ECC bold white, AI AGENT light blue). Favicon: the symbol on a navy tile (`public/brand/favicon.svg`). Document title: "Upstream ECC AI Agent".
- **Alert Log filters.** One toolbar row: severity (segmented; a select when the window is narrow), equipment multi-select (monitored items plus any equipment with alerts), status (Active / Unconfirmed / Reported / Recovered / Cleared), search (text and tag), matching count, Clear filters, and a compact clickable "N Critical · M High hidden" indicator. Card badges set and reflect the equipment filter. Filters are display-only and persist; the new-alerts pill counts matching arrivals only.
- **Agent Log.** Business view (default for ordinary users): plain-language account per task, categories, documents by title, failures by impact; no technical data in the DOM. Admin: Business | Detailed toggle (default Detailed) with the full Task → steps → operations → logs tree and a flat chronological technical log. Toolbar: search, category, outcome, equipment, level (Detailed only), group by category, hidden-failure indicator. Categories derive from what each task actually did.
- **Trend maximize.** Every watcher row has a maximize control that opens a large chart overlay (`src/situation/TrendOverlay.tsx`): axes and units, configured limits drawn and labelled, hover readout, 15 min / 60 min / all-so-far window, alert markers that jump to the alert, an explicit signal-lost gap, and a status lane for state variables. Watchers of the same equipment are switchable inside the overlay, each with its own scale. Esc or close restores the layout, scroll and focus exactly.
- **Citations.** One shared control (`src/ui/Citation.tsx`) wherever a document backs an insight (response window, decisions, timeline, SITREP evidence, Agent Log, Knowledge, Assistant): *View evidence* opens the viewer at the pinned revision and page (with a "newer revision" notice and an explicit switch), *Open original* opens the file; "location not recorded" and unresolved documents are stated rather than linked.
- **Equipment cards** sit on a recessed well with a tinted header row and a slightly stronger border (neutral tokens only). **New draft** is a quiet action button; the dark-theme primary fill is softened.

## Round 5 changes (lifecycle, agent controls, settings, windows)

- **No incident by default.** A fresh browser opens on a calm workspace: Start incident, Start training scenario, Browse historical incidents. A status bar under the header shows mode, title, id, site, lifecycle and start time, and opens occurred / record created / agent started times. An incident already open in a browser stays open after upgrading.
- **Real incidents** have no scripted developments: simulated baseline readings, one real keyword search of Knowledge within the configured scope, and nothing else is invented. The training scenario is unchanged.
- **Agent runs** are recorded on the incident (`src/lib/agent.ts`). Agent output (alerts, assessment findings, recommendations, tasks) is released by the run's processing windows; readings and field reports are never gated. Pause holds output; resume or a new run processes it, shown as "analysed HH:MM". Start again adds a run; output ids are stable, so nothing is duplicated.
- **Config.** Defaults (future incidents, Admin demonstration role) and this incident (applies from the next run) are separate and versioned. Capability groups really suppress that work. No cadence option is offered because the simulation has none.
- **Lifecycle.** Active -> Resolved -> Closed. Resolution and closure commit only after the IndexedDB write succeeds. Reopen and return to Active keep earlier resolutions and closures. Set-aside incidents keep their simulation state and can be resumed.
- **Export/import** (`src/record/backup.ts`). The file holds complete records plus the original files of uploaded documents, and states what it holds. Built-in fixture documents are referenced by id only. Import validates first and never overwrites: duplicates are skipped or imported as copies.
- **Windows.** Every panel has maximize/restore/hide; hidden and maximized-away panels stay mounted, so forms, selections, filters and scroll survive. Overlays now start below the status bar. Escape closes one layer (`src/ui/esc.ts`). `npm run verify:lifecycle` runs the focused checks.

## Design notes (carried from v2)

Navy frame, white surfaces, teal for interaction, red/amber only for severity. Severity, evidence status, source health, read/unread, decision state and execution state stay separate. One quiet persistent marker for illustrative data; one quiet "Simulated" marker on Agent Log; one local-storage note in Knowledge. New surfaces reuse the window/pane language, chips, viewer and store.

## Assumptions to validate with the customer

- **Severity mapping** and the scenario's assignments are provisional.
- **Authority wording.** The user is a Shift Manager acting until the Incident Manager reaches ECC; decisions, resolution and closure are recorded under that role. No handover or command-transfer workflow; who may close an incident is not enforced.
- **Supersession** pairs (which later alert makes which recommendation stale) are scenario data.
- **Record categories and SITREP sections** (Situation, Response, Decisions, Outstanding concerns, Priorities) are a proposal.
- **Clock behaviour.** One scenario clock (wall clock plus a persisted skew). Revealing a step adds to the skew when the demo is ahead of the step's nominal time, so the elapsed timer reads the nominal offset. Every timestamp (alerts, decisions, reports, closure, as-of times, agent operation times, exports) comes from this one clock, so record order is always knowledge order; hh:mm labels may therefore run ahead of the wall clock during a demo.
- **Retrieval quality** is keyword-only; a production backend (search or vector) replaces `LocalRetrievalProvider`.
- **Approval** of uploaded documents is never established by ECC; declared statuses are shown as declared by the uploader. Uploaded documents never feed agent recommendations.
- **Persistence** is browser-local; multi-user, server-side records are out of scope.
