---
name: etiology
description: >
  Bug-fix discipline — every defect has an etiology, the chain of
  cause that produced the observable fault; trace it before
  patching. Errors only grow: a bandaid leaks unless genuinely
  localized and leak-free. Walk the diagnostic ladder (presentation
  → proximate cause → API contract → isolated or systemic) before
  writing the fix. Use when authoring or reviewing any bug fix,
  regression patch, "quick fix" PR, or when deciding whether to
  ship, defer, or refactor.
---

# etiology

The temptation in a bug fix is to suppress the symptom. The
discipline is to know which fix you wrote: the one that addressed
the cause, or the one that masked it. Every bug has an
**etiology** — the chain of cause that produced the observable
fault — and a fix is only honest once that chain has been traced.

**Errors only grow.** A bandaid leaks into adjacent call sites,
and the next reader inherits both the original defect and the
workaround that obscures it. Be fixated on the etiology; the
symptom is what alerted you to the bug, not the bug itself. A
bandaid is occasionally correct, but it is never the default.

## The diagnostic ladder

Before writing the fix, walk the ladder. Each rung is a question
the next rung depends on; skipping a rung produces a fix that
doesn't know what it is.

1. **Presentation.** What is the user-observable fault? State the
   symptom precisely — not the suspected cause, the symptom.
2. **Proximate cause.** Which specific code is wrong, and is the
   defect at the line you would patch, or upstream of it? The
   line that _fires_ the error is rarely the line that _contains_
   it.
3. **API contract.** Was the abstraction we relied on
   _misleading_ — i.e., would another developer following normal
   patterns re-trigger the same bug at a different call site? If
   yes, the defect is in the interface, not the caller.
4. **Isolated or systemic.** Is this a self-contained oversight,
   or one presentation of a broader pathology in the surrounding
   code? If broader, scope the fix to the broader cause; patching
   one of N produces N − 1 future bug reports.

Stating in the PR description which rung you stopped at — and
why — keeps the review honest.

## Coverage cuts both ways

- **Should-have-been covered.** The defect slipped a test that
  ought to exist. The fix carries that test — coverage earned by
  a regression is the cheapest coverage you will ever buy.
- **Impossible to cover.** Interactive timing, render-order
  asymmetries, benchmark-only drift, layered composition where
  the execution order _is_ the behavior — defects of this kind
  have **no defense once shipped**. That raises the bar on the
  fix, not lowers it. Prefer the underlying refactor; if you must
  ship a surgical patch, document the constraint at the call site
  so the next reader sees both the symptom and the rule that
  keeps it from recurring.

The wrong inference is "we cannot test it, so any fix will do."
The correct inference is the opposite: untestable surfaces
warrant more skepticism, not less.

## When a bandaid is acceptable

Two conditions, both required:

- **Localized.** One call site; no change to a contract anything
  else relies on.
- **Leak-free.** Another developer following normal patterns
  elsewhere in the codebase cannot accidentally undo the fix or
  re-trigger the bug. A fix that depends on tribal knowledge —
  "don't do X near this code" — has already leaked by the time
  it ships.

Failing either, extract the underlying fix or defer. A bandaid
guarded only by lore is debt the next reader inherits without
context.

## Deferral is an honest answer

Sometimes the correct fix is no fix yet. Rare presentation, large
refactor, leaky bandaid — defer, file the diagnostic-ladder
findings, and revisit when the refactor lands. Deferring after
the ladder, with the reasoning recorded, is engineering.
Downgrading to a bandaid because the refactor _felt_ expensive —
and writing the PR as if the bandaid were the only option — is
not.

The cost of the refactor is also frequently estimated, not
measured. A thirty-minute investigation of the cause often
reveals that the underlying fix is cheaper than the long tail of
the bandaid it would have replaced.

## The short version

- Errors only grow. Default to the underlying fix; the bandaid is
  the exception, not the rule.
- Walk the ladder before writing the fix: presentation →
  proximate cause → API contract → isolated vs. systemic.
- Untestable defects warrant **more** skepticism, not less. They
  ship without a defense.
- A bandaid is acceptable only when localized **and** leak-free.
  Otherwise extract the underlying fix, or defer.
- Deferral with a written reason is honest. Bandaiding because
  the refactor _felt_ expensive is not.
