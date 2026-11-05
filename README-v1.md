# ECC

Local, interactive UI prototype of ECC, an event-triggered agent supporting Emergency Command Center incident response. All data is a fictional training scenario. Agent behaviour is deterministic mock logic. There are no AI, plant-control, dispatch or messaging integrations, and nothing is sent anywhere.

## Run

```
npm install
npm run dev
```

Open http://localhost:5177. A reload restarts the scenario, because incident state is held in memory only. Personal settings (theme, density, navigation, notifications) persist in `localStorage` and survive a reset.

`npm run build` type-checks and builds. The PDF viewer and its worker are loaded lazily, so the application stays light until an original is opened.

## Walkthrough

The simulation starts on its own: scripted events arrive on a timer. Training controls (the **Training · Fictional data** pill in the header, or the sidebar) pause, resume, step and reset it, list upcoming events and keep a facilitator log. The suggested walkthrough inside it opens each step directly.

1. Situation: watch the brief form as it is prepared. Open the lead attention item: the recommendation, its decision form and the procedure it cites open in the detail panel; the cited page opens in the viewer with the passage highlighted. **View all updates** opens the full feed in a drawer.
2. Monitoring: open it from the status line above the brief for readings, active alerts and source health.
3. Assets & Areas: select P-3104B on the real P&ID or plot plan sheet; switch to Dependency.
4. Actions: review the personnel accountability recommendation and record a decision.
5. Record a field update against the new response item.
6. Step to the fire team report (Training controls): the release assessment is revised, the earlier conflict entry is superseded, and the pump manual's scanned page cannot be read.
7. Step again: ERP-T-07 Rev D becomes effective. Earlier citations keep Rev C; the viewer offers Rev D without replacing anything.
8. Agent activity: each task's outcome or blocker, then steps and execution records on demand.
9. SITREPs: generate a draft, edit a section, refresh after newer information, keep or replace text.

## View responsibilities

These are views over connected records, not copies of each other.

- **Current brief** (Situation): about two sentences on the current development by stage (`briefNarrative`), with the qualifiers kept. States the current picture; does not explain how it changed.
- **Conditions** (Situation): the four brief conditions (fire, release, pump, personnel) as units, each carrying what is linked to it on record: an active alert with its source severity, the open question or conflict, and the response chain (recommendation, decision, reported response). One unit is the focal point: the recommendation waiting for a decision, else a completion awaiting verification, else the leading open concern, else the condition with the highest configured alert (`focalUnit` in `src/domain/situation.ts`). The focal unit shows observed condition, cited procedure, the "Consider…" suggestion and one action; it is held steady while a person works in it. Opening a unit shows the decision controls before the supporting history; it acknowledges nothing.
- **Response, Also open, Possible** (Situation, quiet column): response items not attached to a condition (no decision in ECC, or a decision recorded on no condition line), open questions and source limits that need no decision, and possible wider impact marked as not observed.
- **Monitoring** (from the Situation status line; full view on demand): current monitored conditions, readings, active alerts and source freshness.
- **Incident feed** (Situation, **View all updates** drawer): material developments as they occur, newest first by time published. Collapsed entries carry one statement, an evidence count and one action; expanding shows the full finding, what it replaced, uncertainty, every citation and how it was produced. An event that changes the brief and creates an attention item links to the item rather than repeating it. Opening a record from the drawer hands over to the detail panel.
- **Incoming reports** (Information): originals from people and systems, as received.
- **SITREPs**: editable, reviewed, point-in-time communications.
- **Agent activity**: a human-readable account of agent work (tasks, outcomes, blockers, consequences), with execution records as the technical drill-down. Hidden for the Observer prototype role.
- **Knowledge**: reference documents, their revisions and approval state, with the original file one click away.

## Original-source viewer

Every citation, report, knowledge document, system record and monitored reading opens through `sourceTarget` (`src/domain/brief.ts`) in one viewer (`src/ui/viewer/`), as a quick-inspection panel or expanded to the full window.

- **PDF**: the real page is rendered with PDF.js at the device pixel ratio. The cited passage is located in the page's real text (`locateQuote`) and highlighted in normalised coordinates, so highlights stay aligned at any zoom or size. Zoom, fit to width or page, page navigation and text search are available. The highlight note always says what the highlight is: exact; approximate (the number of matches and the quote searched); page only (with the reason); not found; or a scanned page with no text layer.
- **Drawings**: the same viewer with the real sheet. Cited regions are a marker-style highlight; equipment boxes from `SHEET_REGIONS` are selection targets added by ECC (teal when selected), clearly distinct from a citation highlight. Assets & Areas uses these sheets; the Dependency view is a separate illustrative layout.
- **Other formats** (DOCX): no faithful preview is implemented. The original is offered for download and any library text is labelled "Extracted text, not the original".
- **Reports** show the verbatim text and metadata; **readings** show the cited values, the latest value, source health, any alert with its severity mapping, and the history with gaps stated; **records with no file** are labelled as system records; a **missing or unreadable file** shows an honest error and its consequence.
- **Revisions**: the cited revision is kept. When a newer effective revision exists it is offered explicitly and opens at the same cited location; opening it changes no finding or decision.

Limits: pages are rendered one at a time; text search uses the same locator as citations and reports the number of matches; rotated text is not handled; there is no annotation or printing.

## Severity, evidence and source health

Three independent dimensions are never merged:

- **Operational severity** (`DisplaySeverity`): an illustrative mapping of the source's own value (`SEVERITY_MAPPING`: PRI-1 → Urgent, PRI-2 → Warning, PRI-3 → Advisory). The source value is always kept and the mapping is shown in detail. This is an assumption for customer validation, not approved policy.
- **Evidence status** (`Trust`): how far a statement can be relied on. Verified is not safe.
- **Source health** (`SourceState`): whether the link works. Connected is not equipment healthy; recovering is not the incident being resolved; no active alerts is not an all-clear.

Colour tokens, in light and dark: red is reserved for the highest severity level; amber is a warning or unresolved attention (degraded sources, awaiting confirmation); teal is interaction, selection and agent identity; neutral is routine information and evidence status; green is used only for an explicit positive state. Unread important updates are neutral, because unread is a reader state and not an acknowledgement. The training marker is neutral so it never competes with an operational warning.

## Structure

- `src/domain/`: the shared model. `types.ts` holds the trust, severity and source vocabularies; `scenario.ts` the scripted events, feed and execution records; `catalog.ts` the knowledge library, citations, sheet regions, monitors and tasks; `brief.ts` the concise Situation wording, sorted selectors (`feedEntries`, `timeline`, `incomingReports`, `execRecords`), monitoring summary and `sourceTarget`; `sourceLocate.ts` finds a quote in a page's real text; `content.ts` the Assistant, SITREP composition and record labels; `store.tsx` the reducer, simulation timer and provider.
- `src/ui/App.tsx`: shell and a small workspace context (selections, the expanded viewer and the monitoring drawer, personal settings).
- `src/ui/viewer/`: PDF loading (`pdf.ts`), the PDF viewer (`PdfViewer.tsx`, lazy), the unified source viewer, the expanded viewer and the reading detail.
- `src/ui/monitoring/`: the monitoring drawer.
- `src/ui/feed/`, `src/ui/views/`, `src/ui/rail/` (Details and Assistant), `src/ui/diagrams/` (zoom/pan viewer and the dependency sheet), `src/ui/forms/`, `src/ui/components/`, `src/ui/training/`, `src/ui/settings.ts`, `src/ui/styles.css`.
- `public/docs/`: the fixture originals. `scripts/make-fixtures.mjs` regenerates them with the installed Chrome (`node scripts/make-fixtures.mjs`); text pages get a genuine text layer and page 4 of the pump manual is a genuine image-only scan. `pid-33-01-rev-a.pdf` is deliberately absent to demonstrate an inaccessible file.

## Streaming model

Scripted events are applied by the provider on a timer (`SIM_TICK`) or by a facilitator (`SIM_STEP`, `SIM_SKIP_PREP`). Each event publishes whole feed entries; nothing is animated token by token.

The feed never moves content under a reader. Entries above `state.feedShownSeq` are held; the feed shows them automatically only while the reader is following at the top of the list, and otherwise offers an "N new updates" control. **Pause following** holds entries on screen without affecting the agent or the simulation; pausing the simulation is a separate training control. Selected evidence lives in the store, so arrivals never change what the panel shows. The brief stays current whether or not the feed is followed.

Entries can supersede earlier ones (the old entry stays, marked, with a link forward), summarise several low-level items (`group`), or merge repeats (`repeatCount`). Important entries keep an "unread" marker until the reader sets a review point (`MARK_REVIEW_POINT`); "Since you last reviewed" filters to what arrived after that point. Setting a review point acknowledges nothing.

## Assumptions to validate

- Decision outcomes (Proceed, Proceed with changes, Do not proceed, Defer) and who may record them. "Recorded by" is attribution only; sign-in would supply it.
- What counts as "verified". The prototype accepts an instrument reading plus a direct observation, or a person recording verification.
- The severity mapping and the age at which a reading is shown as old (a display choice, not a plant threshold).
- Real reporting intervals. Expected-by times are placeholders.
- Which systems supply equipment, connectivity, permit, maintenance, monitoring and weather data.
- Procedure references. ERP-T-07 is an invented placeholder.
- SITREP sections, review lifecycle and distribution. Nothing is sent from the prototype.
- Platform roles and permissions. The prototype role in User profile only shows or hides controls.
- Closure criteria and incident stages.
