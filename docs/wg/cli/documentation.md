---
title: CLI documentation
description: Home, publishing contract, and lightweight maintenance checks for Grida CLI user documentation.
keywords: [grida, cli, documentation, reference, release]
sidebar_label: Documentation
sidebar_position: 5
tags: [internal, wg, cli]
format: md
---

# CLI documentation

> **Status: implemented for the CLI preview.** Public guides and their currency
> check accompany the npm release. Local validation does not establish deployment.

## Current position

The [user guide](../../cli/index.md), installed help, and package README cover
the implemented preview. `grida docs` links to the user guides. The
[v1](./v1.md), [media](./media.md), and
[credential custody](./credential-custody.md) documents retain contributor
design and rationale.

Retired `init`/`add` instructions and obsolete Korean translations have been
removed from the active source. The Flutter deep link now has a retirement
notice. The existing docs site supplies publishing, navigation, translation
fallback, and search. A scoped CLI check supplements its broadly permissive
link handling and runs on docs-only PRs.

## Home and audience

Use **`https://grida.co/docs/cli`** as the public entry point, within the existing
docs site. Keep authoring in the root docs source, with one maintained `cli`
section. The WG remains the home of contributor-facing design and rationale;
the package README covers development and links users to the public guide.

Use six pages. Subcommands are sections, not separate pages by default. These
routes are produced by the local docs build; publication is a release step.

| Route                 | The reader's task                                                                                                                                        |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `/docs/cli`           | Install the supported release, check its version, configure one access route, and save the first result. State platform support and preview limitations. |
| `/docs/cli/auth`      | Sign in to Grida, inspect the session, choose credential storage, and sign out.                                                                          |
| `/docs/cli/account`   | Inspect memberships and select an organization for cached credits.                                                                                       |
| `/docs/cli/providers` | Configure BYOK, locate and safely edit the TOML file, understand precedence, validate a key, and remove it.                                              |
| `/docs/cli/models`    | Discover executable models, understand availability, inspect accepted local/remote inputs, and find speech voices.                                       |
| `/docs/cli/generate`  | Generate and save media, pass local references, chain an image into video, use structured input/output, and handle failures.                             |

Each page combines an explanation, examples, and command reference. Common
scripting rules belong in the entry page. The generation guide starts with
ordinary flags and one local-file workflow; full JSON is the advanced path.

Show BYOK and Grida login as separate access choices. A BYOK quickstart must not
require account login, while GG must explain login, organization selection, and
credits. Document where credentials and outputs live, what leaves the machine,
and which failures can have incurred a charge.

`grida docs [command...]` continues to print a URL without fetching it or opening
a browser. Every supported topic maps to its owning public page or explicit
section. Installed help remains authoritative for the installed version;
hosted pages identify the preview until release, then describe the latest
released version and mark newer examples with a minimum version when needed.
No bundled guide tree or separate agent-only
documentation is required.

## Legacy and release behavior

Reclaim the public CLI entry point deliberately. Archive retired instructions
outside the active CLI tree, or remove them when history is sufficient. Preserve
useful old deep links with an explicit retirement notice or a meaningful
redirect; a retired Flutter command must not appear to be supported by the new
CLI. Remove obsolete translations and generated locale remnants along with the
English pages, so a language switch cannot restore old installation guidance.

There must be one active CLI navigation entry and one canonical entry URL.
Verify emitted routes rather than deriving them from filenames: document IDs,
slugs, locales, and the site's public proxy affect the result. Update old
marketing links and the docs ownership index as part of that migration.

Installed help, `grida docs`, and the npm README share the new guide home.
Publish the matching guides before promoting the executable. An install
example must identify an available release, never imply
that the legacy npm package contains preview commands.

## Keep it current with a small check

**Author the explanations; verify the contracts.** Existing navigation indexes
solve findability, but cannot detect a removed flag, a broken target, or a stale
model example. One scoped docs check runs alongside the existing CLI checks,
using their parser, model schemas, and controlled fixtures:

1. **Coverage and routes.** Enumerate real help topics, require a documentation
   target for each, and verify the target and section against built docs. Fail
   on missing, draft, or retired targets and duplicate emitted routes. Multiple
   subcommands may share an owning page. Reuse the same topic-to-page
   mapping for installed help and `grida docs`; do not maintain another command
   inventory in the docs tooling.
2. **Examples.** Check the actual designated examples from the guides against
   CLI parsing and the selected operation schema. Exercise representative
   file inputs with an existing image fixture; synthetic generation execution
   remains in the installed media proof. Do not validate a separately
   copied command while leaving its prose example unchecked. Auth, credential,
   and generation examples must never execute against personal stores or hosted
   services during this check; no arbitrary shell evaluation or paid calls.
3. **Build and links.** Build the docs and make broken CLI links, anchors, and
   legacy route collisions fail this check. Keep enforcement scoped to the CLI
   surface and its referenced pages, so unrelated legacy docs cleanup is not a
   prerequisite for the first release.

Run it when CLI commands, relevant shared contracts, public CLI docs, their
examples, or docs routing change, including docs-only PRs. A behavior-changing
PR updates the relevant explanation in the same change; automation cannot
prove that prose explains the behavior correctly.

Model descriptors remain authoritative. Teach discovery and demonstrate
selected operations; do not duplicate the model catalogue, provider pricing,
or availability in hand-maintained tables.

Before npm release, require the check against the release artifact and a docs
build from the same source revision. Confirm its public targets are published
before promoting the package. A read-only HTTP check may later automate that
publication check; ordinary PR validation remains local and credential-free.
Defer a new docs framework, full reference generation, versioned sites, and
automatic prose generation until actual needs justify them.

## Reference observations

These are examples of documentation organization, not requirements inherited
from another product.

- [Vercel CLI](https://vercel.com/docs/cli) lives under the product's `/docs/cli`
  route, with install/update guidance, task guides, global options, and command
  pages. This supports a first-class CLI section within an existing docs site;
  the route alone does not establish how Vercel maintains its content.
- [GitHub CLI's manual](https://cli.github.com/manual/) separates usage from
  [contributor documentation](https://github.com/cli/cli/blob/trunk/docs/README.md).
  Its [documentation generator](https://github.com/cli/cli/blob/trunk/cmd/gen-docs/main.go)
  builds reference pages from the command tree, and its
  [site build targets](https://github.com/cli/cli/blob/trunk/Makefile) connect
  generated manual pages with release tooling. This demonstrates that mechanical
  reference material can share the executable's definitions. Grida's smaller
  surface initially needs checked examples and links; a full reference generator
  is optional if duplication later warrants it.

Repository grounding: the
[docs site](https://github.com/gridaco/grida/tree/main/apps/docs),
[public routing configuration](https://github.com/gridaco/grida/blob/main/editor/next.config.ts),
[CLI package](https://github.com/gridaco/grida/tree/main/packages/grida-cli), and
[test workflow](https://github.com/gridaco/grida/blob/main/.github/workflows/test.yml)
establish the current publishing and validation boundaries described above.
