# E2 — anchor.fbs draft + codec round-trip

**Question.** Can the anchor header — per-axis `AxisBinding` unions,
`SizeIntent` unions, nullable min/max boxes, payload union — encode under
the grida.fbs header rules (H9: tables-over-structs, additive evolution;
H11: unset is structural, never a scalar sentinel), and does the codec
round-trip?

**Method.** [`anchor.fbs`](./anchor.fbs) is the standalone schema draft of
models/a.md §9 (geometry header full-fidelity; identity/paint stubbed).
[`quartet.json`](./quartet.json) encodes the a.md §7 worked examples plus
sentinel-freedom witnesses (`SizeAuto` vs absent, `max_lines` box,
aspect-ratio table, lens op vector). No generated code needed —
`flatc` (25.12.19) itself is the codec: JSON → binary → JSON → binary.
Reproduce with [`run.sh`](./run.sh).

**Results (2026-07-07).** All pass:

- **schema compiles** (`flatc --binary --schema`), v1 and v2.
- **S-1 fixpoint**: encode → decode → re-encode is **byte-identical**.
- **S-2**: f32 values (15.0, 0.25, 3.5, 16:9) exact through the trip.
- **H11 witnessed in the decoded JSON**: a node with no `x`/`y` keys
  (⇒ `Pin{Start,0}` by rule) is structurally distinct from an explicit
  `Span{0,0}`; `height_type: SizeAuto` (present, empty) is distinct from
  absent height (⇒ kind default); absent `max_lines` box ⇒ unlimited —
  the `max_lines: 0 ≡ unset` class of hack is unrepresentable.
- **M-4 forward**: v1 binary decodes under a v2 schema (new nullable
  header field + new payload arm) — new fields read as absent.
- **M-4 backward**: v2 binary decodes under the v1 schema — unknown
  fields skipped safely (vtables).

**Findings** (into the phase-3 spec):

1. **RMW-preservation is a policy, not a freebie.** FlatBuffers _reads_
   unknown fields safely, but a decode→re-encode through an old schema
   **drops** them (verified: `corner_radius` vanishes from the v1
   projection). M-4's "preserves unknown content through
   read-modify-write" needs an explicit mechanism: retain the original
   buffer and patch, or version-gate writers to the newest schema.
   Phase-3 must lock one.
2. **Scalar-default elision is aggressive and fine — but choose defaults
   as semantics.** `parent.id: 0` and `root: 0` elide (default-valued);
   absence-of-table vs present-table-with-defaults carries the real
   distinction. Rule of thumb confirmed: _state lives in table presence;
   scalar defaults must equal the semantic default_ — exactly how the
   schema is drafted.
3. Union-vector lens ops (`[LensOpSlot]` wrapping `LensOpU`) round-trip
   cleanly — the "each op parameter is an animation channel" encoding
   works without codegen tricks.

Verdict: **encodable, round-trips, evolves additively — pass**, with
finding 1 as the one genuine open policy for phase 3.
