---
name: oss-standards
description: >
  Pre-PR discipline for a public-by-default repo. What a reviewer
  enforces beyond CI: secrets and internal data in diffs or
  screenshots, docs that name their reader, and the cleaning pass
  where incomplete or confusing artifacts get dropped. Use before
  opening any PR against `gridaco/grida` or when finalizing work for
  review.
---

# oss-standards

Grida is open source. CI checks catch the mechanical failures —
format, lint, typecheck, tests, typos, generated-file freshness. This
skill is the _extra_ bar a reviewer enforces because the repo is
public, the threat model is public, and the audience for every
artifact in a PR includes a stranger who arrived via Google.

The defaults that flip:

- **Public-by-default.** Names, comments, fixtures, screenshots,
  commit messages — assume a stranger reads them first. There is no
  internal channel; everything is the channel.
- **Push = publish.** A secret in a branch push is a published secret,
  even if you delete the commit five minutes later. "I'll redact
  before merge" is not a plan; rotation is.
- **Incomplete is worse than absent.** "I'll finish it next PR" lands
  on `main`, gets indexed, and becomes the example the next
  contributor copies. Use `draft: true`, defer the PR, or just don't
  ship — but don't ship half.

## Code

Beyond what CI catches and what `CLAUDE.md` / `naming` / `code-ts` /
`code-react` already enforce:

- **No personal TODOs.** `// TODO(me): …`, "fix later", "@username
  knows" — private notes published. Either resolve, or rewrite as a
  neutral TODO with a tracking issue link.
- **No machine-specific paths.** See the [`links`](../links/SKILL.md)
  pre-commit gate — absolute paths, `~/scratch/...`, `/tmp/...`, and
  untracked references resolve to nothing for anyone else.
- **One concern per PR.** A reviewer in public cannot accept half a
  PR; bundled unrelated changes are unreviewable. Split or rebase.
- **New public surface is a semver commitment.** YAGNI applies
  everywhere, but in OSS the cost of adding an exported name today is
  the deprecation path you owe tomorrow. Wait for the second caller.

For bug fixes specifically, the [`etiology`](../etiology/SKILL.md)
skill is mandatory — bandaids in `main` become tribal knowledge that
external contributors have no access to.

## Security

The full boundary discipline lives in the
[`security`](../security/SKILL.md) skill — `GRIDA-SEC-<id>` tags, the
mandatory review before commit. Two extra OSS gates on top, both
because _push = publish_:

- **Secrets in diffs, fixtures, or tests.** Any credential, signing
  key, Stripe/Metronome id, webhook signature, or production-shaped
  URL committed has been published the moment the branch is pushed.
  Use `.env.local` (gitignored) and fixture placeholders.
- **Internal URLs and screenshots.** Webhook URLs, dev-tunnel URLs,
  staging hosts, dashboard links, and screenshots that show real org
  slugs, account ids, or tenant data leak the same way. A doc PR with
  a real org slug visible in the screenshot chrome is a published org
  slug.

If a `GRIDA-SEC-<id>` tag appears anywhere in your diff, the
`security` skill's review runs first; this skill's cleaning pass is
downstream of that.

## Docs and prose

Anything user-facing — README, `docs/**`, blog post, in-product copy,
the PR description itself — has an audience that doesn't share your
context.

**Name the reader before writing.** One sentence: "an external
contributor first opening the repo," "a designer evaluating Grida vs
Figma," "an agent grounding before a refactor." If you can't name the
reader, the page doesn't know what it is — and that surfaces as prose
that hedges, repeats, or assumes.

- **No "we know that…" prose.** "We" is the maintainers; the reader is
  someone else. Explain the fact or link to where it lives.
- **No private references.** Slack threads, internal tickets, "as we
  discussed" — invisible to the reader.
- **Link form follows the rendering surface.** See the
  [`links`](../links/SKILL.md) skill — local-only or untracked targets
  are correctness bugs in OSS, not style.
- **Ship-or-draft is the doc taxonomy gate.** `draft: true` is the
  honest answer when a page isn't useful enough yet; shipping a
  half-page because "something is better than nothing" is not. See
  [`docs/AGENTS.md`](../../../docs/AGENTS.md).

## The cleaning pass

Final pass before opening the PR. For every file touched, ask
literally:

> If a stranger reads this file with no context, does it help them, or
> does it leave a question they cannot answer?

Apply the answer:

- **Helps → keep.**
- **Recoverable question → fix it** (rename, expand the doc, add the
  one comment that explains the non-obvious constraint).
- **Unrecoverable question → drop** the file, the code block, the doc
  section, the fixture, the screenshot.

The bias is to drop. A confusing artifact in `main` outlives the PR
and is the first thing the next contributor finds when they grep.

Common removals on this pass:

- Scratch files committed by mistake (`tmp.ts`, `notes.md`, unnamed
  fixtures, snapshots from a one-off debug run).
- Half-written doc pages with no audience or no conclusion — `draft:
true` or delete.
- TODO blocks that reference internal context.
- Examples or fixtures that don't run or aren't referenced.
- Inline comments that paraphrase code instead of stating the
  non-obvious _why_ (per the repo-wide rule in `CLAUDE.md`).

## The PR description and commit message

These are public artifacts permanently linked from the diff.

- **Commit message** makes `git log` a useful index. `"fix"` is not a
  commit message; neither is `"updates"`.
- **PR description** lets a future contributor reconstruct _why_ the
  change exists without reading the diff line by line. Bug fix → name
  the diagnostic-ladder rung (`etiology`). Feature → name the audience
  and the concrete use case that pulled it in.

## The short version

- Public-by-default. Push = publish. Nothing is internal.
- CI catches the mechanical. This skill catches the rest.
- Secrets, internal URLs, machine paths, screenshots with real data —
  published on push; rotation is the only remedy.
- Docs name the reader, or they don't know what they are.
- Final pass: every artifact justifies itself to a stranger, or it
  drops. Bias is to drop.
- The PR description and commit message are the permanent index.
  Write them as such.

See also: [`security`](../security/SKILL.md),
[`links`](../links/SKILL.md), [`etiology`](../etiology/SKILL.md),
[`naming`](../naming/SKILL.md), [`code-ts`](../code-ts/SKILL.md),
[`code-react`](../code-react/SKILL.md),
[`pedantic`](../pedantic/SKILL.md) (when you want a hard critique
before opening the PR).
