---
name: security
description: >
  How to handle `GRIDA-SEC-<id>` security boundaries in the Grida repo.
  Triggers when you encounter a `GRIDA-SEC` tag in source/docs, when
  modifying files under any tagged path, or when adding a new prevented-
  vulnerability record. Each `GRIDA-SEC-<id>` identifies a structural
  trust boundary documented in `/SECURITY.md`. This skill explains the
  contract, mandates a security review before committing changes to any
  tagged file, and shows how to register a new id. Use whenever
  "GRIDA-SEC" appears in context.
---

# Security boundaries — `GRIDA-SEC`

## What `GRIDA-SEC-<id>` means

Each `GRIDA-SEC-<id>` is a **prevented vulnerability** — a class of
attack that would exist by default but the codebase structurally
forecloses. Unlike a CVE (which describes something that _was_ broken),
a GRIDA-SEC id is a contract: **this specific class of attack is
impossible because of these specific files, and we keep it that way.**

`/SECURITY.md` is the canonical registry. Every id has a section there
with:

- **What it protects** — the boundary in plain English.
- **Vulnerable scenario** — the attack that would exist without the
  boundary.
- **How the code prevents it** — the enforcement mechanism, file by file.
- **Files bound by this id** — the exact files whose contents make up
  the contract.

## Working with tagged code

When you see `GRIDA-SEC-<id>` in a file you're touching:

1. **Read the entry in `/SECURITY.md` for that id.** Don't act on the
   tag alone — the rules are spelled out there.
2. **Run `grep -rn GRIDA-SEC-<id> .`** to find every other file in the
   contract. Changes that look local often aren't — a tagged file is
   load-bearing for the boundary.
3. **Don't remove a tag** without removing the entry from `/SECURITY.md`
   in the same change, with a written justification.

## Mandatory security review before commit

If your change touches any file containing a `GRIDA-SEC-<id>` tag, you
**must** complete a security review before committing. The review is
brief but explicit:

1. **Re-read the entry in `/SECURITY.md`** for every `GRIDA-SEC-<id>`
   that appears in your diff. Confirm the prevented scenario is still
   prevented after your change.
2. **Walk the enforcement mechanism**. For each numbered "How the code
   prevents it" step in the entry, point at the line in your diff (or
   confirm it's untouched) that satisfies that step.
3. **Verify all tagged files are still tagged.** A rename, refactor,
   or move that drops the tag is a contract violation, even if behavior
   looks identical.
4. **If you added or removed a file from the boundary**, update the
   "Files bound by this id" list in `/SECURITY.md` in the same commit.
5. **Run any tests adjacent to the boundary.** The SECURITY.md entry
   for the id may list specific tests; use `grep -rn GRIDA-SEC-<id>
--include='*test*' --include='*spec*'` to find any others.

If you cannot satisfy steps 1–4, do not commit. Either revert the
change, or explicitly amend the SECURITY.md entry to reflect a
deliberate update of the contract — and surface that to the user.

## Adding a new `GRIDA-SEC` id

When you introduce a new structural prevention worth tracking:

1. **Allocate the next sequential id.** Look at `/SECURITY.md`, find the
   highest existing `GRIDA-SEC-NNN`, use `NNN+1`. Don't reuse retired
   ids; don't renumber.
2. **Write the entry in `/SECURITY.md`** under "Active boundaries". Use
   the same four-section shape as existing ids: What it protects /
   Vulnerable scenario / How the code prevents it / Files bound.
3. **Tag every relevant file.** Header comment in source files, callout
   block in READMEs, comment in scripts. Use the literal string
   `GRIDA-SEC-NNN`. Brief inline tags at specific code locations are
   fine too (e.g. `// GRIDA-SEC-NNN: rule 2 — fail closed`).
4. **Verify the grep works.** `grep -rn GRIDA-SEC-NNN .` should return
   the entry in `/SECURITY.md` plus every tagged file.

This skill auto-loads on any "GRIDA-SEC" mention via its description.
You don't need to register a new id with the skill.

## When NOT to use this convention

- **Implementation bugs that were once exploitable.** Those are CVE
  territory. GRIDA-SEC is for **prevented-by-structure** classes — if a
  bug happened, write a postmortem, not a GRIDA-SEC.
- **Generic best practices** (input validation, authn/authz on user
  routes, etc.). Those are baseline and don't need an id. Reserve
  GRIDA-SEC for specific structural decisions where misunderstanding
  the design would re-open a class of attack.
- **Per-feature security notes** that aren't structural contracts.
  Those go in the feature's own docs.

A good test: if you can reasonably write "this attack class is
impossible because…" in one paragraph and grep returns ≥2 files that
together make it true, it's a candidate for GRIDA-SEC.
