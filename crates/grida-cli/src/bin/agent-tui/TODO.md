# Agent TUI backlog

The harness currently drives one chat with live output, recent transcript
replay, queue checkout, restore and steering, blocking questions, and manual
and automatic compaction. Use the [native ACP contract](../../../../grida-agent/docs/rust-client-protocol.md)
for shared behavior and the [feature catalog](../../../../../docs/agent/features.md)
for current Desktop coverage.

## Workflows already in Desktop

- [ ] **Temporary side chats.** Open a side question, switch between the
      parent and its side chats while they run, and close a side chat through ACP.
      Keep separate drafts and route pending input to the session that requested it.
- [ ] **Subagent activity.** Browse the current chat's workers and inspect
      their live and retained conversations using the read-only observation capability.
- [ ] **Chat management.** Start, list, search, switch and reopen chats from
      the terminal. Add rename, unread state, archive, restore and guarded deletion.
- [ ] **Fork and revise.** Fork at a supported transcript anchor and revise an
      eligible earlier message using the host's retained history.
- [ ] **Turn controls and recovery.** Pause, resume or stop the exact active
      turn. Show interrupted and uncertain work, keep drafts across chat switches,
      and restore observation without starting a new turn.
- [ ] **Permissions and approvals.** Show the chat's access mode, handle
      pending approvals and display automatic review outcomes and available retry actions.
- [ ] **Questions.** Add optional prompts, navigation within a batch and an
      explicit final submission. Show answered or skipped questions in replay.
- [ ] **Plan, Goals and execution settings.** Select Plan or Act, start and
      manage a Goal, and choose a model, effort or speed when the host offers it.
- [ ] **Attachments and skills.** Add structured file, folder and image input,
      retained previews where the terminal supports them, and a skill picker.
- [ ] **Queue controls.** Add full input previews, reordering and removal.
      Preserve ordinary and checked-out drafts when switching views.
- [ ] **Transcript detail.** Fetch older pages. Show grouped tool and command
      activity, streamed plans, model changes, search citations when supplied,
      retry waits, turn outcomes and context usage.
- [ ] **Processes and configuration.** List and stop the chat's background
      commands. Add config inspection and reload, and surface hook status and trust controls.

## Terminal interaction

- [ ] **Composer.** Add cursor movement and selection, prompt history,
      undo and redo, multiline paste, file mentions, slash completion, help and
      discoverable shortcuts. Consider Vim bindings and an external editor.
- [ ] **Reading and sharing.** Render Markdown, code, tables, diffs, links and
      richer artifacts. Add transcript search, selection, copy and export,
      including a copy-friendly scrollback option.
- [ ] **Terminal display.** Review inline and full-screen layouts, keyboard and
      mouse navigation, configurable status and title, themes, and accessible output.

## Candidates that need a product or host decision

- [ ] **Session scope.** Saved side chats, a cross-chat agent dashboard,
      interactive subagent control, detached background sessions and reattachment,
      and an explicit handoff from terminal to Desktop.
- [ ] **Developer workflows.** Git diff and dedicated code review, working
      directory and worktree switching, IDE context, instruction scaffolding,
      conversation recaps and reusable prompts.
- [ ] **Provider and integration UI.** Account setup and sign-out, provider
      management, account usage and limits, MCP inspection and sign-in, apps or
      plugin management, settings import and diagnostic export.
- [ ] **Optional terminal features.** Voice, terminal notifications, scheduled
      work, memory, feature toggles and ambient pets are separate scope decisions.
