Continue refining the existing ECC prototype. Keep the current design direction and working functionality. Opus should coordinate and may use Fable for these UI refinements.

Implement these five changes:

1. Consistent draggable panel dividers

Use the same resizing behavior already established on the Situation page wherever the application has adjacent, resizable panels.
- Support horizontal and vertical dividers as appropriate.
- Provide a subtle visible handle, the correct resize cursor and a clear hover state.
- Enforce minimum panel dimensions so content remains usable.
- Preserve the user’s chosen panel sizes when switching tabs and reopening panels.
- Opening the Assistant must respect these layout rules and avoid squeezing the workspace into unreadable columns.
- Keep the existing Situation resizing behavior working.
2. Correct the header control order

Arrange the right-hand header controls in this order:

Elapsed emergency timer → Dark/light toggle → Assistant → User profile

The user profile must occupy the extreme right. Keep the emergency timer prominent and immediately understandable in hours and minutes. Ensure the controls remain aligned and usable at narrower desktop widths.

3. Give the Assistant button a stronger visual identity

The current button looks dull. Make it polished, recognizable and clearly interactive.
- Use a distinctive Assistant icon with a readable “Assistant” label.
- Use the ECC accent palette with restrained emphasis and clear hover, focus and active states.
- Visually indicate when its panel is open.
- Keep emergency severity colors reserved for operational alerts.
- Avoid distracting animations, excessive glow or a button that competes with critical alerts.
- Preserve its existing behavior: opening the global conversation panel on the right without navigating away.
4. Use the attached Upstream ECC AI Agent branding

Use the attached logo/icon in the application header, replacing the current placeholder branding.
- Preserve the supplied concept, proportions and green–cyan–blue identity.
- Make it crisp and legible at actual header size.
- Avoid stretching, clipping or excessive empty space around the asset.
- Ensure it works on both dark and light themes; use a suitable background treatment or faithful variant where necessary.
- Use the supplied symbol for compact branding and the favicon where suitable.
- Do not substitute an unrelated generic AI icon.
5. Add practical Alert Log filters

Add a compact filter toolbar directly above the Situation page’s Alert Log.

Support:
- Severity: All, Critical, High, Medium, Low.
- Equipment: All monitored equipment or selected equipment.
- Status: using the alert states already supported by the application.
- Search: alert text and equipment tag.
Requirements:
- Combine filters and show the matching count.
- Provide an obvious “Clear filters” control when filters are active.
- Clicking an equipment card’s alert badge should filter the log to that equipment and visibly show the selection.
- Filtering affects the displayed log only; monitoring and agent processing continue.
- If active filters hide critical alerts elsewhere, show a compact, clickable indication so they remain discoverable.
- Keep incoming matching alerts visible through the existing update behavior without stealing focus or resetting filters.
- Show a helpful empty state when nothing matches.
- Preserve alert grouping and drilldown into evidence, readings and recommendations.
Keep this toolbar compact. Do not introduce another permanent panel.

Validation and completion

Check these changes in both themes at 1440 × 900 and 1366 × 768. Verify resizing, header alignment, Assistant opening, logo rendering and combined alert filters. Preserve existing incident records and functionality.

Finish with a concise summary of what changed, what you actually verified and any remaining limitations. Do not expand the scope or redesign unrelated screens.

Supplied logo: brand-source/upstream-ecc-ai-agent-supplied.png (copy of the user's Picture1.png).
