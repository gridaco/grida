"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import type cmath from "@grida/cmath";
import { createSvgEditor, type SvgEditor } from "./core/editor";
import { attach_dom_surface, type DomSurfaceHandle } from "./dom";
import type {
  EditorState,
  EditorStyle,
  Mode,
  NodeId,
  Paint,
  PaintPreviewSession,
  PreviewSession,
  Providers,
  Tool,
} from "./types";

// ─── Context ───────────────────────────────────────────────────────────────

const SvgEditorContext = createContext<SvgEditor | null>(null);

export type SvgEditorProviderProps = {
  /**
   * Initial document for the editor. Read **once** on first render —
   * subsequent changes to this prop are silently ignored. For live updates
   * (file open, page switch, reset to a snapshot), pull the editor from
   * context with `useSvgEditor()` and call `editor.load(...)` imperatively.
   *
   * This is the same shape Lexical (`initialConfig.editorState`), Slate
   * (`initialValue`), and TipTap (`content` option) settled on for the
   * same reason: a reactive document prop creates a feedback loop with the
   * editor's own emissions. The editor instance is the source of truth
   * for the document during a session; React state is not.
   */
  initialSvg: string;
  providers?: Providers;
  style?: Partial<EditorStyle>;
  children: ReactNode;
};

/**
 * Owns the headless editor and exposes it via context. The editor is created
 * once on first render with `initialSvg`; subsequent changes to that prop are
 * silently ignored. To replace the document at runtime, call
 * `useSvgEditor().load(...)` imperatively, or remount the provider with a
 * different `key`.
 */
export function SvgEditorProvider({
  initialSvg,
  providers,
  style,
  children,
}: SvgEditorProviderProps) {
  const editor_ref = useRef<SvgEditor | null>(null);
  if (editor_ref.current === null) {
    editor_ref.current = createSvgEditor({
      svg: initialSvg,
      providers,
      style,
    });
  }
  const editor = editor_ref.current;

  // Dispose on unmount.
  useEffect(() => {
    return () => {
      editor.dispose();
    };
  }, [editor]);

  return (
    <SvgEditorContext.Provider value={editor}>
      {children}
    </SvgEditorContext.Provider>
  );
}

// ─── Canvas ────────────────────────────────────────────────────────────────

export type SvgEditorCanvasProps = {
  className?: string;
  style?: React.CSSProperties;
  /**
   * Install the default gesture set. Default `true`. See
   * `DomSurfaceOptions.gestures`.
   */
  gestures?: boolean;
  /**
   * Auto-fit the document on initial attach. Default `false`. See
   * `DomSurfaceOptions.fit`.
   */
  fit?: boolean;
  /** Initial camera transform. Default identity. */
  initial_camera?: cmath.Transform;
  /**
   * Receives the `DomSurfaceHandle` once the surface is attached, and
   * `null` on unmount/detach. Use this to thread `handle.camera` /
   * `handle.gestures` into surrounding chrome (toolbars, badges, etc.).
   */
  onAttach?: (handle: DomSurfaceHandle | null) => void;
};

/**
 * Renders the editor's SVG into a `div` and wires it to the DOM surface.
 *
 * Internally calls `attach_dom_surface(editor, { container, ... })` on
 * mount and `handle.detach()` on unmount. Surface-scoped concerns (camera,
 * gestures) are reached via the `onAttach` callback — there is no global
 * context for them, because a host may mount multiple canvases in the
 * same editor session.
 */
export function SvgEditorCanvas({
  className,
  style,
  gestures,
  fit,
  initial_camera,
  onAttach,
}: SvgEditorCanvasProps) {
  const editor = useSvgEditor();
  const ref = useRef<HTMLDivElement | null>(null);
  // Latest onAttach in a ref so re-attach isn't triggered by callback identity.
  const on_attach_ref = useRef(onAttach);
  on_attach_ref.current = onAttach;
  // Same for `initial_camera` — one-shot at attach time, never re-applied.
  const initial_camera_ref = useRef(initial_camera);
  initial_camera_ref.current = initial_camera;
  useEffect(() => {
    const container = ref.current;
    if (!container) return;
    const handle = attach_dom_surface(editor, {
      container,
      gestures,
      fit,
      initial_camera: initial_camera_ref.current,
    });
    on_attach_ref.current?.(handle);
    return () => {
      on_attach_ref.current?.(null);
      handle.detach();
    };
  }, [editor, gestures, fit]);
  return <div ref={ref} className={className} style={style} />;
}

// ─── Hooks ─────────────────────────────────────────────────────────────────

export function useSvgEditor(): SvgEditor {
  const editor = useContext(SvgEditorContext);
  if (editor === null) {
    throw new Error("useSvgEditor must be used inside a <SvgEditorProvider>.");
  }
  return editor;
}

/**
 * Subscribe to a slice of `editor.state`. Re-renders when the selected slice
 * changes by reference (or by the supplied `equals` function).
 */
export function useEditorState<T>(
  selector: (state: EditorState) => T,
  equals: (a: T, b: T) => boolean = Object.is
): T {
  const editor = useSvgEditor();
  const last_ref = useRef<{ has: boolean; value: T }>({
    has: false,
    value: undefined as unknown as T,
  });
  return useSyncExternalStore(
    (cb) => editor.subscribe(cb),
    () => {
      const next = selector(editor.state);
      if (!last_ref.current.has || !equals(last_ref.current.value, next)) {
        last_ref.current = { has: true, value: next };
      }
      return last_ref.current.value;
    },
    () => selector(editor.state)
  );
}

/**
 * Sugar for `useSvgEditor().commands`. The returned object is stable across
 * re-renders (commands themselves don't change identity).
 */
export function useCommands() {
  const editor = useSvgEditor();
  return useMemo(() => editor.commands, [editor]);
}

/**
 * Subscribe to a slice of `handle.camera` from a `DomSurfaceHandle`. Pass
 * the handle (or null if it isn't attached yet) and a selector that reads
 * what you need from the camera. The returned value updates on every
 * camera mutation — does NOT bump `editor.state.version`.
 *
 * Typical use: zoom badge in a toolbar.
 *
 * ```tsx
 * const zoom = useCameraSnapshot(handle, (c) => c.zoom, 1);
 * return <div>{Math.round(zoom * 100)}%</div>;
 * ```
 *
 * The `fallback` is what's returned when `handle` is `null` (before mount /
 * after detach). It's also the SSR snapshot value — anything that won't
 * mismatch with the first client render.
 */
export function useCameraSnapshot<T>(
  handle: DomSurfaceHandle | null,
  selector: (camera: DomSurfaceHandle["camera"]) => T,
  fallback: T
): T {
  return useSyncExternalStore(
    (cb) => handle?.camera.subscribe(cb) ?? (() => {}),
    () => (handle ? selector(handle.camera) : fallback),
    () => fallback
  );
}

// ─── State-slice helpers ───────────────────────────────────────────────────
//
// One-line selectors over `useEditorState`. Richer slices (paint,
// gradients, geometry) stay as consumer-side recipes per README §"React
// API" P6.

/** Current selection (frozen, identity-stable across no-op emits). */
export function useSelection(): readonly NodeId[] {
  return useEditorState((s) => s.selection);
}

/** Active tool. Identity-stable when `set_tool` is a no-op. */
export function useTool(): Tool {
  return useEditorState((s) => s.tool);
}

/** Current mode (`"select"` | `"edit-content"`). */
export function useMode(): Mode {
  return useEditorState((s) => s.mode);
}

/**
 * What kind of content-edit is active, or `null` when not in content-edit.
 *
 * Symmetric with `useMode()` but at a finer grain — resolves whether the
 * single selected node is a path or a text node so consumers (e.g. the
 * vector-edit toolbar) can render the right affordances. Mirrors the
 * dispatch logic in the host's `enter_content_edit` router which checks
 * `tag_of(id) === "path"` vs `"text" / "tspan"`.
 *
 * Returns `null` for the (defensive) case of `edit-content` with no
 * selection, and for any tag that's neither path nor text.
 */
export function useContentEditKind(): "path" | "text" | null {
  const editor = useSvgEditor();
  // Combine mode + selection[0] into a single key so we re-resolve only
  // when either changes — `editor.tree()` is then read outside the slice
  // (it has its own structure-version, but we don't need to subscribe to
  // it; consecutive resolutions hit the same TreeNode pool entries).
  const key = useEditorState(
    (s) => `${s.mode}::${s.selection[0] ?? ""}`,
    (a, b) => a === b
  );
  const [mode, id] = key.split("::") as [Mode, string];
  if (mode !== "edit-content" || !id) return null;
  const tag = editor.tree().nodes.get(id)?.tag;
  if (tag === "path") return "path";
  if (tag === "text" || tag === "tspan") return "text";
  return null;
}

/** Whether the history stack has an undoable entry. */
export function useCanUndo(): boolean {
  return useEditorState((s) => s.can_undo);
}

/** Whether the history stack has a redoable entry. */
export function useCanRedo(): boolean {
  return useEditorState((s) => s.can_redo);
}

// ─── Hook-owned preview sessions ───────────────────────────────────────────
//
// Wrap `commands.preview_paint` / `commands.preview_property` with a
// React-lifecycle-aware shell. Contract: unmount = `discard()` (never
// commit). The host calls `commit()` on pointer-up / blur / Enter; if
// the component unmounts before that fires, the session rolls back.
//
// The session reference returned by these hooks is stable across
// renders within one key, so callers can store `preview.update` in
// event handlers without breaking gesture continuity. `commit()` /
// `discard()` clear the underlying session; the next `update()`
// lazily opens a fresh one — picker open → commit → reopen works
// without a remount.

function use_lifecycle_session<S extends { discard(): void }>(
  open: () => S,
  deps: React.DependencyList
): {
  ensure(): S;
  finalize(action: "commit" | "discard", commit: (s: S) => void): void;
} {
  const sessionRef = useRef<S | null>(null);
  const ops = useMemo(
    () => ({
      ensure(): S {
        if (!sessionRef.current) sessionRef.current = open();
        return sessionRef.current;
      },
      finalize(action: "commit" | "discard", commit: (s: S) => void): void {
        const s = sessionRef.current;
        if (!s) return;
        sessionRef.current = null;
        if (action === "commit") commit(s);
        else s.discard();
      },
    }),
    // `deps` is a forwarded `React.DependencyList` from the caller; the
    // rule wants an array literal here so it can statically check it. The
    // call sites below pass literal deps that React does inspect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    deps
  );
  useEffect(() => {
    return () => ops.finalize("discard", () => {});
    // ops identity changes with deps; re-arm cleanup accordingly.
  }, [ops]);
  return ops;
}

/** Hook-owned `PaintPreviewSession`. See block comment above. */
export function usePaintPreview(
  channel: "fill" | "stroke"
): PaintPreviewSession {
  const editor = useSvgEditor();
  const lc = use_lifecycle_session(
    () => editor.commands.preview_paint(channel),
    [editor, channel]
  );
  return useMemo<PaintPreviewSession>(
    () => ({
      update: (paint: Paint) => lc.ensure().update(paint),
      commit: () => lc.finalize("commit", (s) => s.commit()),
      discard: () => lc.finalize("discard", () => {}),
    }),
    [lc]
  );
}

/** Hook-owned `PreviewSession` for a CSS/SVG property. See block comment above. */
export function usePropertyPreview(name: string): PreviewSession {
  const editor = useSvgEditor();
  const lc = use_lifecycle_session(
    () => editor.commands.preview_property(name),
    [editor, name]
  );
  return useMemo<PreviewSession>(
    () => ({
      update: (value: string) => lc.ensure().update(value),
      commit: () => lc.finalize("commit", (s) => s.commit()),
      discard: () => lc.finalize("discard", () => {}),
    }),
    [lc]
  );
}

// ─── Bound action callbacks ────────────────────────────────────────────────

/** Bound `editor.load(svg)`. Stable across renders. */
export function useEditorLoad(): (svg: string) => void {
  const editor = useSvgEditor();
  return useCallback((svg: string) => editor.load(svg), [editor]);
}

/** Bound `editor.serialize()`. Stable across renders. */
export function useEditorSerialize(): () => string {
  const editor = useSvgEditor();
  return useCallback(() => editor.serialize(), [editor]);
}

// ─── Hover override (RAII) ────────────────────────────────────────────────

/**
 * Push a hover override into the HUD surface — e.g. when the user hovers
 * a row in a layers panel. The HUD will render the override's outline.
 *
 * Pass `null` to clear and let the pointer pick take over again. On
 * unmount, the hook clears any override it set last so the canvas
 * doesn't stay highlighted on a node that no longer has a panel row.
 */
export function useHoverOverride(): (id: NodeId | null) => void {
  const editor = useSvgEditor();
  const lastSetRef = useRef<NodeId | null>(null);
  useEffect(() => {
    return () => {
      // If we set the current override, clear it. Don't clobber an
      // override set by another component (the editor's
      // set_surface_hover_override is global, but we're being polite).
      if (
        lastSetRef.current !== null &&
        editor.surface_hover() === lastSetRef.current
      ) {
        editor.set_surface_hover_override(null);
      }
    };
  }, [editor]);
  return useCallback(
    (id: NodeId | null) => {
      lastSetRef.current = id;
      editor.set_surface_hover_override(id);
    },
    [editor]
  );
}
