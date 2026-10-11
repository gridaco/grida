---
title: Docs sources (WG)
description: How one docs site publishes docs that are authored in other repositories — who owns the page and its assets, who owns the version, and what each side must honor.
tags:
  - internal
  - wg
  - platform
  - infra
format: md
---

# Docs sources

Grida ships several products from several repositories, but publishes one docs
site. A product's docs are best written **next to its code**: they change in
the same review as the behavior they describe, and they are versioned with it.
A reader is best served by **one site**: one navigation, one search, one
domain. This spec reconciles the two. It defines how a docs site publishes
pages it does not author, and what each side owns.

It is an RFC: it states the model and its invariants. How a particular site
realizes them belongs with that site's code.

## Vocabulary

| Term           | Meaning                                                                                                                                               |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| **site**       | The repository that builds and publishes the docs website. It authors its own **native** pages.                                                       |
| **source**     | A declared slice of another repository: the repository, a **ref policy**, and one or more **mappings**.                                               |
| **mapping**    | A directory in the source repository (a **published directory**) and the site path it is published under.                                             |
| **ref policy** | How the site decides which revision of a source to publish (see [Ref policies](#ref-policies)).                                                       |
| **pin**        | The exact revision (commit) of each source the site publishes, recorded in the site repository.                                                       |
| **snapshot**   | The published directories of one source at its pinned revision, transformed for the site. Produced by the build; never stored in the site repository. |
| **sync**       | Resolving a source's ref policy to a revision and moving its pin.                                                                                     |
| **check**      | Applying the source rules to a source's published directories at any revision, including an unmerged change in the source repository.                 |

## Ownership

Two owners, never overlapping:

- **The source owns the content.** What a synced page says, its assets, and
  every fix to either, live in the source repository and its history.
- **The site owns publication.** Which sources exist, which revision of each is
  published, where it is mounted, the navigation, the search index and the
  build are decided in the site repository.

The arrow is one-way: the site **pulls**. A source never writes into the site
and holds no credential for it.

## Invariants

- **DS-1 · Single author.** A synced page and its assets have exactly one home:
  the source repository. The site repository holds no copy of them, so there is
  nothing on the site side to edit or to drift.
- **DS-2 · The site holds the pin.** The revision a source is published at is
  recorded in the site repository and changes only through a change to the
  site repository, reviewable like any other. That change carries the pin, not
  the content; the content difference is the source repository's own diff
  between the two revisions.
- **DS-3 · Pinned build.** Building the site reads the site repository and each
  source at its pinned revision, nothing else. A given site commit always
  builds the same pages, or fails. A build never substitutes another revision,
  and never publishes a source that fails the source rules.
- **DS-4 · Deterministic snapshot.** A snapshot is a pure function of the
  source declaration and the pinned revision. Check, the build and review all
  see the same pages for the same revision.
- **DS-5 · Declared paths only.** Only files inside a published directory are
  published. Nothing else in a source repository — code, internal notes, other
  docs — is read for publication, whether the repository is public or private.
- **DS-6 · Path exclusivity.** Every published path has exactly one owner: a
  native page or one source. Two owners for one path is an error at build
  time, never a silent overwrite.
- **DS-7 · Links resolve where they were written.** Authors write ordinary
  relative links that work in the source repository. Each relative link is
  resolved **in the source repository** and then:
  - if its target is published (by any source of that repository), it becomes
    a relative link to the target's site path;
  - if its target is a page or other text that exists but is not published, it
    becomes a permanent link to the target in the source repository **at the
    pinned revision** (a tag when the revision is a release, otherwise the
    commit);
  - if its target is an **asset** outside the published directories, or does
    not exist, the source fails the source rules.

  Fragments are kept. External and in-page links are not touched.

- **DS-8 · Source dialect.** Synced markdown is read as the source repository's
  host renders it (CommonMark with the host's common extensions), not as the
  site's extended dialect. A page that renders correctly in its source
  repository must not fail the site build because of syntax the site would
  otherwise interpret (embedded components, expressions).
- **DS-9 · Edits go to the source.** The site's "edit this page" affordance for
  a synced page opens the page in its source repository.
- **DS-10 · Assets are served by the site.** Every asset a synced page uses is
  published with it and served from the site, like a native page's assets. The
  site never makes a reader's browser fetch an asset from a source
  repository's host.

## Assets

An asset is any non-page file a page shows or links: images, diagrams, other
media. Docs that lean on assets are the reason this model keeps content out of
the site repository: every revision of every asset lives in exactly one
history, the source's (DS-1), and the site repository grows only by pins.

The rules that make assets publishable:

- **Placement.** A page's assets live inside the published directory, beside
  the page they serve. An asset elsewhere in the repository is not published
  and may not be referenced (DS-5, DS-7).
- **Reference.** An asset is referenced with the markdown image or link syntax,
  by a relative path. Embedded markup (an HTML tag) is not interpreted by the
  site and may only point at absolute URLs. The site must be able to find every
  asset a page uses by reading its markdown.
- **Kinds.** The site publishes a declared set of still-image and diagram
  formats. Video is never stored in a source repository; it is hosted for
  streaming and linked.
- **Weight.** Each asset is bounded by a per-file size limit the site declares.
  Repository history keeps every revision of a binary forever, so the limit is
  what keeps a source repository healthy as its docs grow; it is enforced where
  the asset is committed.

A source whose docs outgrow its code repository can move its docs to a
repository of their own. That repository is a source like any other; nothing
on the site changes but its declaration.

## Ref policies

A source declares one ref policy.

| Policy         | Published revision                                                                                        | Suits                                                      | When the pin moves                                                                                 |
| -------------- | --------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| **branch**     | The head of a named branch.                                                                               | Working-group and design docs, which describe the present. | A scheduled sync proposes a change to the site repository; a maintainer merges it.                 |
| **version-of** | The release tag of the version that an artifact **built from the site repository** pins for that product. | User guides, which must describe what users can install.   | In the same change that moves the artifact's version. A version moved without its pin is an error. |

**version-of** exists because a guide that describes unreleased behavior is
wrong for every reader who installed the release. When the site repository is
also where the product is distributed from (a CLI that bundles it, say), the
version that ships and the version that is documented are the same number,
changed together.

A one-off override (pin one source at a given revision) is allowed for repair;
it is judged against the source's policy like any other pin.

## Checks and where they run

The same source rules run in three places, from one definition:

| Where                                      | What it guards                                                                             |
| ------------------------------------------ | ------------------------------------------------------------------------------------------ |
| **The source's own change review**         | A change that would break publication fails before it merges, where its author can fix it. |
| **The site's change review** (a pin moves) | The new revision passes the rules, and every version-of pin agrees with its artifact.      |
| **The site build**                         | The authority: a revision that fails is never published (DS-3).                            |

A source needs no knowledge of the site's build, layout or tooling; it runs the
site's check and honors the rules below.

## Obligations of a source

1. **Relative links resolve in the repository** (DS-7).
2. **Assets follow the asset rules**: placed in the published directory,
   referenced by markdown syntax, of a published kind, within the size limit,
   and no video.
3. **Plain markdown** (DS-8): no site-specific syntax, so a page renders the
   same on the repository host and on the site.
4. **Pinned revisions stay reachable.** A release tag is never moved; a tracked
   branch is never rewritten.

## Private sources

A source may be a private repository, under DS-5: only published directories
are read, and the site's build needs read access to that repository alone.

Private code is not a reason for private docs. The default for a product whose
code is private is to **author its public docs as native pages** on the site;
a private source is declared only when docs genuinely need to change in the
same review as private code. Docs that must stay unpublished (embargoed,
internal) are never placed in a published directory.

## Out of scope

- **Several published versions of one source** at once. A source has one
  pinned revision. A product that needs versioned docs gets them from the
  site's own versioning, at a cost argued separately.
- **Federating separately built sites** under one domain (each product
  deploying its own docs app). That shares a domain but not navigation, search
  or the build, which is the point of this model.
- **Search and navigation design** for synced pages. They are native-equal
  citizens of the site; nothing here treats them differently.

## Alternatives considered

| Alternative                                                             | Why not                                                                                                                                                                                                                 |
| ----------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **All docs authored in the site repository**                            | Docs drift from the code they describe; a behavior change and its doc land in different reviews. It remains the right home for private products' public docs (see above).                                               |
| **One docs site per product**                                           | Splits navigation, search and theme per product; readers cross products constantly.                                                                                                                                     |
| **Sources push into the site**                                          | Every source needs a credential for the site; a missed or failed push leaves the site stale with no record of what it should be. Pulling against a declared list keeps one place to see and replay every source (DS-2). |
| **Commit snapshots into the site repository**                           | Every revision of every synced asset becomes permanent history of the site repository, which here is also a product's code repository. Committing snapshots only fits a site repository whose history is disposable.    |
| **Assets outside version control** (an asset store, large-file storage) | Assets stop being reviewable with the page that uses them and the build gains a second, unversioned input. The size limit keeps ordinary history workable instead.                                                      |
| **A shared docs repository embedded in every product repository**       | Inverts ownership: every product writes into a shared tree whose version each product pins separately, so the published state is the race between them.                                                                 |

## When this model stops fitting

The model assumes a few sources, one published revision each, and owners who
are the product's engineers. Revisit it when:

- a product needs **several versions live** at once;
- edits routinely **span many sources** at once (a cross-product rename, a
  dialect upgrade), which this model turns into one change per source;
- a source's **owner becomes a docs team** rather than the product's
  engineers, at which point authoring next to the code stops paying for itself.

Each of these points toward a dedicated docs repository, as a single source or
as the site itself; the declared source list makes either move mechanical.

## Grounding

The pattern, and its limits, are established practice:

- A site that pins product repositories and assembles them at build time,
  committing only the pin, is how the [Rust](https://github.com/rust-lang/rust)
  toolchain publishes its books and how
  [GitLab](https://gitlab.com/gitlab-org/technical-writing/docs-gitlab-com)
  builds its docs, pinning one revision per product for each docs release.
  Sites that instead commit snapshots do so in a dedicated site repository
  ([Electron](https://github.com/electron/website),
  [Svelte](https://github.com/sveltejs/svelte.dev)), never in a code
  repository.
- Docs assets live beside the page in the repository that authors it, as
  ordinary versioned files, bounded by per-file limits: GitLab, GitHub's docs
  and MDN cap each image (MDN enforces it in continuous integration, because
  every revision of a binary stays in history). Video is hosted elsewhere
  almost universally.
- The move from sources pushing into the site to the site pulling from a
  declared list is recent and deliberate
  ([Grafana, 2026](https://github.com/grafana/grafana/pull/126928)).
- The case for central authoring, and the triggers in the previous section,
  are those [HashiCorp](https://github.com/hashicorp/web-unified-docs) gives
  for moving product docs out of product repositories: many live versions,
  cross-product edits, and docs publishing breaking product releases.
