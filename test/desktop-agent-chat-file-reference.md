---
id: TC-DESKTOP-AGENT-CHAT-025
title: Attach files and folders by reference without granting access
module: desktop
area: agent-chat
tags: [agent-chat, composer, file, folder, drag-drop, reference, permissions]
status: untested
severity: high
date: 2026-11-15
updated: 2026-11-16
automatable: partial
covered_by:
  - editor/lib/agent-chat/native-chat-controller.test.ts
  - desktop/src/bridge/file-reference-request.test.ts
  - desktop/src/main/native-file-reference.test.ts
  - desktop/src/main/native-agent-file-references.test.ts
  - crates/grida-agent/tests/process/file_references.rs
---

## Behavior

Ordinary disk files attach by reference regardless of their size. The agent
receives the verified path, name, type and size and inspects content on demand
under existing permissions. Even a small text file is not eagerly copied or
extracted. Pasted ordinary files without a usable disk origin may use the
bounded retained-file workflow; no original path is invented.

Explicit raster images use the eager image route described in
TC-DESKTOP-AGENT-CHAT-021. A text-only model keeps such an image draft unsent
rather than silently replacing perception with a reference. Private Grida data
and its aliases are refused. These rules also apply in side chats.

A folder dropped from the operating system always goes by reference. Main
validates the original dropped resource and supplies its directory type and
canonical location. The folder chip shows no size or media preview. Staging
does not list entries, copy bytes, archive contents, register a workspace or
grant access. The same one-attachment limit applies to files and folders.

File tools can inspect the referenced folder only within their existing
permitted roots. Referencing an outside folder does not grant recursive read
access. Plan cannot inspect it with commands; Act keeps its existing command
rights. Protected directories and ancestors containing them are refused,
including through symbolic links. A queued or saved message retains the
folder reference, and reopening it starts no inspection or model request.
Older Desktop builds without the directory-reference capability refuse the
drop before effects, preserving the draft and any existing attachment.

## Steps

1. Open Desktop, open a workspace, and focus the native agent composer.
2. From Finder, drop a 5 MB `.zip` from outside the project, type "What is in
   this archive? Use a command.", and send.
   - Expected: the card shows the name and `ZIP`; no "at most 256 KiB" message
     appears. The agent lists the archive with a command without asking for
     its path.
3. Drop a file of more than 256 KiB from inside the project and ask the agent
   to read its first lines.
   - Expected: the agent reads it with its file tools by its project path.
4. Drop a small text file from outside the project and ask which file it is.
   - Expected: its verified path is identifiable; contents are inspected only
     when a tool needs them. No small-file special case hides the source path.
5. Choose a text-only model and attach a PNG or JPEG with a draft.
   - Expected: it remains an image intent and sending keeps the whole draft
     unsent. Select an image-capable model to send it; it does not silently
     become a reference-only message.
6. Try to attach a file from the Desktop app's data folder (for example under
   `~/Library/Application Support/` for Grida) and send.
   - Expected: the send is refused with "This item is in Grida's private data
     and can't be attached." and the draft stays.
7. Open a side chat tab and repeat step 2 there.
   - Expected: the same card and result.

### Folder references

1. Drop one ordinary project subfolder on the composer, type a draft, and
   inspect the attachment before sending.
   - Expected: one folder chip with its name, no byte size and no media
     preview. No directory entries or contents are staged in the chat.
2. Send a request to list or search that subfolder.
   - Expected: permitted project file tools can inspect it using its path.
     The folder is not copied into chat storage or opened as another project.
3. Drop a folder outside the project, select Plan and ask to inspect it.
   - Expected: the reference identifies the folder, but file tools cannot use
     it to escape their granted roots and command tools are unavailable.
     Repeat in Act: command access follows the existing profile, with no new
     permission granted by the attachment.
4. Queue a folder-reference message while a turn is running, then reopen the
   chat and restart Desktop before the queued message runs.
   - Expected: the single accepted reference retains the same path and folder
     presentation. Reopening starts no read or provider request. When the
     message later runs, it uses current permissions and current folder data.
5. Try a protected Grida data directory, its containing parent and symbolic
   links to those locations.
   - Expected: each is refused, preserving the draft. The reference cannot
     expose private path facts or grant access through an enclosing folder.
6. Attach a file and type a draft, then drop two folders, or a file and folder
   together.
   - Expected: the one-attachment notice leaves the existing file and draft
     intact, with no folder read or replacement attachment.
7. Use an older Main fixture without the optional directory-reference
   capability, then drop a folder with a draft and an attachment present.
   - Expected: the unsupported/update notice appears before submission; the
     exact draft and existing attachment remain, and no bytes are read.
8. Repeat the folder drop in a side chat tab.
   - Expected: the same reference presentation and capability checks apply;
     the side chat keeps its existing tool and permission limits.

## Verification

Automated verification on 2026-11-15:

- Native Rust workspace: 967 passed, 73 ignored. Two folder-reference process
  cases exercise actual queue/retry/restart, permitted listing, observational
  replay and outside-root/protected-root denial through synthetic provider
  fixtures.
- Main/preload reference fixtures: 21 passed. Renderer fixtures: 183 passed.
- Desktop suite: 763 passed, 98 skipped. Full typecheck: 63 tasks passed.
  Lint: no errors and one existing warning. English docs production build
  passed.

These checks establish the exercised contracts, not a successful
Finder-to-chat interaction by themselves.

Partial human verification on 2026-11-15, confirmed afterward through
read-only inspection of the retained records and visible UI:

- The person attached a folder outside the primary project and asked for its
  path and entries. The accepted `file_reference` retained the canonical
  absolute path and `inode/directory`, with no size, preview or contents. The
  model-facing descriptor explicitly identified an attached folder by
  reference and supplied that path.
- One `exec_command` used existing read access under Seatbelt to run
  `ls -1 <absolute-folder> | head -n 8`. It exited successfully and returned
  `LICENSE` and `README.md`. The final answer gave the folder's full path and
  those entries; the visible UI showed a matching Folder card and answer.
- The recorded workspace context still contained only the primary project.
  Referencing the outside folder added no directory grant. The person
  submitted the turn; the subsequent QA inspection submitted no model turn.

Overall manual status remains untested. Queue/restart, Plan, protected
resources and aliases, older Main, side chats and the pane-specific drag/drop
checks are still pending. This single successful scenario does not verify
those cases.

## Notes

- The renderer passes only the person's File; the preload resolves its path
  and Main revalidates it (GRIDA-SEC-004, "Chat attachments by reference").
- A pasted ordinary file with no location on disk keeps the 256 KiB retained-file limit; raster images use their separate preparation bounds.
