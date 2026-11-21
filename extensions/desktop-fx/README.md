# Desktop FX extension

The [manifest](extension.json) declares the workflow skill and the command
resources Desktop stages for each supported platform. Desktop pins the FX
version in its package manifest. Its [command registration](../../desktop/src/main/fx-extension.ts)
checks the installed program before admitting the package to a workspace.

The [web preview contribution](web-preview.json) labels pages that publish the
versioned FX Viewer HTML marker. Workspace and command verification in the
Desktop adapter governs native FX actions.

The [packaged integration test](../../desktop/src/main/browser-automation.electron.test.ts)
uses the bundled command to register a local plan and verifies its viewer in
Electron. The [skill](skills/desktop-fx/SKILL.md) documents the command syntax
and the relationship between a registered entry, project and service.
