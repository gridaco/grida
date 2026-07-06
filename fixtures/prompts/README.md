# `fixtures/prompts`

Human-authored **prompt corpora** for exercising the Grida agent by hand and
for regenerating demo output. These are inputs to _people_ and dev scripts, not
(yet) to an automated test harness — no code reads them today, so treat them as
a curated bank of realistic user asks, kept in lock-step with the surfaces they
target.

## Files

| File                          | Surface                                                          | Shape                               |
| ----------------------------- | ---------------------------------------------------------------- | ----------------------------------- |
| `canvas-user-prompts.txt`     | Canvas / general editor                                          | flat `.txt`, one prompt per line    |
| `artwork-station-prompts.txt` | Reference-first artwork home (`design_search` → pick → generate) | flat `.txt`, one prompt per line    |
| `slides-prompts.txt`          | Desktop home `slides` preset → dotcanvas deck                    | flat `.txt`, one prompt per line    |
| `slides-scenarios.jsonl`      | Same slides path, as an **eval set**                             | JSONL, one structured case per line |

### Flat `.txt` convention

One prompt per line. Lines starting with `//` are section headers / comments and
should be skipped by any consumer. Prompts are written to be **self-sufficient**
— they name a concrete subject (and often a style/constraint) so the agent can
act without a clarifying ping-pong.

### `*-scenarios.jsonl` eval-set schema

One JSON object per line. This is the structured counterpart to the flat prompts
— it pairs a prompt with the outcome a good run should produce, so a future
harness (or a human) can score the slides path, not just fire prompts at it.

| Field     | Type     | Meaning                                                                                                                           |
| --------- | -------- | --------------------------------------------------------------------------------------------------------------------------------- |
| `id`      | string   | Stable, kebab-case case id.                                                                                                       |
| `persona` | string   | Who is asking — the user context.                                                                                                 |
| `goal`    | string   | What a successful result gives them.                                                                                              |
| `prompt`  | string   | The verbatim user message.                                                                                                        |
| `preset`  | string   | The home `application_preset` this rides (e.g. `slides`).                                                                         |
| `expect`  | object   | `editor` (target editor), `slides` (count as `{min,max}` or `{delta}` for edits), and `behaviors[]` (what the agent should _do_). |
| `rubric`  | string[] | Pass criteria — what to check in the produced deck.                                                                               |
| `fail`    | string[] | Known failure signals that should count as a miss.                                                                                |

`slides.delta` (`"+1"`, `"+2"`, `"0"`) is used for **edit** scenarios that mutate
an already-open deck, where an absolute count doesn't apply.

## Keeping these current

When the slides path (preset → handoff seed → deck authoring → slides editor)
changes in a way that alters expected behavior, update `slides-scenarios.jsonl`
alongside it — the eval set is a spec of the path, not a snapshot to leave stale.
