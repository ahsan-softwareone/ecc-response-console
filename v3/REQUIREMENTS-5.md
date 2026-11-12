# Round 6: human-initiated investigation

Summary of the request. See README, "Round 6 changes", for what was built.

- Extend the global Assistant with Ask a question and Report an observation; add Ask / Report on Situation and Ask about this on equipment and alerts.
- Show incident, attached context and site and knowledge scope. Do not broaden to other sites silently.
- A question starts a recorded investigation: interpret, check observations and readings, retrieve applicable revisions, identify supporting, conflicting and missing evidence, then answer with citations. Recommend only where the evidence supports it.
- Observations are reported evidence: original wording, attribution, source, observed and received times, audited amendments. They never change equipment truth, clear an alarm or mark an action executed.
- With no incident, questions may search Knowledge; an observation needs a chosen incident. Closed records stay read-only here.
- Show short progress labels and concise responses with expandable detail; citations use the shared viewer at the cited revision and page.
- Persist with author, context, scope, evidence, run and config. Sit. Rep gets concise entries, Agent Log gets a task, and revised assessments keep the earlier one.
- Paused or stopped agent: save, show pending, offer explicit Resume or Start. On save failure keep the input and offer retry.
- No paid APIs or production integrations. A bounded deterministic demonstration, labelled simulated, with no future scenario knowledge.
