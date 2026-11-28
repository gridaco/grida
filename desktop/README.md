# Grida Desktop App

[👉 Download](https://grida.co/downloads)

Desktop requires macOS 13 (Ventura) or later.

The desktop app is the Electron host for the Grida editor. It loads the
hosted editor under `/desktop/*`, exposes a path-scoped preload bridge,
and supervises the native Rust chat host over private ACP pipes. A retained
service sidecar keeps files, workspaces, recents, provider settings and media.

Workspace content tabs also host an isolated built-in browser. Browser pages
use DOM `<webview>` presentation under Main-owned admission and browser policy,
and work independently of chat. See the
[browser reference](./docs/browser.md) for navigation, shared history and website data, website support
and live composition verification.

The conversation master and durable chat execution live in the Rust workspace.
Shared retained media operations live in `@grida/ai`; their HTTP adapters remain
in `@grida/ai-host`. Desktop stays thin: windows, menus,
protocol routing, app lifecycle, IPC sender validation, and sidecar
supervision.

The accepted security architecture for host-native networking and confined
agent execution is [Desktop agent authority](./docs/agent-authority.md).
The native system-browser and loopback flow for using an eligible ChatGPT
subscription is documented in
[ChatGPT subscription OAuth](./docs/chatgpt-subscription-oauth.md).
That flow has an active local credential boundary and remains an experimental
integration: it defaults to the public native Codex OAuth client identity,
never starts Codex/ACP, and is still gated for stable release on a
legal/support contract with OpenAI.

Native agent settings and hooks use `$GRIDA_HOME/config.toml`, defaulting to
`~/.grida/config.toml`. Settings → Configuration creates or opens the file.
Settings → Hooks inspects the source and reviews new or changed definitions.
[Launch profiles](#launch-profiles) · [Hooks](https://grida.co/docs/agent/hooks)

## Architecture

```text
Electron main/preload (desktop)
  -> checks Desktop compatibility and owns updates
  -> owns the live Grida-account projection and versioned Desktop preferences
  -> derives the one sign-in / onboarding / main entry-window role
  -> owns the exact 127.0.0.1 ephemeral listener and per-spawn auth
  -> transfers only accepted connected sockets to the socketless sidecar
  -> owns provider destination grants and a dedicated Chromium network session
  -> loads editor /desktop/*

Desktop sidecar composition
  -> @grida/daemon owns the perimeter, shared-provider adapter and local resources
  -> @grida/ai-host/media-server serves media through @grida/ai without chat startup
  -> never loads a TypeScript chat server; Main is its only spawner
  -> serves authenticated daemon HTTP only on main-transferred sockets
  -> requires a host transport over bounded framed stdin/stdout for provider
     requests and credential-free provider-asset downloads

editor /desktop/*
  -> publishes the Desktop version used to build the hosted editor
  -> owns the hosted UI, through typed bridge clients
```

On macOS and Linux, ordinary Stable, Insiders and development launches use
native chat. The browser profile and retained service stores keep their owners.
Chats live in `chats/` beside the browser profile. Main claims that directory
once with a `store.json` ownership record and refuses a directory it did not
create. An interrupted first launch can reopen the same store. An unavailable
native executable or failed handshake leaves chat unavailable.
Windows currently starts retained services with chat unavailable pending an
ACL-aware native storage contract.

Development builds stage the Rust host, sandbox helper, and bundled programs
under `desktop/.native-resources/`, outside Forge's disposable `.vite` output.
After acquiring the instance lock, Desktop copies those artifacts into private
runtime storage in the development browser profile. The runtime paths stay
stable across launches and outside the Grida source checkout, so developers
can open the checkout as a workspace while executable write protections apply.

Launching the Desktop app with
`--disable-agent` selects media-only startup before the chat server is imported.
The supervisor translates that app flag to the sidecar's `--agent=disabled`;
direct sidecar invocations use `--agent=disabled|native-chat`. Image, video, music,
sound effects, speech and 3D routes keep the same authenticated transport,
BYOK key store, GG memory custody and durable media root. Agent/session routes,
configured text-provider routes and native ChatGPT auth are absent; the
handshake reports those capabilities as unavailable. No chat database, skill
discovery, scratch preparation or command authority is initialized.
This is a host launch choice, not a renderer setting or fallback after failure.

The separate media entry is an application adapter in the existing package.
It establishes startup independence; Desktop bundles `@grida/ai-host`.
The independently usable model SDK is `@grida/ai`, which owns no HTTP routes,
Desktop lifecycle or chat state.

Small native preferences live in `preferences.json` under
Electron's `userData` directory and are owned exclusively by main. The hosted
renderer receives purpose-specific actions, never a generic preferences
key/value bridge. `DesktopPreferences` uses a small versioned JSON document
with owner-only atomic writes. Voice stores its preferences and one dedicated
provider key encrypted with Electron `safeStorage` in this document. Main sends
completed recordings to the selected provider and returns transcript text.
Account cookies remain in Chromium's default
session cookie jar, while macOS/Linux BYOK API keys use the shared native
`providers/credentials.toml` under Grida home through the sidecar's secret adapter.
ChatGPT OAuth stays in the
agent's `auth.json`. On the first upgrade from Desktop 0.0.13, main consumes the former
renderer onboarding-completion flag through one fixed hidden same-origin probe
and records the migration before selecting an authenticated role. That legacy
flag is never consulted again.

AI endpoint settings use explicit **Connect/Save** as consent for the displayed
endpoint ID and full canonical base URL. Main stores this receipt separately
from sidecar-writable endpoint config under the browser profile's
`provider-authority/` directory. The retained sidecar cannot read or write that
directory, and file/workspace admission and native commands exclude it.
Matching saved consent survives app restarts without dialogs; a new or
externally changed destination requires Connect/Save. Startup and service
recovery recheck the receipt, current config and eligible route before restoring
network access. An unchanged live native chat keeps its network binding after
a service crash. Localhost and IP literals remain the supported destinations;
remote custom hostnames remain unavailable.

Probes consume existing consent. Background metadata refresh merges only
reported model fields into the latest saved config, preserving overrides and
the default model. It cannot create config or authorize a new URL. Delete
revokes durable and live consent before deleting config; publication and
revocation still await the service's grant acknowledgement. Hosted renderers
must feature-detect the optional consent inspection and metadata bridge methods
and skip automatic discovery on older native builds.

The [client authentication blueprint](https://grida.co/docs/reference/authentication)
maps the separate web, Desktop, CLI and provider lifecycles. Current account
cookies are not configured as HttpOnly; this is not a guarantee of isolation
from the trusted same-origin renderer.

Shared BYOK custody (GRIDA-SEC-014) is private plaintext on macOS/Linux.
Desktop and CLI see the same provider changes when they use the same Grida
home. The supervisor captures the same physical authority for custody and
confinement. Linux binds that authority beneath a private namespace alias;
it does not copy keys, reset migration fences or create another store. Both physical and namespace private roots are
excluded from ordinary file and workspace admission. An explicit
`GRIDA_AGENT_USER_DATA` override isolates both agent state and provider custody.
Migration preserves ChatGPT OAuth, retires old API entries and resumes pending
cleanup without reimporting keys. Older mixed-file writers must not run
concurrently. Windows Desktop retains its host-local `auth.json` backend for
BYOK and ChatGPT OAuth; it does not use the shared CLI store. Backend selection
happens before access, and malformed provider custody fails without fallback.
Windows file privacy relies on the inherited user-directory ACL, not POSIX mode
bits or the shared custody protocol. No renderer capability returns stored keys.

On macOS and Linux, the retained service sidecar runs under the native
`RetainedServiceSandbox`: Seatbelt on macOS, bubblewrap with an inherited
seccomp filter on Linux. It has no new socket, listener or direct provider
network capability. Main transfers only accepted connections and performs
provider HTTP. The existing home-secret exclusions, the protected chat state
and writable file/media roots remain in force. The launcher uses
an executable and argument array, captures executable identity and passes no
ambient shell, proxy or provider-key environment. Linux requires an unprivileged
bubblewrap build and working user/PID/network namespaces; setup failure stops
the retained service rather than starting it unconfined.

Linux keeps selected workspace/file paths unchanged while giving settings,
provider custody and media private namespace ancestors with valid mapped
ownership. The same physical files and SQLite lock inodes remain shared with
native clients outside that namespace. Its working temp is namespace-local;
durable media stays in the existing media library.

The agent's commands use the separate Rust native sandbox helper and
per-action permission scope. Neither command nor chat execution is owned by
the retained sidecar, and its private channel has no command lane.

Windows retains its existing unwrapped file/media services with chat and local
agent execution unavailable. Those services have no kernel confinement claim;
renderer admission and HTTP authentication do not establish one.

If a bug reproduces in files, workspaces, BYOK providers or media
operations, add the first test in `packages/grida-daemon` or
`packages/grida-ai-host`; agent execution and sessions belong to the native
agent crates. Not here. Desktop tests should prove the host
adapter still wires the core.

## Chat attachments

Selecting, dropping or pasting a raster image freezes its original bytes in the
composer. The optional selected-image bridge resolves its genuine native File
origin only in preload. Main checks the selected digest, size and timestamp
against a bounded, pinned source read before publishing a descriptor; a changed
source refuses the whole draft. A File without a native origin becomes a private
snapshot under protected `desktop-image-custody/snapshots` state. Display posters
never become model input. Images stay attached when the selected model or an
older host cannot accept them. Ordinary disk files and folders use references.

Before an ordinary saved-chat submit or enqueue leaves the renderer, one durable
record binds its input identity, text, settings and frozen attachment. Restart
restores that exact request. Retry reads its native receipt before current model
capabilities or source checks; only authoritative absence permits another send.
Unknown outcomes retain the capture, and storage failure prevents dispatch. A
restored reference retains its identity and name but cannot invent a native File;
its receipt can still be recovered. Modern blank drafts use their distinct draft
UUIDs and move only their own row when native creates the chat.

Dropping a local folder in the chat pane or composer stages the original
operating-system `File` for Main to resolve. Main determines the real resource
type and supplies a canonical local resource link with `inode/directory` and
no size or preview. Staging does not read entries or bytes, copy or archive
contents, register a workspace or grant filesystem access. Protected-directory
overlap checks reject private roots, their containing ancestors and canonical
aliases. This metadata route does not mint a directory read scope.

The renderer checks the optional `acceptsDirectoryReference` bridge capability
before effects. Older Main builds report folder references unavailable and
leave the draft and current attachment intact. One attachment per message
still applies. Accepted folder links retain their facts through queues and
reopen; observation starts no provider call or directory read. The agent uses
its existing file-tool and command permissions for later inspection. Plan
withholds commands; attaching an outside folder changes no root or grant.

Sent attachments render outside the user's text bubble. Supported images show
only the image, with no card frame, filename or dimensions caption; files,
folders and videos keep individual cards.
Supported reference rasters and videos can carry bounded still previews made
from the person's original `File`; a video still is not a playback promise.
Raster stills admit PNG/JPEG/WebP/GIF sources up to 4 MiB and 16 Mi-pixels,
within the existing dimension bound, with a five-second deadline. Their
PNG/JPEG display metadata fits the same 48 KiB poster limit as video.
Retained original preview reads negotiate `co.grida/session/input-image-chunks`
for PNG/JPEG/WebP/GIF up to 20 MiB, in decoded chunks of at most 256 KiB. The
legacy `co.grida/session/input-image` capability keeps its PNG-only 256 KiB
contract. Each read is limited to an image owned by the attached chat's recorded
user message. Main keeps the native attachment URI and supplies an opaque
renderer token. The renderer receives original bytes with their recorded MIME,
never a source path or a general file reader. Older binaries without these read
capabilities keep plain file cards. PDF, SVG
and HTML have no chat preview, and folder cards remain free of size and
preview metadata. Presentation changes neither
provider perception nor filesystem authority.

Captured tool images separately negotiate `co.grida/session/tool-images`.
Successful tool results carry at most eight PNG image references; Main replaces
their native media identities with opaque renderer tokens bound to the exact
chat, turn, tool call and result part. `readToolImage` reads those prepared,
retained pixels in chunks of at most 256 KiB, up to 384 KiB per image. It never
rereads the original source path, invokes inference or reruns a tool. Retained
images remain readable after source mutation or removal and after reopening
the chat. Missing bytes report unavailable; failed tool results grant no read.
Input-attachment and crop readers do not accept these identities. Older native
hosts omit the image metadata and retain their readable tool-result text.

Queued attachment display separately negotiates
`co.grida/session/queued-input-image-chunks`. `queuedMessage` returns full text
and bounded display metadata for an input still in the exact observed queue;
its opaque preview token works only with `readQueuedAttachmentPreview` and the
same attachment, input and observation. Native verifies current queued ownership
and session revision before and after each bounded original-image chunk. Reads
create no model work and reject claimed, withdrawn or changed inputs. The
existing `queuedText` edit preflight remains text-only, including for an
image-only input whose legacy inspection is a textual placeholder. Older
Desktop binaries keep their existing queue display without these methods.

Caption editing separately negotiates version 1 of
`co.grida/session/replace-text`. The optional
`acceptsQueuedTextReplacement()` bridge method and the waiting input's factual
`textEditable` flag must both permit the action. Main sends `replaceText` as a
text-only mutation of the retained input, preserving its attachments, captured
model and settings. An empty caption is valid when non-text parts remain. The
original input becomes superseded; retries retain the same observation, request
and derived replacement identities. Main never reconstructs or reuploads
attachments, and never falls back to whole-input replacement. `textOnly` and
the older `queuedText` path stay strict for legacy editing and steering. Older
preloads omit the capability method, while older native hosts return false.
Shipping this path requires a native Desktop release with the matching preload,
Main adapter and Rust host; the hosted renderer withholds caption editing until
the installed host advertises support.

## Distributions

The package and installer entrypoints build the native agent with the
repository's pinned Rust toolchain and locked dependencies. Install the Rust
toolchain and native linker for your packaging machine, then run:

```sh
pnpm --dir desktop package
pnpm --dir desktop make
```

The default build targets the packaging machine's OS and Node architecture.
For a cross-target package or prebuilt inputs, set
`GRIDA_DESKTOP_NATIVE_ARTIFACTS` to an absolute build-output directory with one
`<platform>-<arch>` subdirectory per target. macOS and Linux x64 or arm64
require `grida-agent` and `agent-kit-sandbox-helper`. Windows x64 requires
`grida-agent.exe`.

Forge stages the executables in `resources/native-agent` before signing and
verifies their architecture, names and permissions in the completed package.
On a matching host it also starts the bundled executable, reopens an ACP chat
and checks clean shutdown. Cross-target packages receive the static checks.
Installer makers require a freshly verified package. The distribution and
unsigned verification jobs each build and run the executable on their target.
Linux binaries use the builder's GNU runtime.

On macOS and GNU Linux, the Desktop development and package entrypoints also
stage the exact `@grida/fx` platform executable and its license from the
Desktop lockfile into `resources/bundled-programs`. The verifier checks the
target binary and runs `grida-fx --version` on the matching platform. Install
the target FX package at build time for cross-target packaging. Electron Main
uses the installed resource for its own lookups and exposes a verified
read-only command copy and the `desktop-fx` skill through the workspace agent
launch profile. The [FX declaration](../extensions/desktop-fx/extension.json) supplies the
supported targets, resource names, and skill declarations to Desktop packaging and Main's
[FX registration](src/main/fx-extension.ts) binds the viewer to the authorized
workspace. Coordinate FX version changes with the CLI using the
[maintainer guidance for externals](../.agents/skills/externals/SKILL.md).

The main-process chat client creates or loads a session in its selected
workspace and sends identified text input over ACP. It reads retained input
receipts and turn snapshots separately from execution. Pause and Stop return
control receipts. The snapshot confirms suspension or cancellation, and
Resume targets a verified pause. Reconnecting requires loading the session
again before submitting or controlling work.

Main fixes the native chat paths before the non-chat sidecar starts. It selects
native workspace chat on ordinary macOS/Linux launches and
selected SVG chat on macOS. They use the `chats` store under the browser
profile. Other editions can still modify their own data and shared settings.
Workspace image placement and
local image references are not available through this ordinary path. Native
startup failures surface as errors; retained non-chat services keep their
existing owners.

In the packaged native workspace pane, **Model connection** selects an
authorized connection for new work. Chats share the workspace's saved chat
list. An idle chat can change its model, provider or credential for a future
input, retaining visible conversation as portable context. Accepted turns,
queued inputs, unfinished Goals and delegated work retain their captured
execution and funding. Provider-private continuation and reasoning do not
cross to another connection.

Desktop checks eligibility before replacing a worker or committing a model
selection. A refusal identifies the retained work to resolve and preserves
the previous selection and draft. Replacement must also preserve other chats
owned by the worker, including temporary side chats and running commands.
The global context settings apply to new inputs across workspaces and
connections. Up to eight native workers can be live per Desktop owner.
Desktop closes those workers on quit or account change. The
[model-transition interaction case](../test/desktop-agent-chat-model-transition.md)
remains untested in the app.

For a disposable native chat run, launch a development or Insiders build
with `--native-chat` and `--user-data-dir` set to a precreated owner-only
browser directory. Set `GRIDA_AGENT_USER_DATA` to a separate sibling directory
under the same owner-only root in the system temporary directory. Set
`GRIDA_HOME` to a third sibling directory under that root. The preview requires
all three paths to keep its agent configuration and state isolated.
Chat uses a separate native store for each registered workspace. Main owns the workspace
catalog. On packaged macOS arm64 builds, directory listings, buffered editor
reads and media Range reads use the confined read worker. A directory listing
either returns all entries within its bound or reports a limit error. Workspace
saves use a separate confined writer with the same fractional modification-time
check and explicit force overwrite. Saves accept up to 64 MiB of UTF-8 and
refuse to replace symbolic or hard links. Standalone documents, endpoint settings
and media still use the retained sidecar.
This profile defaults to the Grida account's Gateway connection.

To give one workspace access to a trusted local MCP server in this disposable
Gateway profile, put its bearer in `native-mcp.bearer` under `--user-data-dir`.
Use mode `0600` or `0400` and store the exact token bytes without a newline.
Add these options to the Desktop launch:

```sh
--native-chat-mcp-root=/absolute/canonical/workspace \
--native-chat-mcp-endpoint=http://127.0.0.1:8766/mcp \
--native-chat-mcp-source=local --native-chat-mcp-tool=lookup
```

Open the selected folder through Desktop. Repeat `--native-chat-mcp-tool` for
each tool the agent may invoke. The launch accepts `127.0.0.1` or `[::1]` with
an explicit port and the stateless MCP 2026-07-28 profile. Main binds the
selection to that folder identity and its first authenticated Gateway account,
organization and origin for this launch. Discovery runs when that workspace's
native process starts. Plan prompts cannot use the discovered tools.
The selected workspace can use the peer's tools alongside its attached editor
tools in Act. Each source keeps its own binding for the turn.

The isolated native preview can also launch a saved provider selection. Set
`--native-chat-provider=openrouter` or `--native-chat-provider=vercel` and pass
`--native-chat-model=<catalogue model ID>`. Add the provider key in Desktop
settings first. These profiles use shared key custody on macOS and Linux.

For an approved compatible endpoint, pass
`--native-chat-provider=endpoint:<saved ID>`. Add `--native-chat-model=<saved model ID>`
to choose a registered model. Omit it to use the saved default or the first
registered model. On macOS and Linux, a saved key for that endpoint ID is used
on its approved route. Built-in provider key IDs are reserved. An unavailable
selection leaves the workspace chat unopened.

To export a live workspace view to another local agent, place a separate
64-character hexadecimal bearer in `native-mcp-export.bearer` under
`--user-data-dir`. Use mode `0600` or `0400` and omit a trailing newline.
Add these options to the disposable `--native-chat` launch:

```sh
--native-chat-export-mcp-root=/absolute/canonical/workspace \
--native-chat-export-mcp-listen=http://127.0.0.1:8767/mcp
```

Connect your MCP client to that address with the export bearer. Open the
selected workspace in Desktop to publish its open-tab view. Only the first
admitted workbench frame for that exact folder can publish. Navigating away,
closing the frame, or signing out withdraws the view for this launch. The
listener offers `surface_list_open` independently of any model session.

Add `--native-chat-export-mcp-browser` to make the browser catalog available
to that authenticated client. New browser pages run in the background, and the
client can work with exact browser targets in the selected workbench. Follow
the [browser MCP guide](https://grida.co/docs/agent/grida-mcp#use-the-built-in-browser-from-an-mcp-client)
for the tool workflow and grant scope.

Ordinary macOS and Linux launches offer connected subscription models in the
Welcome and workspace model pickers. Sign in under **Settings → LLM Providers
→ ChatGPT Subscription**. A new chat without a saved or explicit model choice
prefers a ready subscription; explicit choices and existing chats retain their
connection. The preferred subscription default is **GPT-6.2 Sol**
when offered. Desktop intersects the signed-in account's listed models with the
public Models V2 subscription selectors and installed adapter capabilities.
Main refreshes the public catalogue in the background and retains a local
snapshot for offline use. The preferred default and historical IDs live in
`data/ai/chatgpt-subscription.json`. Withdrawn GPT-5.5 and GPT-5.4 selections appear unavailable and
require an explicit replacement. Text, tools, reasoning settings, attached images
and image-viewing tools are supported. Provider-native compaction is unavailable;
Grida can summarize conversation context through its own compaction workflow.

Ultra is available on every supported native model connection. It extends the
inference-step allowance and permits one independent reviewer through the
parent's captured connection. Supported reasoning controls and output-token
fields remain provider capabilities. A subscription connection keeps its
restricted Responses request shape, and Ultra supplies no subscription-quota
or monetary ceiling. Gateway spending guarantees retain their existing owner.

The integration remains experimental independently of its ordinary Desktop
availability. The account and service constraints in the
[OAuth binding](./docs/chatgpt-subscription-oauth.md) still apply.
For a disposable run, `--native-chat-provider=chatgpt` alongside `--native-chat`
selects the subscription's reviewed default model. Signing out withdraws native
subscription work before a replacement connection can start.

The source-built native process owner accepts workspace selections from Electron
main. On macOS and Linux it writes a private launch profile that allows reads
in the primary workspace and asks before reading an eligible additional root.
Main inspects the pending action and answers through its private ACP stdio
connection. A repeat decision uses the original wait and revision basis.
This integration supplies read-only tools.

### Provision Local agent in Linux Insiders

Use a locally built Insiders Debian package and the isolated native chat
profile above. Launch once to register the selected workspace, then close
Desktop. The preview requires a reviewed executable in `/usr/bin` and a
non-setuid `/usr/bin/bwrap`.

The administrator provisions the helper from that exact installed build:

```sh
bundled_helper=/usr/lib/grida-insiders/resources/native-agent/agent-kit-sandbox-helper
helper_digest=$(sha256sum "$bundled_helper" | cut -d ' ' -f 1)
sudo install -D -o root -g root -m 0755 "$bundled_helper" \
  "/usr/libexec/grida-agent/$helper_digest/agent-kit-sandbox-helper"
```

Repeat the provisioning step after installing a build with a different helper
digest. Desktop verifies both copies and requires administrator custody along
the helper paths.

Create an owner-only JSON profile with mode `0600` outside the workspace. Use
`version: 1`, a display `name`, the workspace's `workspaceId`, canonical `root`
and `identity` (`device`, `inode`, `birthTimeNs`). Read these from the matching
workspace row (`id`, `root`, `directory_identity`) in
`workspace-catalog/<SHA-256 of the browser directory path>/workspaces.json`
under the isolated profile root. Set `executable` and `bubblewrap` to objects
with `path` and `sha256` (32 digest bytes as numbers), `arguments` to the peer's
argument list, and `deadlineMs` to a deadline from 1 to 120,000 milliseconds.

On ARM64, set `runtimePaths` to the exact peer executable,
`/lib/ld-linux-aarch64.so.1`, and `/usr/lib/aarch64-linux-gnu`. The x64 layout
uses `/lib64/ld-linux-x86-64.so.2` and `/usr/lib/x86_64-linux-gnu`. Launch the
same isolated profile with `--native-external-acp-profile=/absolute/profile.json`.
Open **Local agent** in the registered workspace.

We support macOS, Windows, and Linux distributions.

[See All Releases](https://github.com/gridaco/grida/releases/latest)

| Name             | Platform | x64 | arm64 | universal | makers           | signed | notes                                         |
| ---------------- | -------- | --- | ----- | --------- | ---------------- | ------ | --------------------------------------------- |
| `Grida`          | `darwin` | ✓   | ✓     | ✓         | `zip`, `dmg`     | ✓      |                                               |
| `Grida`          | `win32`  | ✓   |       |           | `exe (squirrel)` |        | We only support x64 for win32 / not signed () |
| `Grida`          | `linux`  | ✓   | ✓     |           | `deb`, `rpm`     | ✓      |                                               |
| `Grida Insiders` | `darwin` |     |       | ✓         | `zip`, `dmg`     | ✓      | Insiders version is only available for MacOS  |

> Insiders app is a contributor version of the app, which requires additional setup to run.

## Updating Desktop

In the production app, choose **Check for Updates…** from the **Grida**
menu on macOS or the **Help** menu on Windows and Linux. Patch releases
within a major and minor line are optional. Desktop builds on an older
major or minor line need an update to open the hosted editor.

Electron Main checks the hosted editor's Desktop version before opening
it in packaged production builds. When an update is required, Desktop
can show its bundled update page even if the hosted UI is unavailable.
Restart when Desktop says the update is ready. If automatic installation
is unavailable, including on Linux, open the release from the update page
and install the package for your platform.

The release runbook explains how to publish Desktop installers before
promoting the matching hosted editor. [Desktop release runbook](https://grida.co/docs/contributing/desktop-release)

# Building locally

See the [CONTRIBUTING.md](CONTRIBUTING.md) file for instructions on how to build and run the project locally.

**Quick Start**

The `/desktop` directory is a separate pnpm workspace, while the Grida
packages it links are built by the root workspace. Install both from the
repository root:

```bash
pnpm install
pnpm --dir desktop install
pnpm --dir desktop dev
```

Desktop commands build their linked packages first. Turbo reuses cached
outputs when their sources have not changed.

In one terminal, start the editor dev server:

```bash
pnpm --filter editor dev
```

In a second terminal, start Electron:

```bash
pnpm --dir desktop dev
```

## Launch profiles

Electron Main scopes the instance lock to the browser profile, which holds
cookies, preferences, and chats. Every launch uses `$GRIDA_HOME/config.toml`
for agent settings. The default configuration directory is `~/.grida`, shared with the CLI.
An absolute `GRIDA_HOME` selects the configuration directory and supplies the
default provider home for packaged launches. Source launches have separate
provider homes. Agent data holds retained service settings and ChatGPT OAuth. [Runtime profile](./src/main/desktop-profile.ts)

| Launch                                     | Browser profile              | BYOK provider home        | Agent data                      | Media                      | Managed projects                        |
| ------------------------------------------ | ---------------------------- | ------------------------- | ------------------------------- | -------------------------- | --------------------------------------- |
| Packaged Stable                            | Electron `userData`          | Grida home                | Grida home `/agent`             | Stable media library       | `Documents/Grida Projects`              |
| Packaged Insiders                          | Electron `userData`          | Grida home                | Grida home `/agent`             | Insiders media library     | `Documents/Grida Projects`              |
| `just desktop` or `pnpm --dir desktop dev` | `Grida Dev/Browser`          | `Grida Dev/Home`          | `Grida Dev/Home/agent`          | `Grida Dev/Media`          | `Documents/Grida Dev Projects`          |
| `pnpm --dir desktop dev:insiders`          | `Grida Insiders Dev/Browser` | `Grida Insiders Dev/Home` | `Grida Insiders Dev/Home/agent` | `Grida Insiders Dev/Media` | `Documents/Grida Insiders Dev Projects` |
| Disposable native chat                     | `--user-data-dir`            | `GRIDA_AGENT_USER_DATA`   | `GRIDA_AGENT_USER_DATA`         | `<root>/media`             | `<root>/projects/Grida Projects`        |

The `Grida Dev/` and `Grida Insiders Dev/` paths are relative to Electron's
`appData` directory. Both packaged profiles let Electron resolve `userData`
with the runtime name `Grida`. Windows Desktop stores its provider credentials
in `auth.json` under agent data.

`--user-data-dir` selects the browser profile. `GRIDA_AGENT_USER_DATA` selects
the BYOK provider home and agent data directory. A disposable native chat
launch also requires an explicit `GRIDA_HOME`. Set all three paths to distinct
sibling directories inside a private temporary root, then launch it from a
development or Insiders build with `--native-chat`.

Stable loads `https://grida.co` and registers `grida://`. Insiders and both
source launches load `http://localhost:3000` and register `grida-dev://`.
A disposable launch inherits those settings from its build.

## Testing

```bash
pnpm --filter @grida/ai-host test
pnpm --dir desktop test
pnpm --dir desktop typecheck
```

Use `@grida/ai-host` tests for retained-service behavior. Use desktop tests for Electron
adapter behavior.

Run the shared browser favicon fixtures in Electron and an installed Chrome
from the repository root. Both use disposable profiles and a loopback server.

```bash
GRIDA_DESKTOP_TEST_ELECTRON=1 pnpm --dir desktop exec vitest run src/main/browser-host.electron.test.ts
node desktop/scripts/verify-browser-favicons-chrome.cjs
```

Visible chat link cards can request display metadata for a loopback URL.
Bundled extensions can supply product labels by placing `web-preview.json`
next to their `extension.json` and declaring an exact named HTML meta match.
Desktop reads the page once for every shared lookup. It falls back to ordinary
page metadata when two contributions match. For a custom lookup, add a sibling
`web-preview.ts` that exports a `resolve` function typed as
`NonNullable<WebPreviewProvider["resolve"]>`. Desktop calls a matched resolver
with a bounded same-origin reader and an abort signal.
