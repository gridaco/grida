---
id: TC-DESKTOP-WELCOME-001
title: Empty Welcome submission opens the selected workspace
module: desktop
area: welcome
tags: [welcome, workspace, composer, navigation]
status: untested
severity: medium
date: 2026-07-23
updated: 2026-07-23
automatable: false
covered_by: []
---

## Behavior

The Welcome composer is also the primary way into a workspace. When it has no
prompt or selected reference context, submitting should open the currently
selected workspace without creating or sending an agent turn. This keeps the
front door useful for people who want to browse or edit existing work before
asking the agent for anything.

A non-empty prompt keeps its existing behavior: it opens the workspace and
sends that prompt as the first turn. Selected references or a template also
keep their context-start behavior even when the text field is empty.

## Steps

1. Open Welcome with the default workspace selected and leave the composer
   empty.
   - Expected: the submit control is announced as "Open workspace".
2. Activate the submit control.
   - Expected: the default workspace workbench opens and no agent turn starts.
3. Return to Welcome, choose an existing workspace, and submit with the composer
   still empty.
   - Expected: that workspace opens and no agent turn starts.
4. Return to Welcome, enter a prompt, and submit.
   - Expected: the selected workspace opens and the prompt starts its first
     agent turn as before.
5. Return to Welcome, select a reference or template without entering text, and
   submit.
   - Expected: the submission starts with that selected context rather than
     behaving as a plain workspace open.
