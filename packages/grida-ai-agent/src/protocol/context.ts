/**
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

/** Registered on-wire part `type` (`data-*`) → the model-view marker name. */
export const CONTEXT_MARKERS: Readonly<Record<string, string>> = {
  [USER_TEMPLATE_SELECTION]: "user_template_selection",
};
