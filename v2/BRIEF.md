We are designing **ECC**, an agentic emergency-response support application for Saudi Aramco. Below is the product context, scope, and UI direction agreed so far.

## Product purpose

An emergency occurs, and ECC begins gathering the information needed by the Incident Manager.

The Incident Manager usually takes approximately 10–15 minutes to reach the Emergency Control Center. The Shift Manager generally fills in during that period. The agent should already be identifying relevant equipment, reviewing available information, retrieving procedures and drawings, and preparing an evidence-backed picture.

The agent continues monitoring as the emergency develops. When it identifies a significant condition, threshold breach, protective-system failure, or potential escalation, it communicates the finding and suggests appropriate responses supported by applicable procedures.

People make decisions and carry out the response. ECC records what was recommended, decided, reported, and observed.

**Handover remains manual. Do not build command-transfer or handover workflows.**

The supplied journey distinguishes:
- **Incident Manager:** strategic direction, resource coordination, and logistical support from ECC.
- **Incident Commander:** tactical response at the incident location.

Some journey steps blur these responsibilities. Use role-aware wording and document assumptions rather than inventing authority rules.

## Release scope

**Phases 1, 2, and 3 of the supplied specification are all included in this release.** Items explicitly outside that scope remain excluded.

PI alarms, equipment status, and relevant process measurements should be **simulated from scenario data for now**, while providing the intended complete monitoring UI.

Do not build production integrations for this prototype.

Included capabilities encompass:
- Incident entry and scenario progression.
- Relevant document and drawing retrieval.
- Equipment monitoring, trends, and limits.
- Route availability assessment.
- SME-validated engineering calculations where methods and inputs exist.
- Evidence-backed findings and response recommendations.
- SITREP preparation, review, approval, and export.
- Agent observability.
- Persistent emergency records and historical-emergency browsing.

The historical-record capability is an explicit product requirement from our discussion and should be captured accordingly.

## Scenario to demonstrate

Use the agreed **SG GSP drone-interception scenario**, rather than the earlier generic pump-fire example.

The scenario develops as follows:
1. A drone is intercepted.
2. Shrapnel damages propane accumulator **D-0029**, starting a fire.
3. Heat affects nearby HP Separator **D-0001**; its pressure and temperature rise.
4. The deluge system fails.
5. The normal flare route is damaged.
6. An alternative upstream depressurization route is used.
7. The team monitors whether the response is effective and progresses toward stabilization.

Reveal these events progressively. The agent must not know later developments before the available evidence establishes them.

Use clearly labelled illustrative values where real scenario inputs are missing. Do not invent authoritative engineering limits, procedures, valve instructions, or calculation results.

## Why previous UI attempts failed

Earlier prototypes displayed:
- Large incident briefs.
- Repetitive condition cards.
- A permanent feed occupying half the screen.
- Separate attention and response sections repeating the same information.
- Long source lists and explanatory paragraphs.
- Nested panels and histories.
- Three squeezed reading columns when details opened.

The user repeatedly rejected this as cluttered and unsuitable for an emergency control room.

The goal is a **beautifully designed, professional, minimal dashboard** with clear monitoring and response interactions.

Do not reproduce those layouts with smaller text.

## Application shell

Use **top-level navigation**, rather than the previous sidebar.

Call the application **ECC**.

At the top right, show the user’s identity and role.

**Immediately to the left of the user information, show a prominent elapsed-emergency timer in hours and minutes.**

For example:

**00 h 14 m**
Since emergency started

It must be obvious, readable, and based on the emergency’s start time. Navigation or layout changes must not restart it.

Support consistent light and dark themes.

## Situation workspace

The user’s preferred composition has a monitoring workspace on one side and a response/observation workspace on the other.

### Monitoring workspace — default left

Divide it vertically into two dockable windows:

**Top: Equipment cards**

Show relevant equipment as detailed cards.

The user can:
- Add equipment to the emergency dashboard.
- Add watchers for different variables on a specific equipment item.
- Remove or adjust displayed watchers.
- Inspect a measurement or trend.
- Select equipment-specific alert indicators to filter the alert log.

A single equipment item can have several watchers with different units:
- Pressure in bar.
- Temperature in °C.
- Flow in m³/h.
- Level in %.
- Availability or running status where relevant.

Each watcher should clearly show:
- Variable name.
- Current value and unit.
- Trend.
- Applicable configured limit, where available.
- Observation time or freshness.
- Source state where it affects interpretation.

Do not put different units on an unexplained shared scale. Separate aligned trend lanes are acceptable; another clear, labelled solution is also acceptable.

Equipment should be initially selected by relevance to the emergency, with user customization available.

Changing what the user watches must not silently disable the agent’s underlying monitoring or hide important alerts.

**Bottom: Equipment alert log**

Show meaningful alerts generated from monitored conditions.

The log should be simple and familiar:
- Severity.
- Equipment.
- Concise alert description.
- Time.
- Current state.
- Clear selection interaction.

Use visible severity labels such as **Critical, High, Medium, Low**, with a consistent colour mapping. Treat the exact mapping as provisional until customer validation.

Group repeated notifications for an unchanged condition. Show transitions and meaningful changes by default. Do not list “In alarm” once per minute as the default history.

Selecting an alert opens its relevant response and evidence in the other workspace.

Equipment cards should have notification-style indicators that filter alerts for that equipment. Make the filter obvious and easy to clear. Important alerts elsewhere must remain discoverable.

**Between equipment and alert log:**
Provide a draggable horizontal divider so the user can adjust their relative heights.

### Response and observation workspace — default right

Use this space for the selected alert or equipment concern.

Support:
- Response recommendations.
- Observations and readings.
- Potential consequences.
- Relevant procedures.
- Original documents and drawings.
- Quick inspection of supporting evidence.

Use tabs or dockable views to keep the default presentation concise.

For a selected alert, connect:

**Observed condition → applicable protocol → suggested response → human decision → reported execution → observed outcome**

Initially show only what helps the user understand and act.

Provide easy access to:
- Why the alert was generated.
- The relevant measurement and threshold.
- What may happen if the condition persists.
- The suggested response.
- The procedure or evidence supporting it.
- Missing prerequisites or uncertainty.
- Current decision and response status.

Recommendations must remain distinguishable from instructions, recorded decisions, and completed field actions.

## Docking and window management

The user wants flexible windows, not a rigid arrangement.

Support:
- Resizing the left/right split.
- Resizing the equipment/log split.
- Swapping monitoring and response sides.
- Maximizing a selected window.
- Restoring the previous layout.
- An optional third docked window when useful.
- Closing an investigation without losing selection or scroll position.

The equipment window, alert-log window, and response/inspection window are the main working windows.

Do not automatically squeeze all three into narrow reading columns. Respect practical minimum sizes and use focus mode when space is insufficient.

A proper desktop docking library is acceptable if it improves reliability and the experience.

## Agent behaviour and streaming

The agent proactively monitors the emergency context. Users should not have to ask a chatbot to start gathering information.

When something significant happens, the agent produces a concise alert or update.

The monitoring alert log is the main operational stream on Situation. Do not add another large, competing general-purpose feed alongside it.

Keep routine retrieval events and technical activity in Agent Activity.

The user needs to understand:
- What happened.
- Why it matters.
- What response is suggested.
- What supports that suggestion.

New updates must not:
- Force scrolling.
- Move an item being reviewed unexpectedly.
- Reset forms or selections.
- Treat an item being read as a decision or alert acknowledgement.

## Original-document viewer

The user explicitly wants to see the **original document**, especially because its location is known.

Use a consistent viewer from alerts, recommendations, equipment, and Knowledge.

Support:
- Opening the actual PDF or a faithful preview.
- Navigating to the cited page or sheet.
- Highlighting the relevant passage or diagram region when location data exists.
- Zooming, panning, and expanding the viewer.
- Showing document title, revision, page/section, and effective status.

Extracted text should complement access to the original.

For ambiguous matches, show match navigation or clearly state the limitation. Do not highlight an arbitrary first match as exact evidence.

When exact highlighting is unavailable, open the correct page and explain that the precise region is unavailable.

Preserve the document revision actually used by a recommendation or decision.

## Agent observability

Agent Activity should begin at a high level:
- Reviewing relevant procedures.
- Checking equipment context.
- Monitoring process values.
- Investigating conflicting reports.
- Updating an assessment.
- Waiting for or retrying a source.

Allow drill-down:

**Task → execution steps → individual source/tool operation → low-level logs**

Show timestamps, results, errors, retries, configuration version, and linked outputs where useful.

Expose execution evidence and concise rationale. Do not display private chain-of-thought.

Keep these details out of the default Situation dashboard.

## Equipment, drawings, and Knowledge

These concepts are connected:

- **Equipment:** the operational item and its current incident context.
- **Drawings:** references describing location, engineering connectivity, or system behaviour.
- **Knowledge:** the managed collection containing drawings, procedures, manuals, limits, and past-incident reports.

A drawing belongs in Knowledge and is linked to equipment. During an emergency, users should reach it directly from the equipment or alert.

P&IDs, area layouts, and dependency views represent different relationships. Do not present them as interchangeable.

## Emergency records and history

Each emergency must have a persistent record that accumulates:
- Initial notification.
- Relevant equipment and location.
- Reports and readings.
- Agent findings and assessment revisions.
- Recommendations with supporting evidence.
- Human decisions and rationale.
- Reported field actions.
- Observed outcomes.
- SITREP versions.
- Stabilization and closure information.
- Post-incident review and lessons learned.

Preserve what was known when a decision was made. Corrections should retain history.

Users should eventually be able to search and review historical emergencies.

Keep real incidents and training scenarios clearly distinguishable.

Past incidents can support learning and retrieval, but their actions must not automatically become the protocol for a new emergency.

## Meaning and colour consistency

Keep these independent:
- Operational severity.
- Evidence status.
- Source health.
- Read/unread state.
- Decision state.
- Execution state.

Examples:
- Verified does not mean safe.
- Connected does not mean equipment healthy.
- Pump stopped does not mean release stopped.
- Reported flame-out does not mean independently verified extinguishment.
- A decision to proceed does not mean an action was executed.
- Action completion does not prove the response achieved its intended outcome.

Use strong colours selectively and consistently. Read/unread and training mode should not compete with operational severity.

## Implementation expectations

Build this in **React** as an interactive prototype with simulated data.

The user needs to open and use it at full size in a dedicated preview/browser panel. The previous small embedded preview was insufficient. Provide a reliable full-size preview or runnable application.

Prioritize getting **Situation** right before redesigning everything else.

Use the actual drone scenario, detailed equipment cards, multiple addable watchers, a simple alert log, and a focused response/observation workspace.

The previous mockup used illustrative values and excerpts only. Treat them as disposable demonstration fixtures, not approved engineering information.

Exercise the interactions and inspect the rendered layout:
- Add equipment.
- Add/remove watchers.
- Filter alerts.
- Select an alert.
- Open response, observation, and source.
- Resize and swap windows.
- Maximize and restore.
- Advance scenario data.
- Keep timer and state consistent.
- Switch themes.

Success means the user can monitor the relevant equipment, immediately notice important changes, and inspect the suggested response and its evidence without encountering a wall of content.
