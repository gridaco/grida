---
title: Understand agent permissions
description: Choose who reviews file and command requests in Desktop chat, and understand the access each choice grants.
keywords:
  [agent permissions, approvals, Grida Desktop, sandbox, automatic review]
format: md
---

# Understand agent permissions

Desktop chat runs on macOS and Linux. On Linux, the agent's sandbox needs
bubblewrap at `/usr/bin/bwrap` with unprivileged user namespaces. Windows
Desktop has no agent chat.

## What the agent can do in Desktop

With **Auto** or **Ask for approval**, the agent can read and edit files in
the project and run commands there in a sandbox without asking. For example,
ask “Run the tests and fix what fails.” The composer shows the current mode.

- Desktop reads your login shell's environment from your home folder so
  commands can find your usual tools. If shell startup stalls, Desktop uses
  its own environment and opens chat.
- Commands can read elsewhere on your computer, except Grida's own data and
  saved credentials. They can write only in the project and the system's
  temporary folder. Ordinary commands have no direct internet access.
- Existing version-control and agent settings folders, such as `.git`, stay
  read-only. The agent can start a new repository but cannot commit to an
  existing one, so run commits yourself.
- With the **Plan** badge on, the agent only reads and asks questions; it
  does not run commands or change files.
- The agent's own settings file is the exception to working without asking:
  it can read the file, but every change to it asks for your approval, and
  commands cannot reach it. [Change agent settings](./settings.md#ask-the-agent)

## Choose who reviews extra access

New project chats begin in **Auto** when the native host supports it. The
chat’s model reviews eligible requests for extra access and asks you when it
needs a decision. Where Auto is unavailable, the chat begins in
**Ask for approval**. Older chats without a saved choice continue to ask you.

Open the access picker on Home or in a project chat and choose
**Ask for approval** to review every request for extra access yourself.
A choice is saved for that chat and applies to messages accepted after the
change. If Auto becomes unavailable for a chat, the chat switches to
**Ask for approval**. Select **Auto** again when it becomes available.

For example, ask the agent to read a particular text file outside the project
and include its absolute path. The file tool can request one read of that
file and may return its contents to the chat’s model. A replacement file needs
a fresh decision. Protected locations,
symbolic links and hard-linked files cannot use this route. Editing the
agent's settings still requires your own approval.

On supported macOS and Linux builds a finite command may also request a connection to
one public hostname and port. For example, name the HTTPS URL when asking
the agent to check a resource. The command needs a client that supports
the supplied SOCKS proxy. Review includes the whole command and the files it can read or write. Desktop commands may read outside the project, so approving a destination can allow a command to send data there. Interactive terminals and background sessions
cannot keep this network permission.

The reviewer considers the proposed action and instructions from your chat,
including earlier limits such as “keep this project offline.” Each new action
needs its own decision. If a confined command fails and the agent requests
network access to retry it, you can see both reviews in the turn’s activity
when both attempts required review.
When it needs your decision, the composer shows the target with **Allow once**
and **Decline**. The turn's activity records automatic decisions. Pause or
stop a turn to interrupt review. Older Desktop builds show their available
access choices.

## Choose Full access

In a project’s chat composer, open the access picker and choose **Full access**.
Confirm the in-app dialog for that chat. You can make the choice before
sending its first message.

Full access lets the agent run commands without the filesystem or network
sandbox. It can fetch resources, install packages, change existing Git
metadata, and reach files and local services available to your OS user. This
includes readable credentials and Grida's own state. It does not grant
administrator privileges, supply missing service credentials or automatically
configure a program's proxy support.

The choice belongs to that chat and survives reopening. You can change access
while a turn is running or messages are queued. The new access applies to
messages you send after the change. A running turn, an earlier queued message
and a subagent keep the access granted for their work.

To end earlier Full-access work immediately, stop the running turn and remove
any Full-access messages still in the queue. Check **Processes** for commands
you also want to stop. Sending input to an existing Full-access terminal
requires a turn with Full access.

Choose **Auto** or **Ask for approval** to restore sandboxed access for
subsequent work.
**Plan** continues to withhold commands and file changes in every mode.
Process output, cancellation and cleanup reporting remain available in Full
access, but an unconfined program can escape normal process-group cleanup;
Grida does not promise isolation from hostile same-user code.

On Home, choosing **Full access** opens the same confirmation immediately.
Confirm to select Full access for the new chat in your chosen project. You can
keep drafting and change the model or effort before sending. On supported
Desktop builds, switching Home presets keeps that approval for the same
project. Cancel keeps the draft and the previous mode. Changing the project
uses the destination’s new-chat default.

Full access needs a compatible native Desktop build. Earlier builds that offer
the picker can require the chat and its processes to finish before changing access.
Builds without the picker ask you to review requests for extra access.

## What the agent cannot reach

With **Auto** or **Ask for approval**, changes outside the project require an
existing write grant. A one-file read grants no access to neighboring files.
Confined commands need a separate grant for each network destination. You can
also attach a file to a message.
[Attach an image or a file](./getting-started.md#attach-an-image)

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
