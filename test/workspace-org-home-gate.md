---
id: TC-WORKSPACE-HOME-001
title: Organization home gate offers Console or Work, and remembers Work
module: workspace
area: home
tags: [workspace, onboarding, console, ai-gateway, fx, temporary]
status: untested
severity: medium
date: 2026-10-13
updated: 2026-10-13
automatable: false
covered_by: []
---

## Behavior

`grida.co/<org>` first shows a bare gate (no sidebar, header, help or command
palette) with two large cards: **Console** (AI Gateway and FX — keys, credits,
usage, billing) and **Work** (projects, forms, databases, documents). This keeps
people who signed up for the Console products from landing in the projects
onboarding ("Create your first project").

Console is a plain link to the organization's AI Gateway page in the Console
and is never remembered — remembering it would turn the organization's own home
into a redirect off grida.co. Work is remembered per organization and per
browser (a cookie scoped to `/<org>`), so after choosing it once, `/<org>`
renders the projects home with the full workspace sidebar. The URL never
changes. The Console stays reachable from the workspace sidebar (above
Settings) and from the organization settings sidebar.

The gate is temporary (`TODO(org-home-gate)`); mark this TC `deprecated` when it
is removed.

## Steps

1. Sign in, clear cookies for the site (or use a fresh profile) and open `/<org>`.
2. Expected: only the Console and Work cards are visible — no sidebar, header,
   help button or command palette. The URL is still `/<org>`.
3. Hover the Console card. Expected: it links to the Console's
   `/organizations/<org>/ai-gateway` page.
4. Click Work. Expected: the projects home renders with the workspace sidebar;
   the URL is unchanged.
5. Reload `/<org>`. Expected: the projects home renders directly (no gate).
6. In the workspace sidebar, find Console directly above Settings. Expected: it
   links to the same Console page as step 3.
7. Open another organization you belong to that you have not chosen Work for.
   Expected: that organization shows the gate.
8. Open `/organizations/<org>/settings`. Expected: a Console item is pinned to
   the bottom of the settings sidebar.

## Notes

Choosing Console does not persist anything, so a later visit to `/<org>` shows
the gate again.
