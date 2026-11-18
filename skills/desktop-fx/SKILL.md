---
name: desktop-fx
description: Use Grida FX in a Desktop workspace, including working from selected examples and presenting workflow evidence.
---

Use this guidance with the FX project instructions and skills when present.

- Use `grida-fx` as an ordinary command. Before relying on the bundled copy, check that `command -v grida-fx` resolves in the first directory on the command `PATH`, and read `grida-fx --version`. If the carrier is unavailable, report that state before doing work that depends on it.
- Use `grida-fx --help` and command-specific help for the installed capabilities. FX owns workflow records, cache, execution and run limits. Use `doctor` for runtime and provider setup diagnostics.
- Use the numbered `<reference>` entries in the Desktop-provided `<grida-desktop-context><fx><references>` section as examples for the user's request. The `showcase` attribute points to the visible result and `source` points to the implementation. Inspect and adapt whichever parts the request calls for. If the message contains only picks, infer the intended outcome when clear or ask a focused question.
- When the request calls for an editable starter and a reference provides `template-id`, check `grida-fx init --list-templates --json` for that ID and its `workflow_entry`. Use `grida-fx add <id> <new-dir> --json` to install it in a fresh directory. Use the workflow entry and optional input preset from the receipt. Surface missing inputs and prerequisites when they matter.
- Offline preparation, planning and record inspection can run under Default access. Template downloads through the command, provider calls and starting a local viewer require the user's Full access selection. Preserve the user's access choice and follow FX's run and spending limits. Keep provider keys in their existing FX-supported sources.
- A workflow can finish without a viewer. When a viewer is useful, check the exact project's service status. Reuse a compatible running service. If startup is requested, run `grida-fx start --json` as an ordinary foreground command. The chat can retain the process. Use the verified service address and exact plan or run entry.
- Open the viewer with `surface_open`. Observe the exact tab and current document with `browser_snapshot` before a page action. Use `browser_evaluate` with the observed document ID to call the viewer's own context or presentation API. Check the subject and relevant selection first. Treat the resulting viewer context as evidence of what appeared. An open dispatch alone acknowledges the request.
