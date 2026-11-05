Continue the current ECC work in its existing design direction. Opus should coordinate and may use Fable for design and implementation.

These are additional requirements agreed since our last prompt. Incorporate them into the existing application without redesigning working areas unnecessarily.

## 1. Top-level navigation

Use these tabs:

**Situation | Sit. Rep | Agent Log | Knowledge**

Keep the navigation compact, polished, and visually consistent, with a clear active state.

The global Assistant is a separate header control.

## 2. Sit. Rep

Provide the complete chronological incident timeline, including:
- Initial notification.
- Observations and significant equipment changes.
- Agent findings and recommendations.
- Human decisions.
- Reported response and outcomes.
- Important information gaps.
- Stabilization and closure.

Allow search, filtering, and opening supporting evidence.

Provide two distinct downloads:
- **Incident Timeline Report:** the full chronological record.
- **SITREP:** a structured, point-in-time account of the situation, response, outstanding concerns, and priorities.

Both must derive from the same incident record. Display filters should not accidentally truncate exports.

Preserve report versions and as-of times. Maintain the existing review/approval workflow and protect user edits when refreshing drafts.

## 3. Agent Log

Provide a complete, human-readable account of what the agents did, including sources checked, documents consulted, findings produced, failures, retries, and assessment changes.

Start with understandable activity summaries and allow drill-down:

**Task → execution steps → source/tool operation → technical logs**

An authorized Admin should be able to inspect technical details such as run identifiers, timings, results, retries, errors, configuration versions, and linked outputs.

Keep technical details secondary for ordinary users. Simulated activity must be identified honestly. Do not expose credentials or private chain-of-thought.

## 4. Unified Knowledge

Use **Knowledge** as the home for both ingested reference material and incident history.

Within it, provide:
- **Search**
- **Documents**
- **Incidents**

Do not add separate top-level “Site Knowledge” or “Incident History” tabs.

Knowledge should support information from multiple sites, including:
- Equipment records and manuals.
- Policies, protocols, and emergency procedures.
- P&IDs, layouts, and other drawings.
- Detailed emergency records and their progression.
- Closure information and lessons learned where recorded.

Allow search, filtering, retrieval, and source inspection. Useful filters include site, equipment, content type, revision/status, and incident status/date.

Keep historical incident evidence distinguishable from current approved procedures.

## 5. Document ingestion

Allow documents to be brought into Knowledge with:
- Title.
- Site/facility.
- Equipment applicability.
- Document type.
- Revision.
- Approval/effective status where established.

Retain originals and extracted content with page/sheet references.

Distinguish storage, extraction, indexing readiness, approval, and use in an incident. Uploading a document does not establish that it is approved or applicable.

Provide honest processing states for scanned documents, unsupported formats, and failures.

Allow exact document revisions to be referenced in an incident. Preserve those references when newer revisions arrive.

Structure retrieval so a production search/vector backend can be connected later. The prototype may use local indexing or simulated retrieval; clearly describe what is actually implemented.

## 6. Persistent, self-contained emergency records

As the system is used, it must accumulate a history of emergencies.

Each incident should preserve:
- Identity, site, initial notification, and start time.
- Equipment and relevant measurements.
- Reports and observations.
- Agent findings and revisions.
- Recommendations and their supporting evidence.
- Human decisions, rationale, authors, and timestamps.
- Reported actions and observed outcomes.
- Referenced document revisions.
- Agent activity.
- Timeline and SITREP versions.
- Stabilization and closure information.

Preserve what was known when decisions were made. Corrections must retain history.

Snapshots are versions of the same incident, not separate emergencies.

Within Knowledge → Incidents, support browsing, filtering, detailed review, and structured export for future analysis.

Closure must be explicitly recorded by a human with a rationale and timestamp. Preserve outstanding issues; closing a record must not automatically mark equipment safe.

Records should survive reloads. If prototype persistence is browser-local, state that clearly.

## 7. Global Assistant on the right

**The Assistant must not be a subsection of Knowledge.**

It should open from the header as a right-hand conversation panel from any tab.

Opening it must preserve the current page, selections, filters, and workspace layout.

Provide:
- Prompt entry and conversation history.
- Conversation retained when closed and reopened.
- Site/content scope controls.
- Search across documents and incident records.
- Cited evidence with original-source access.
- Clear no-evidence and retrieval-error states.

The active incident context and the selected knowledge-search scope should be explicit.

Opening a citation should preserve the conversation and current task.

Avoid squeezing the existing workspace into several unreadable columns. Keep important emergency alerts discoverable while the Assistant is open.

If using deterministic retrieval, present retrieved evidence honestly rather than implying a connected LLM or fabricated operational answer.

## 8. Keep the implementation focused

Follow the current design direction. Reuse existing viewers, citation components, incident state, and interactions.

Verify the new navigation, report exports, log drill-down, ingestion, persistence, incident closure, and Assistant behaviour.

Keep the experience minimal and professional. Expose depth on demand rather than adding more permanent content to Situation.
