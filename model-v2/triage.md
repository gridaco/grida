# Triage — 32 gut answers and what they decide

Owner-answered 2026-07-07. Questions were model-blind by design; the
scoring key (which axis each answer pulls) was hidden until all rounds
closed. Verbatim answers condensed; owner's own words quoted where they
carried more than the options offered.

## The answers

| #   | question (short)                         | gut answer                                                                                                                                                                              | pulls                                                                                                                             |
| --- | ---------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 1   | canvas vs web disagree — who's wrong?    | **the web is wrong**                                                                                                                                                                    | canvas-truth → intent model; finale question, side 1                                                                              |
| 2   | file is a program / picture / recording  | **a program**                                                                                                                                                                           | intent-canonical                                                                                                                  |
| 3   | rotated card in a list — make room?      | **punted, deliberately** — "I will not force-engineer my gut"; constraint given instead: Figma designs must convert in (tree surgery fine); model must be genuinely agnostic-good       | fork stays open; Figma-_convertibility_ required, Figma-_identity_ not                                                            |
| 4   | primary author                           | humans #1 in priority; **agents do most of the work** in reality                                                                                                                        | both surfaces; agent IR elevated                                                                                                  |
| 5   | proven standard vs ideal                 | **challenge the ideal empirically** — measure, not paper                                                                                                                                | decision-by-prototype posture                                                                                                     |
| 6   | weight of web-proven-ness                | strong, with caveat — _"we already built an html/css render engine; the whole reason building the node taxonomy and new system is to introduce a 'future', new standard, editor-first"_ | finale question, side 2 — the adopt-path already exists **elsewhere in the product**; the new model exists to be the new standard |
| 7   | 2030 legacy                              | **"instantly familiar"**                                                                                                                                                                | new semantics must wear familiar vocabulary                                                                                       |
| 8   | unrepresentable rare wishes OK?          | **yes — refusal is a feature**                                                                                                                                                          | strict state model                                                                                                                |
| 9   | raw-file human readability               | **barely**                                                                                                                                                                              | H1 (human door) demoted                                                                                                           |
| 10  | stored-as-said vs stored-as-seen         | **stored as you said**                                                                                                                                                                  | intent-canonical                                                                                                                  |
| 11  | file remembers inactive values?          | **no — file is truth only**                                                                                                                                                             | switch-memory = editor session, never serialized                                                                                  |
| 12  | human-typed numbers verbatim in file?    | derived is fine                                                                                                                                                                         | binary canonical OK; text form is a projection                                                                                    |
| 13  | ineffective write → reject/store/convert | no preference                                                                                                                                                                           | open (resolved via #18, see synthesis)                                                                                            |
| 14  | native vs wasm                           | **tolerance-equal**                                                                                                                                                                     | N-3 policy set                                                                                                                    |
| 15  | semantics in types vs rulebook           | "something else" (unspecified)                                                                                                                                                          | open                                                                                                                              |
| 16  | conformance oracle                       | **external where exists**                                                                                                                                                               | matches conformance.md doctrine                                                                                                   |
| 17  | LLM predicts geometry without engine     | **critical**                                                                                                                                                                            | mental simulability = design input                                                                                                |
| 18  | agent writes: can-fail vs never-fail     | **all writes legal**                                                                                                                                                                    | lenient write path (see synthesis — key tension with #8)                                                                          |
| 19  | LLM training-data prior worth            | some — tiebreaker                                                                                                                                                                       | familiar vocabulary again                                                                                                         |
| 20  | agent API surface                        | **text-file based, even if a different IR** — the agent should be "tricked" it's writing a file/code                                                                                    | an agent-facing textual IR is a first-class product surface                                                                       |
| 21  | concurrent move∥rotate both survive      | doesn't matter much ("even Figma fails") — but engineer-gut: **almost must**                                                                                                            | fine-grained merge kept; cheap under scalars                                                                                      |
| 22  | cross-node write cascades                | **few sanctioned cases**                                                                                                                                                                | editor.md doctrine 3 confirmed                                                                                                    |
| 23  | growth axis: kinds vs properties         | **new properties**                                                                                                                                                                      | small stable kind set + additive property evolution                                                                               |
| 24  | pre-lock breaking changes                | fine until lock                                                                                                                                                                         | migration freedom now                                                                                                             |
| 25  | 3D                                       | someday-maybe                                                                                                                                                                           | don't preclude, don't spend (reserved vocabulary suffices)                                                                        |
| 26  | skew/matrices                            | torn: "first-class, as it will be svg-import heavy (**model should be almost always 100% SVG compatible**) — but honestly? degrade acceptable"                                          | SVG-import ~100% is the hard requirement; the carrying mechanism is open, degradation tolerable                                   |
| 27  | animating layout itself                  | **core scenario**                                                                                                                                                                       | layout-coupled motion is headline; re-resolution must be cheap                                                                    |
| 28  | exotic layouts (radial, masonry…)        | never core — "but I would LOVE to see what lands if I picked 'core must anticipate'"                                                                                                    | parked; one exploratory sketch owed                                                                                               |
| 29  | timeline                                 | **~a year — once, right**                                                                                                                                                               | deliberate build funded                                                                                                           |
| 30  | third-party consumers                    | unlikely — we own all                                                                                                                                                                   | external conformance simplicity deprioritized (last `bake` residue gone)                                                          |
| 31  | normative spec appetite                  | **yes — sign me up**                                                                                                                                                                    | invention path fully resourced                                                                                                    |
| 32  | existing docs/TS model                   | **free to break**                                                                                                                                                                       | X-SELF breaks are free; no migration constraint                                                                                   |

## Verdict

**The finale is decided: `anchor`.** The deciding question was answered from
both sides without ever naming a model:

- #1: when canvas and web disagree, _the web is wrong_ — the canvas is the
  truth, web output is a projection.
- #6: the adopt-CSS path _already exists in the product_ (the `htmlcss`
  engine); the entire reason for a new node taxonomy is to introduce a new,
  editor-first standard. Adopting CSS as the model would build what we
  already have.

Reinforced by #2 (a program), #10 (stored as you said), #8 (refusal is a
feature), #31 + #29 (spec discipline and a deliberate year — the invention
path is resourced), #30 + #32 (no external-consumer or migration drag).

## Amendments — the triage didn't just pick, it reshaped

The winning model absorbs five owner-forced amendments:

1. **No file-carried switch-memory** (#11). Flattening (b)'s retained
   inactive values do **not** serialize; toggle-back restoration is editor
   session state. The file holds only current truth. (M-3 re-scoped;
   dormancy eliminated from the format entirely.)
2. **Strict states, lenient writes** (#8 + #18 — the apparent
   contradiction, reconciled). Strictness lives in the _state model_:
   invalid documents are unrepresentable. Leniency lives in the _write
   layer_: agent/editor writes never hard-wall — they coerce or redirect to
   the nearest meaningful intent, always reported, never silent
   (editor.md law 4, extended from gestures to the API). H12 amendment:
   "guaranteed-or-typed-rejection" → "effective-or-coerced-with-report" at
   the op layer, over an unchanged strict document.
3. **The agent text IR is a first-class surface** (#20 + #17 + #9). Human
   raw-readability barely matters, but an LLM must be able to _write a
   file_ and _predict its geometry mentally_. The XML-ish projection stops
   being documentation sugar and becomes a product deliverable: a textual
   IR that round-trips with the binary format, tuned for model priors
   (#19: familiar names) and mental simulation (#17: closed-form,
   locally-decidable resolution — no arbitration combinatorics). H1
   re-scoped: legibility's audience is agents.
4. **Familiar vocabulary over novel vocabulary** (#7 + #19). New semantics,
   old words: `x`, `width`, `rotation`, `flex`, `gap`, `padding` wherever
   the semantics genuinely coincide. Invent meanings only where the point
   _is_ the correction; never invent a term where a familiar one is honest.
5. **SVG-import ≈100% is a hard requirement** (#26); the exotic-transform
   carrying mechanism stays open (quarantine default, declared degradation
   acceptable as fallback — the owner is genuinely torn and the corpus
   will decide, per #5's measure-don't-argue posture).

## The one open fork, now with named criteria

Rotation-in-flow (#3, punted honestly) is decided later **by prototype and
measurement** (#5), not by argument. The triage tilts it, though:

- **toward AABB-participates**: #27 — "a card _turns_ and the list
  reflows" was accepted as a core scenario, which is only expressible if
  rotation is layout-visible; #1 — canvas-truth dislikes overlap-lies.
- **against**: #17 — visual-only rotation is the simpler mental model for
  an agent (though `|w·cosθ|+|h·sinθ|` is well within LLM arithmetic).

Recorded tilt: layout-visible, pending the measured prototype. It remains
`POL`-shaped in conformance (R-3/OP-ROT-2) until then.

## Also opened / parked

- #13/#15 unresolved by gut — resolved structurally by amendment 2 (writes)
  and the existing types-core/rules-edge practice; revisit only if they
  chafe.
- #28's curiosity: one exploratory sketch of a pluggable-layout core is
  owed, explicitly non-binding, to see "what lands."
- #21's engineer-gut keeps fine-grained merge a design property — it costs
  nothing under scalar intent fields.
