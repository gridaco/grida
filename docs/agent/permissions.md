---
title: Understand agent permissions
description: Review what Grida Agent can read or change, allow individual actions, and understand native command and automatic review limits.
keywords:
  [agent permissions, approvals, Grida Desktop, sandbox, automatic review]
format: md
---

# Understand agent permissions

A native Desktop workspace chat works under the **Default** preset, shown in
the composer. The agent reads, creates and edits files in the selected
project and runs commands there inside a sandbox, without asking each time.
Commands start from your login shell's environment, so your usual tools work,
and they can read the rest of your computer except Grida's own state and
saved credentials. They cannot write outside the project or reach the
internet. Version-control and agent metadata such as `.git` stay read-only.
**Plan** lets the agent investigate without changing anything. The
[permission policy](https://grida.co/docs/wg/ai/agent/permissions) describes the
presets and defaults. An editor action can depend on the file or selection you
attached when you sent the message. [Edit selected SVG text](./clients.md#edit-selected-svg-text)

## Review a request for access

Ask is the default for access beyond the project, such as another folder.
When the agent asks for a read,
check the action, folder, and relative path shown in chat. Choose **Allow once**
to approve that action or **Decline** to refuse it. An approved read may supply
text to the model running your chat.

A later action needs its own applicable grant. If the folder or scope changes
before execution, Grida checks access again. A question about what you want is
a separate interaction from an approval to perform an action.

## Use a native launch profile

Source-built headless clients can select a trusted permission profile with a
primary folder and additional folders. A profile can require approval for
reads or enable bounded command execution. Native command confinement has
been verified on macOS and Linux ARM64. An unattended run that needs your
decision returns a retained approval so a capable client can answer it.
[Work with selected folders](./clients.md#work-with-selected-folders) ·
[Run a confined command](./clients.md#run-a-confined-command)

An explicitly configured native profile can ask the model to review one
eligible file read per turn. It can allow or decline only the exact read named
by the profile. If the review cannot finish or return a valid decision, the
approval stays open for a manual answer. Pause and Stop still apply during the
review. [Configure automatic read review](https://github.com/gridaco/grida/blob/main/crates/grida-agent/README.md#review-one-configured-read)
