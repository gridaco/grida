/**
 * GRIDA-SEC-004 — renderer-safe context descriptors for host-held capabilities.
 *
 * Registered context tokens (WG `docs/wg/ai/agent/compositor.md` §"Templating:
 * user view vs model view").
 *
 * A "context token" is a typed message part the HOST contributes on the user's
 * behalf — rendered as a chip in the USER view, lowered to a `<marker>…</marker>`
 * block in the MODEL view — so the user's `text` part stays exactly what they
 * typed and is NEVER fabricated (the anti-pattern this replaces: synthesizing a
 * fake user message that narrates a UI action).
 *
 * The system is AGNOSTIC: {@link CONTEXT_MARKERS} is the registry the model-view
 * lowering (`runtime/message-view.ts`) consults — any registered token lowers to
 * its marker with no per-token branch, and the user-view chip renders any
 * registered token by the same lookup. Registering a NEW token (a selection, an
 * open-file ref) is a one-line addition here plus a producer; the lowering and
 * chip switches never change.
 *
 * Tokens ride the wire as AI-SDK-native `data-*` parts (`DataUIPart`, payload in
 * `.data`) so they need no cast at the `sendMessage` boundary and survive the
 * client reducer for live rendering. The `data-` prefix is a transport detail;
 * the MARKER (what the model sees) is the clean, explicit name.
 */

/**
 * The user picked a slides template from the gallery. The part's `.data` payload
 * carries LEAN facts — `{ title, slides, system?, bundle_location: "scratch" }` —
 * NOT instructions: the `slides` skill owns "how to use a template". The unzipped
 * `.canvas` bundle rides `scratch_seed` into the session scratch separately.
 */
export const USER_TEMPLATE_SELECTION = "data-user_template_selection";

/** One durable fact about a user-selected file staged into session scratch. */
export type UserFileAttachmentDescriptor = {
  /** User-facing file name. It is display metadata, not a filesystem address. */
  name: string;
  /** Declared media type used for provider-capability lowering. */
  mime: string;
  /** Exact decoded byte count of the staged body. */
  size: number;
  /** Flat scratch-relative path used by filesystem and shell tools. */
  path: string;
};

/** Persisted payload of {@link USER_FILE_ATTACHMENTS}. File order is semantic. */
export type UserFileAttachmentsData = {
  location: "scratch";
  files: readonly UserFileAttachmentDescriptor[];
};

/**
 * The user attached one or more files to the turn. The part's `.data` payload
 * carries LEAN facts — `{ location: "scratch", files: [{ name, mime, size, path }] }`
 * — NOT instructions. `name` is display metadata; `path` is the stable,
 * scratch-relative address. The file BYTES ride `scratch_seed` into session
 * scratch separately and MUST be staged before this part is persisted; the
 * agent reads or extracts them there via filesystem or shell tools (WG
 * `scratch.md` / `binary.md`).
 * Non-image files land here; an inline raster image rides the perceive-only
 * `file` part instead (it needs no tool call to be seen).
 */
export const USER_FILE_ATTACHMENTS = "data-user_file_attachments";

/**
 * Opaque, read-only directory scope the host minted from an affirmative native
 * gesture (drop / picker). `path` is a VIRTUAL agent-fs mount — never the host's
 * absolute path — and `name` is display metadata only. The descriptor is safe
 * to persist, but is not authority by itself: the host-held registry owns the
 * matching grant (WG `compositor.md` §Directory references).
 */
export type DirectoryScopeDescriptor = {
  kind: "scope";
  id: string;
  name: string;
  path: string;
  access: "read";
};

/** Persisted payload of {@link USER_DIRECTORY_REFERENCES}. */
export type UserDirectoryReferencesData = {
  directories: readonly DirectoryScopeDescriptor[];
};

/** Reserved virtual AgentFs namespace for host-held directory references. */
export const DIRECTORY_SCOPE_MOUNT_ROOT = "/__references__" as const;

/**
 * The user referenced one or more existing directories. Descendants remain in
 * place and are discovered lazily through the agent filesystem; nothing is
 * recursively copied into scratch. The payload carries only descriptors. A
 * fresh turn can claim a matching one-shot host grant; replaying this part or
 * copying it into a fork cannot mint authority.
 */
export const USER_DIRECTORY_REFERENCES =
  "data-user_directory_references" as const;

/** Registered on-wire part `type` (`data-*`) → the model-view marker name. */
export const CONTEXT_MARKERS: Readonly<Record<string, string>> = {
  [USER_TEMPLATE_SELECTION]: "user_template_selection",
  [USER_FILE_ATTACHMENTS]: "user_file_attachments",
  [USER_DIRECTORY_REFERENCES]: "user_directory_references",
};
