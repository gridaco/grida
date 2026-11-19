---
title: Understand agent permissions
description: Choose Default or Full access for a Desktop chat and understand what the agent can read, change and run.
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
- The agent's own settings file is the exception to working without asking:
  it can read the file, but every change to it asks for your approval, and
  commands cannot reach it. [Change agent settings](./settings.md#ask-the-agent)

## Choose Full access

In a project's chat composer, open **Default** and choose **Full access**.
Confirm the in-app dialog for that chat. You can make the choice before
sending its first message; opening the chat does not start the agent.

Full access lets the agent run commands without the filesystem or network
sandbox. It can fetch resources, install packages, change existing Git
metadata, and reach files and local services available to your OS user. This
includes readable credentials and Grida's own state. It does not grant
administrator privileges, supply missing service credentials or automatically
configure a program's proxy support.

The choice belongs to that chat and survives reopening. Other chats keep their
own choice, and new chats begin with Default. You can change access while a
turn is running or messages are queued. The new access applies to messages
you send after the change. A running turn, an earlier queued message and a
subagent keep the access granted for their work.

To end earlier Full-access work immediately, stop the running turn and remove
any Full-access messages still in the queue. Check **Processes** for commands
you also want to stop. A new Default turn cannot send input to an existing
Full-access terminal.

Choose **Default** again to restore restricted access for subsequent work.
**Plan** continues to withhold commands and file changes in either mode.
Process output, cancellation and cleanup reporting remain available in Full
access, but an unconfined program can escape normal process-group cleanup;
Grida does not promise isolation from hostile same-user code.

On Home, choosing **Full access** opens the same confirmation immediately.
Confirm to select Full access for the new chat in your chosen project. You can
keep drafting and change the model or effort before sending. Cancel keeps the
draft and Default access. Changing the project resets access to Default.

Full access needs a compatible native Desktop build. Earlier builds that offer
the picker can require the chat and its processes to finish before changing access.
Builds without the picker use Default.
Automatic approval review, sometimes called **Approve for me**, is not offered
by Desktop.

## What the agent cannot reach

With Default access, the agent's file tools work only inside the project, and
its commands cannot reach the internet. Desktop does not ask to extend this
for one action. To
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

A trusted native launcher can separately opt into Full access. That authority
comes from the launcher, not a workspace file or model request. See the
[native permission profile](https://github.com/gridaco/grida/blob/main/crates/grida-agent/README.md#filesystem-services)
for its opt-in fields and the private per-chat selection contract.
