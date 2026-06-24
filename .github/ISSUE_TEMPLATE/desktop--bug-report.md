---
name: "Desktop: Bug report"
about: Report a bug specific to the Grida Desktop app (Electron)
title: "[Desktop] "
labels: desktop
assignees: softmarshmallow
---

> Use this template **only** for problems that happen in the installed Grida
> Desktop app — the agent sidecar, app windows, deep links / file
> associations, updates, or native crashes. If the same problem also happens
> in the browser editor at grida.co, file a general **Bug report** instead.

**Describe the bug**
A clear and concise description of what the bug is.

**Environment**

- App version: <!-- Grida menu → About, or the version in the window title -->
- Channel: <!-- Stable / Insiders -->
- OS + version: <!-- e.g. macOS 15.1, Windows 11 23H2, Ubuntu 24.04 -->
- Architecture: <!-- Apple Silicon / Intel / x64 / arm64 -->

**To Reproduce**
Steps to reproduce the behavior:

1. Go to '...'
2. Click on '....'
3. See error

**Expected behavior**
A clear and concise description of what you expected to happen.

**Internal logs (required)**

The desktop app prints its Electron main-process and agent-sidecar logs to
the terminal — they are **not** written to a log file, so they are only
visible when you launch the app from a terminal. Please reproduce the bug
with the app started this way and paste the full output below.

macOS:

```sh
# Stable
/Applications/Grida.app/Contents/MacOS/Grida

# Insiders
/Applications/Grida\ Insiders.app/Contents/MacOS/Grida\ Insiders
```

Windows (PowerShell) — find the install folder via Start menu → right-click
Grida → _Open file location_, then run the executable from a terminal:

```powershell
.\desktop.exe
```

Linux (deb/rpm):

```sh
desktop
# or, if not on PATH:
/opt/Grida/desktop
```

<details>
<summary>Terminal output</summary>

```
<!-- paste the full terminal output here -->
```

</details>

**Screenshots**
If applicable, add screenshots to help explain your problem.

**Additional context**
Add any other context about the problem here.

**Confirm this is a desktop-specific issue**

- [ ] This issue reproduces in the Grida Desktop app (e.g. agent sidecar
      errors, Electron windows, deep links, file associations, updates,
      native crashes) and **not** in the browser editor at grida.co. If it
      also happens in the browser, I will file a general Bug report instead.
