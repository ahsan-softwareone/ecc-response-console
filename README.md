# ECC Response Console

Emergency Command Center Response Console: a training application for following an incident, deciding on recommendations and issuing Sit. Reps (simulated, no live data).

Agentic emergency-response support prototype. The current version is **v3**, in [`v3/`](v3/). All operations are simulated, and all data, limits and procedure wording are illustrative.

## Install and run v3

Requires Node 24 (the version it was developed with).

```
cd v3
npm install
npm run dev
```

Open http://localhost:5189. The port is fixed, so the command fails if 5189 is already in use.

## Checks

Run from `v3/`. Both check scripts need the dev server running and Google Chrome installed.

```
npm run build              # type-check and production build
npm run verify:lifecycle   # focused lifecycle, agent, saving and window checks
npm run verify             # full end-to-end suite, about 12 minutes
```

Screenshots go to `SHOTS_DIR`, or a folder in the system temp directory by default.

## What is simulated

- **Scenario and agent:** readings, alerts, agent tasks and recommendations are scripted. No language model, plant system, dispatch or messaging service is connected.
- **Real incidents:** these get simulated baseline readings and one keyword search of Knowledge, with no alerts or recommendations.
- **Assistant:** returns ranked passages from keyword search, with citations. It doesn't generate answers.
- **Roles:** the User and Admin switch is a demonstration, not authorization.

These parts do work: file ingestion, PDF text extraction, generated PDF reports, the append-only incident record, and JSON export and import.

## Where data is kept

Nothing leaves the browser. Records, uploaded files and extracted text are in IndexedDB; layout, preferences, scenario state and the Assistant conversation are in localStorage. Clearing site data removes them, so use Export in Settings to keep a copy. None of this data is in the repository.

## Repository layout

| Path | Contents |
|---|---|
| `v3/` | Current prototype. See [`v3/README.md`](v3/README.md) for the walkthrough and assumptions to validate |
| `v2/` | Earlier version, port 5188. Kept for reference |
| Project root (`src/`, `public/`, `scripts/`) | First prototype, port 5177. Kept for reference; see [`README-v1.md`](README-v1.md) |
