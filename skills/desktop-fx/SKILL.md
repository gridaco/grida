---
name: desktop-fx
description: Run the bundled Grida FX command in a Desktop workspace and present its workflow evidence in the workbench when relevant.
---

Use this guidance with the FX project instructions and skills when present.

- Use `grida-fx` as an ordinary command. Before relying on the bundled copy, check that `command -v grida-fx` resolves in the first directory on the command `PATH`, and read `grida-fx --version`. If the carrier is unavailable, report that state before doing work that depends on it.
- Use `grida-fx --help` and command-specific help for the installed capabilities. FX owns workflow records, cache, execution and run limits. Use `doctor` for runtime and provider setup diagnostics.
- Offline preparation, planning and record inspection can run under Default access. Provider calls and starting a local viewer require the user's Full access selection. Preserve the user's access choice. Keep provider keys in their existing FX-supported sources.
- A workflow can finish without a viewer. When a viewer is useful, check the exact project's service status. Reuse a compatible running service. If startup is requested, run `grida-fx start --json` as an ordinary foreground command. The chat can retain the process. Use the verified service address and exact plan or run entry.
- Open the viewer with `surface_open`. Observe the exact tab and current document with `browser_snapshot` before a page action. Use `browser_evaluate` with the observed document ID to call the viewer's own context or presentation API. Check the subject and relevant selection first. Treat the resulting viewer context as evidence of what appeared. An open dispatch alone acknowledges the request.
