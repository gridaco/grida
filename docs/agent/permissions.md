---
title: Understand agent permissions
description: See what Grida Agent can read, change and run in Desktop, and how headless runs choose their own folder rules.
keywords:
  [agent permissions, approvals, Grida Desktop, sandbox, automatic review]
format: md
---

# Understand agent permissions

Desktop chat runs on macOS and Linux. On Linux, the agent's sandbox needs
bubblewrap at `/usr/bin/bwrap` with unprivileged user namespaces. Windows
Desktop has no agent chat.

## What the agent can do in Desktop

Desktop chat in a project uses the **Default** access, shown in the composer.
The agent reads and edits files in the project and runs commands there in a
sandbox without asking. For example, ask “Run the tests and fix what fails.”

- Commands start from your login shell's environment, so your usual tools
  work.
- Commands can read elsewhere on your computer, except Grida's own data and
  saved credentials. They can write only in the project and the system's
  temporary folder, and they cannot reach the internet.
- Existing version-control and agent settings folders, such as `.git`, stay
  read-only. The agent can start a new repository but cannot commit to an
  existing one, so run commits yourself.
- With the **Plan** badge on, the agent only reads and asks questions; it
  does not run commands or change files.

Desktop offers only this preset. The
[permission policy](../wg/ai/agent/permissions.md) describes the full set of
presets and their defaults.

## What the agent cannot reach

In Desktop, the agent's file tools work only inside the project, and its
commands cannot reach the internet. Desktop does not ask to extend this. To
use a file from elsewhere, copy it into the project or attach it to your
message. [Attach an image or a file](./getting-started.md#attach-an-image)

A question the agent asks about what you want is separate from access: answer
it in its card, and it grants nothing.

## Run with your own folder rules

When you run the agent from a source build on macOS or Linux, a permission
profile chooses the project folder, adds folders the agent must ask before
reading, and allows commands. When the agent asks, the run waits with a
request that shows the action, folder and relative path; the client answers
with **Allow once** or **Decline**, and each approval covers that one action.
If no one is there to answer, the request waits in the chat until a client
answers it. [Work with selected folders](./clients.md#work-with-selected-folders) ·
[Run a confined command](./clients.md#run-a-confined-command)

A profile can also let the model answer one specific file-read request per
turn. If the model cannot decide or its review is interrupted, the request
waits for you. Pause and Stop still apply during the review.
[Configure automatic read review](https://github.com/gridaco/grida/blob/main/crates/grida-agent/README.md#review-one-configured-read)
