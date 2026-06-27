# Prompt Engineering

## Approach
The AI call uses two parts:
- **System prompt** (`backend/prompt.js`, `SYSTEM_PROMPT`) — sets the AI's role as a
  Dangerous Goods compliance advisor for road freight in India, fixes the output as
  **strict JSON** with named fields, and includes rules (e.g. never invent a UN number,
  flag road-transport feasibility).
- **User prompt** (`buildUserPrompt`) — injects the shipment's specific values
  (goods name, type, UN number, quantity, packaging, route, etc.).

Forcing strict JSON makes the response **parseable** so the frontend can render clean
sections (classification, packaging, labelling, documentation, handling, warnings).

## Output contract (fields the AI must return)
`isDangerous`, `classification {unNumber, hazardClass, packingGroup}`, `regulations[]`,
`packaging[]`, `labelling[]`, `documentation[]`, `handling[]`, `warnings[]`,
`transportFeasibility {feasible, note}`.

## Auto-detect prompt
A separate, smaller prompt (`DETECT_SYSTEM`) classifies a product name into one category
**and** returns its UN number — but only a UN number it is confident is correct and
specific; otherwise it returns an empty string for manual entry, or `"N/A"` for
non-hazardous goods.

## Versioning
The current prompt version is stored in `PROMPT_VERSION` and saved with every generation,
so analytics/history can tell which prompt produced each result.

## Prompt evolution (to be completed by the team)
The day-wise plan asks for prompts v1 → v4 with quality scores. Record each version, the
test inputs, the 1–5 quality scores, and what each revision fixed, here or in a tracker.
