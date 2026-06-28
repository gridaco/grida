---
title: Grida Library (library)
tags:
  - internal
  - wg
  - library
  - ai
  - platform
format: md
---

# Grida Library — `library`

> A curated corpus of openly-licensed visual assets, and the model by which
> assets are represented, related, and retrieved.

| feature id | status   | description                                                                      |
| ---------- | -------- | -------------------------------------------------------------------------------- |
| `library`  | evolving | The Grida Library corpus and its retrieval model (similarity & semantic search). |

This is an evolving RFC. It states what the Library **is** and **why** it is
shaped that way, in domain terms — not how any one implementation realizes it.
It is the canonical entry point for understanding the Library; it is not a plan
and not a record of changes.

**Non-goals.** A general-purpose asset DAM, user-uploaded private libraries,
rights management beyond licensing metadata, or a recommendation feed. The
Library is a _public, curated, openly-licensed_ corpus optimized for **finding
a visual asset to use**.

---

## 1. What the Library is

The Grida Library is a corpus of **visual assets** — photographs,
illustrations, icons, logos, shapes, wallpapers — each openly licensed (public
domain / CC0 by default) so it can be dropped directly into a design.

Each asset carries descriptive metadata: a title and optional human-readable
description, a primary category and finer-grained tags, authorship and
licensing, and derived visual attributes (dominant colors, orientation,
transparency). Assets may be gathered into named **collections**.

The corpus exists to be _searched and browsed_. Its value is not the storage of
images but the ability to **surface the right asset** for a need expressed
either visually ("something like this one") or in words ("a calm abstract
background").

## 2. Vocabulary

- **Asset** — a single licensed visual object in the corpus, with its image and
  its metadata.
- **Description** — a meaningful, prose account of what an asset depicts and
  evokes. Distinct from the title or tags; it may be authored or **generated**
  (see §6).
- **Representation** — a learned, fixed-dimensional vector placing an asset in a
  shared semantic space so that proximity approximates relatedness. An asset has
  a **visual representation** and may have a **textual representation**.
- **Similarity** — retrieval whose query is an _existing asset_: "find assets
  related to this one."
- **Search** — retrieval whose query is _free text_: "find assets matching this
  description."
- **Modality** — the kind of a representation or query: visual or textual.

## 3. The retrieval model

Retrieval is the heart of the Library, and it rests on one principle.

### 3.1 The modality-matching principle

Visual and textual representations, even when trained into a single shared
space, do not occupy the same region of it — there is a measurable **modality
gap** between them. Matching a query to a representation of the _same modality_
is reliably stronger than matching across modalities. Cross-modal matching
(text query against a visual representation) is a real and valuable capability,
but a weaker one: it should be used where it is the _only_ option, not as a
substitute for same-modality matching.

Two consequences follow, and they shape the entire design:

1. **Representations are kept per-modality and never fused.** An asset's visual
   and textual representations are separate vectors. A single fused vector would
   sit between the modality regions and serve _both_ query kinds worse than a
   matched representation serves _one_.
2. **Each retrieval mode matches its query's modality.** Similarity (asset
   query) matches against visual representations; search (text query) matches,
   wherever possible, against textual representations.

### 3.2 Similarity — visual ↔ visual

The query is an existing asset; the result is other assets that **look**
related. This is matched same-modality: the query asset's visual representation
is compared against the visual representations of the corpus, ranked by
proximity. Every asset has a visual representation, so similarity covers the
entire corpus.

### 3.3 Search — text ↔ text, with a visual floor

The query is free text. A library of visual assets receives two intents that
look identical as strings but resolve differently:

- **Appearance** — "blue gradient", "watercolor texture". The answer is in the
  pixels.
- **Concept / intent** — "calming", "suitable for a fintech landing page", a
  named subject. The answer is in _meaning_ that the pixels may not literally
  carry.

The strongest, most general answer to both is to match the text query against an
asset's **textual representation** — provided that representation exists and is
meaningful. A meaningful description verbalizes both what an asset depicts _and_
what it evokes, so a same-modality text-to-text match captures appearance and
concept together, without crossing the modality gap.

Because the textual representation is **optional** (§4), search must degrade
gracefully:

- Assets with a textual representation are matched same-modality against the
  query — the primary, highest-quality path.
- Assets without one remain reachable through **cross-modal** matching of the
  text query against their visual representation — a coverage floor, not the
  primary mechanism.

These two paths must be kept **distinct**, not blended into a single score:
same-modality and cross-modal proximities are drawn from different
distributions, and averaging them is a calibration error that degrades both.
Where both are surfaced, they are composed as ordered tiers (matched results
first, cross-modal coverage after), or selected explicitly — never summed.

### 3.4 Invariants

- **Every asset has a visual representation.** It is the floor for both
  similarity and search.
- **The textual representation is optional.** An asset may exist with image
  only; nothing in retrieval may assume its presence.
- **Representations within a comparison share one space and one metric.** A
  query and the representations it is ranked against must be produced by the
  same model and compared under the same proximity measure; mixing spaces or
  mixing a proximity measure with an index built for a different one yields
  silently wrong rankings.

## 4. Why the textual representation is optional

Not every asset is described. Description is an enrichment, applied over time
and unevenly across the corpus; ingestion of a new asset must never block on it.
Treating the textual representation as mandatory would either stall ingestion or
fabricate empty descriptions that pollute search. So the model admits assets
that carry image only, and search is defined to remain correct — merely less
precise for those assets — until a description arrives.

## 5. Use cases

The same retrieval surface serves two consumers with different query shapes:

- **Human gallery browsing.** Short, often one- or two-word queries; rapid
  visual scanning of results; exploration over exact lookup. Tolerant of fuzzy,
  semantically-ranked results — indeed it benefits from them.
- **Agentic reference discovery (RAG).** An assistant exploring ideas and
  proposing references issues longer, descriptive, sometimes abstract queries.
  Rich descriptive queries are the strongest case for same-modality text
  matching, and the most demanding of conceptual recall.

A single search contract serving both is a deliberate design goal: the agent and
the gallery query the same corpus by the same model, differing only in the text
they submit.

## 6. Description as verbalization

A description is what makes the strong (same-modality) search path possible for
an asset, so the corpus is enriched by a **verbalization** process: examining an
asset and producing a faithful, evocative account of it. Verbalization is the
bridge across the modality gap — it converts visual content into text that a
text query can match directly, and it can express concept and intent that a
purely visual representation does not encode.

Verbalization is asynchronous and best-effort by design (§4). Its output feeds
the textual representation; until it runs for a given asset, that asset is
served by the visual floor alone.

## 7. Design alternatives considered

- **One fused image-and-text representation per asset.** Rejected: it serves
  every query modality through a representation matched to none, and it couples
  ingestion to description. Separate per-modality representations dominate it on
  both retrieval modes (§3.1).
- **Text-only representation (verbalize everything, never embed pixels).**
  Rejected as the sole model: similarity is inherently visual, and a description
  is a lossy summary that discards fine visual detail. A visual representation
  is irreducible.
- **Lexical keyword search over metadata.** Rejected as the model for search:
  exact-term matching cannot capture appearance, synonymy, or intent, which is
  precisely what a visual-asset search must do. Search in the Library is
  **always semantic**; it trades guaranteed exact-keyword ordering (acceptable
  for a discovery surface) for meaning-based recall.

## 8. Open questions

As an evolving RFC, the following are deliberately unsettled:

- **Composing the two search paths.** When both described and undescribed assets
  are eligible, what tiering or selection policy best balances precision against
  coverage — and should the cross-modal floor be exposed at all for some
  surfaces?
- **Conceptual recall.** How well same-modality text matching serves abstract,
  intent-bearing queries depends on description quality and corpus composition;
  the threshold at which verbalization quality becomes the limiting factor is
  not yet established.
- **Representation evolution.** The corpus must tolerate the representation model
  changing over time. The general shape — represent under a new model alongside
  the old, then switch retrieval once coverage is complete — is understood; the
  invariants that make such a transition seamless for live retrieval deserve
  their own treatment.
