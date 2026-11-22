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
- In Desktop's default profile, Act and Plan commands can read elsewhere on
  your computer, except protected locations such as Grida's own data and
  saved credentials. Act commands can write to the project and temporary
  storage. Ordinary commands have no direct internet access.
- Sandboxed commands can start a new repository. Ordinary commands and
  listener retries keep existing version-control metadata read-only. An
  approved offline write can update that metadata. Agent settings stay protected.
- With the **Plan** badge on, the agent can investigate with confined
  commands and ask questions. Each command finishes within its call, runs
  offline, and can write only to private temporary storage.
- The workspace's agent settings file stays in protected storage. Edit the
  file while Desktop is closed to change the context limit for future
  messages. [Change agent settings](./settings.md#edit-the-file-yourself)

## Choose who reviews extra access

New project chats begin in **Auto** when the native host supports it. The
chat’s model reviews eligible actions. Routine steps such as fetching a public
dependency can proceed automatically. Where Auto is unavailable, the chat begins in
**Ask for approval**. Older chats without a saved choice continue to ask you.

Open the access picker on Home or in a project chat and choose
**Ask for approval** to review every request for extra access yourself.
With **Auto**, you see approval buttons when a request needs your decision.
For example, a request can reach you if the reviewer cannot fit the instructions
it needs into its context. When the reviewer denies a request, the activity
shows why it was blocked. A timeout or service failure also stops the action.
Successful reviews can happen while a command waits to connect, including
when an installer contacts several different hosts in a row.

A choice is saved for that chat and applies to messages accepted after the
change. If Auto becomes unavailable for a chat, the chat switches to
**Ask for approval**. Select **Auto** again when it becomes available.

Reading an ordinary file outside the project uses Desktop's existing disk-read
grant. A narrower launch profile can separately allow a request for one
outside file. That approval covers the exact file and verified version.
Replacing or changing the file requires a fresh decision. The one-file
route excludes protected locations, symbolic links, and hard-linked files.

On supported macOS and Linux builds, a workspace **Act** command starts with a
managed proxy for outbound HTTPS.
The first connection to each public hostname and port receives a separate
decision. If approved, the command can reuse that destination until it ends.
A request to send sensitive data needs authorization for the data and its
destination. A command that needs a new destination after its turn closes
must request access in a new command. Use a cache within the workspace or the
command's temporary directory if the installer cannot write to its usual cache.

An **Act** turn can request a reviewed retry when the sandbox blocks needed
access. For example, if you ask to preview a site on macOS, **Auto** can review
the command and the TCP port it needs to listen on. Local previews should bind
to loopback. In **Ask for approval**, you see the command, scope and reason.
**Allow once** applies to the process. It keeps its filesystem protections.
The command chooses the address on which it listens. Its outgoing connections
are limited to the approved port on loopback. Later commands use the chat's
normal access. Linux supports reviewed workspace writes and
managed outbound connections.

The reviewer considers the proposed action, your instructions and answers, and
workspace guidance. To check what a command would do, it can run short,
read-only commands. For example, it can inspect which script starts a preview.
It inherits the turn’s read permissions, which in a default Desktop chat can
include files outside the project. Protected locations stay off limits.

The chat’s selected model provider receives bounded output from these checks.
The reviewer can reuse earlier findings in the same chat after you reopen it.
Raw findings stay out of the visible conversation. Each action still needs its
own decision. A command and a connection it opens can require separate decisions.
Later instructions such as “keep this project offline” apply even if a review
was already running.

When a request needs your decision, the composer shows its target with
**Allow once** and **Decline**. Activity shows the reason for a blocked action.
An eligible denial offers **Request reconsideration**. Choosing it records your
instruction for the exact action. If the agent tries it again, Auto reviews it
under the current permissions. You can pause or stop a turn during review.

The agent may also ask in chat, for example, “Delete `old-export.zip`?
This will remove the local copy.” If you reply “Yes,” Auto can consider your
answer when the agent asks to delete that file again. Use the buttons to
answer an open approval card.

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
**Plan** uses the launch profile's read scope and keeps commands confined,
offline, and read-only apart from private temporary storage. This applies
even when the chat selects **Full access**.
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

Sandboxed changes outside the project require an existing write grant.
A one-file read grants access to that file alone.
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

A trusted native launcher can offer one-command escalation and Full access
independently. It chooses which are available in a workspace. See the
[native permission profile](https://github.com/gridaco/grida/blob/main/crates/grida-agent/README.md#filesystem-services)
for its opt-in fields and the private per-chat selection contract.
