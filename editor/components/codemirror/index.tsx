/**
 * Thin, owned React binding for CodeMirror 6.
 *
 * Deliberately NOT `@uiw/react-codemirror` — CodeMirror 6 is built to be
 * embedded directly (create an `EditorView` from an `EditorState`, mount it
 * to a node, reconfigure live via `Compartment`s). A third-party React
 * wrapper only adds a lagging abstraction over that; we own this binding
 * instead. Sibling of `components/monaco/index.tsx`.
 *
 * Contract: the view owns the document once mounted. `initialValue` seeds it;
 * later external replacements (reload-from-disk) go through the imperative
 * `setValue` handle, never a controlled `value` prop — so a re-render can
 * never clobber what the user is typing. `onDocChange` fires on
 * document-changing transactions only (not selection moves), which is what a
 * dirty-tracking host wants.
 *
 * Find: this is not a full IDE, so there is NO find/replace. We can't merely
 * hide CodeMirror's panel — its `findNext`/`findPrevious` commands call
 * `openSearchPanel` whenever the query is empty (see `searchCommand` in
 * @codemirror/search), so the panel is intrinsic to those commands. Instead we
 * own the whole thing: a tiny query `StateField` drives a match highlighter
 * and selection-based navigation, and `basicSetup`'s search keys are overridden
 * at highest precedence so nothing can reach `openSearchPanel`.
 */
"use client";

import {
  forwardRef,
  type KeyboardEvent as ReactKeyboardEvent,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from "react";
import {
  Compartment,
  EditorState,
  Prec,
  RangeSetBuilder,
  StateEffect,
  StateField,
  type Extension,
} from "@codemirror/state";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  keymap,
  ViewPlugin,
  type ViewUpdate,
} from "@codemirror/view";
import { indentWithTab } from "@codemirror/commands";
import { oneDark } from "@codemirror/theme-one-dark";
import { basicSetup } from "codemirror";
import {
  ChevronDownIcon,
  ChevronUpIcon,
  SearchIcon,
  XIcon,
} from "lucide-react";
import { cn } from "@app/ui/lib/utils";

export type CodeMirrorHandle = {
  /** Current document text (the serialization — markdown/text is identity). */
  getValue(): string;
  /** Replace the whole document, e.g. reload-from-disk. */
  setValue(next: string): void;
  focus(): void;
  /** Escape hatch for callers needing the raw view. Null before mount. */
  readonly view: EditorView | null;
};

export type CodeMirrorEditorProps = {
  initialValue: string;
  /** Language support — `markdown()` or a lazily-resolved `LanguageSupport`.
   * Swapped through a compartment without tearing down the view. */
  language?: Extension;
  readOnly?: boolean;
  /** Dark theme when true (One Dark), light otherwise. The host owns theme
   * selection (e.g. next-themes) and passes it down, so this binding carries no
   * app-provider dependency. */
  dark?: boolean;
  /** Fired on every document-changing transaction (not selection-only). */
  onDocChange?: () => void;
  autoFocus?: boolean;
  className?: string;
};

/** Fill the pane, blend with the surrounding surface, kill the focus ring.
 * The gutter gets an opaque background (not transparent) so it masks the
 * content sliding under it during horizontal scroll. */
const baseTheme = EditorView.theme({
  "&": { height: "100%", fontSize: "13px", backgroundColor: "transparent" },
  "&.cm-focused": { outline: "none" },
  ".cm-scroller": {
    overflow: "auto",
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, Consolas, monospace",
  },
  ".cm-gutters": { backgroundColor: "var(--background)", border: "none" },
  ".cm-searchMatch": { backgroundColor: "rgba(250, 204, 21, 0.4)" },
});

const themeExtension = (dark: boolean): Extension => (dark ? oneDark : []);

/* ───────────────────────── owned find ───────────────────────── */

/** The active find term (literal, case-insensitive). Empty = nothing to find. */
const setFindTerm = StateEffect.define<string>();
const findTermField = StateField.define<string>({
  create: () => "",
  update(value, tr) {
    for (const e of tr.effects) if (e.is(setFindTerm)) value = e.value;
    return value;
  },
});

/** Literal, case-insensitive offsets of `needle` in `haystack`. */
function findOffsets(haystack: string, needle: string): number[] {
  if (!needle) return [];
  const hay = haystack.toLowerCase();
  const term = needle.toLowerCase();
  const out: number[] = [];
  let i = hay.indexOf(term);
  while (i !== -1) {
    out.push(i);
    i = hay.indexOf(term, i + term.length);
  }
  return out;
}

const matchMark = Decoration.mark({ class: "cm-searchMatch" });

function buildMatchDecorations(view: EditorView): DecorationSet {
  const term = view.state.field(findTermField);
  if (!term) return Decoration.none;
  const builder = new RangeSetBuilder<Decoration>();
  for (const { from, to } of view.visibleRanges) {
    const slice = view.state.doc.sliceString(from, to);
    for (const off of findOffsets(slice, term)) {
      builder.add(from + off, from + off + term.length, matchMark);
    }
  }
  return builder.finish();
}

const findHighlighter = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = buildMatchDecorations(view);
    }
    update(u: ViewUpdate) {
      if (
        u.docChanged ||
        u.viewportChanged ||
        u.state.field(findTermField) !== u.startState.field(findTermField)
      ) {
        this.decorations = buildMatchDecorations(u.view);
      }
    }
  },
  { decorations: (v) => v.decorations }
);

/** Move the selection to the next/prev match of the active term, wrapping
 * around. Always returns `true` (handled) so a bound key can never fall
 * through to a command that would open the built-in panel. */
function gotoMatch(view: EditorView, dir: 1 | -1): boolean {
  const term = view.state.field(findTermField);
  if (!term) return true;
  const offsets = findOffsets(view.state.doc.toString(), term);
  if (!offsets.length) return true;
  const { from, to } = view.state.selection.main;
  const target =
    dir === 1
      ? (offsets.find((o) => o >= to) ?? offsets[0])
      : ([...offsets].reverse().find((o) => o + term.length <= from) ??
        offsets[offsets.length - 1]);
  view.dispatch({
    selection: { anchor: target, head: target + term.length },
    scrollIntoView: true,
  });
  return true;
}

const navBtnCls =
  "rounded p-1 text-muted-foreground hover:bg-muted hover:text-foreground";

export const CodeMirrorEditor = forwardRef<
  CodeMirrorHandle,
  CodeMirrorEditorProps
>(function CodeMirrorEditor(
  {
    initialValue,
    language,
    readOnly = false,
    dark = false,
    onDocChange,
    autoFocus,
    className,
  },
  ref
) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  // Held in refs so the once-created listeners always see the latest values
  // without recreating the view.
  const onDocChangeRef = useRef(onDocChange);
  onDocChangeRef.current = onDocChange;
  const openFindRef = useRef<() => void>(() => {});

  // One compartment per live-reconfigurable concern.
  const languageRef = useRef(new Compartment());
  const themeRef = useRef(new Compartment());
  const readOnlyRef = useRef(new Compartment());

  const [findOpen, setFindOpen] = useState(false);
  const [findValue, setFindValue] = useState("");
  const findInputRef = useRef<HTMLInputElement>(null);
  openFindRef.current = () => setFindOpen(true);

  // Mount once. The view is the source of truth for the document afterwards;
  // later prop changes are applied through the compartment effects below,
  // never by recreating the view (which would drop edits / cursor / history).
  useEffect(() => {
    if (!hostRef.current) return;
    const view = new EditorView({
      parent: hostRef.current,
      state: EditorState.create({
        doc: initialValue,
        extensions: [
          basicSetup,
          findTermField,
          findHighlighter,
          // Own every key that would otherwise open CodeMirror's find/replace
          // (or go-to-line) panel from `basicSetup`'s search keymap.
          Prec.highest(
            keymap.of([
              {
                key: "Mod-f",
                preventDefault: true,
                run: () => {
                  openFindRef.current();
                  return true;
                },
              },
              {
                key: "Mod-g",
                preventDefault: true,
                run: (v) => gotoMatch(v, 1),
              },
              {
                key: "Shift-Mod-g",
                preventDefault: true,
                run: (v) => gotoMatch(v, -1),
              },
              { key: "F3", preventDefault: true, run: (v) => gotoMatch(v, 1) },
              {
                key: "Shift-F3",
                preventDefault: true,
                run: (v) => gotoMatch(v, -1),
              },
              { key: "Mod-Alt-g", run: () => true },
            ])
          ),
          keymap.of([indentWithTab]),
          baseTheme,
          languageRef.current.of(language ?? []),
          themeRef.current.of(themeExtension(dark)),
          readOnlyRef.current.of(EditorState.readOnly.of(readOnly)),
          EditorView.updateListener.of((u) => {
            if (u.docChanged) onDocChangeRef.current?.();
          }),
        ],
      }),
    });
    viewRef.current = view;
    if (autoFocus) view.focus();
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Live reconfiguration — no remount, edits preserved.
  useEffect(() => {
    viewRef.current?.dispatch({
      effects: languageRef.current.reconfigure(language ?? []),
    });
  }, [language]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: themeRef.current.reconfigure(themeExtension(dark)),
    });
  }, [dark]);

  useEffect(() => {
    viewRef.current?.dispatch({
      effects: readOnlyRef.current.reconfigure(
        EditorState.readOnly.of(readOnly)
      ),
    });
  }, [readOnly]);

  useEffect(() => {
    if (findOpen) findInputRef.current?.select();
  }, [findOpen]);

  useImperativeHandle(
    ref,
    () => ({
      getValue: () => viewRef.current?.state.doc.toString() ?? "",
      setValue: (next: string) => {
        const view = viewRef.current;
        if (!view) return;
        view.dispatch({
          changes: { from: 0, to: view.state.doc.length, insert: next },
        });
      },
      focus: () => viewRef.current?.focus(),
      get view() {
        return viewRef.current;
      },
    }),
    []
  );

  const runFind = useCallback((term: string) => {
    viewRef.current?.dispatch({ effects: setFindTerm.of(term) });
  }, []);

  const closeFind = useCallback(() => {
    setFindOpen(false);
    setFindValue("");
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({ effects: setFindTerm.of("") }); // clear highlights
    view.focus();
  }, []);

  const onFindKeyDown = useCallback(
    (e: ReactKeyboardEvent<HTMLInputElement>) => {
      const view = viewRef.current;
      if (e.key === "Escape") {
        e.preventDefault();
        closeFind();
      } else if (e.key === "Enter") {
        e.preventDefault();
        if (view) gotoMatch(view, e.shiftKey ? -1 : 1);
      }
    },
    [closeFind]
  );

  return (
    <div className={cn("relative h-full w-full", className)}>
      <div ref={hostRef} className="h-full w-full" />
      {findOpen && (
        <div className="absolute right-2 top-2 z-20 flex items-center gap-0.5 rounded-md border bg-background/95 py-0.5 pl-2 pr-1 shadow-md backdrop-blur-sm">
          <SearchIcon
            className="size-3.5 shrink-0 text-muted-foreground"
            aria-hidden
          />
          <input
            ref={findInputRef}
            value={findValue}
            onChange={(e) => {
              setFindValue(e.target.value);
              runFind(e.target.value);
            }}
            onKeyDown={onFindKeyDown}
            placeholder="Find"
            aria-label="Find in file"
            spellCheck={false}
            className="h-6 w-44 bg-transparent px-1 text-xs outline-none placeholder:text-muted-foreground"
          />
          <button
            type="button"
            aria-label="Previous match"
            className={navBtnCls}
            onClick={() => {
              const v = viewRef.current;
              if (v) gotoMatch(v, -1);
            }}
          >
            <ChevronUpIcon className="size-3.5" />
          </button>
          <button
            type="button"
            aria-label="Next match"
            className={navBtnCls}
            onClick={() => {
              const v = viewRef.current;
              if (v) gotoMatch(v, 1);
            }}
          >
            <ChevronDownIcon className="size-3.5" />
          </button>
          <button
            type="button"
            aria-label="Close find"
            className={navBtnCls}
            onClick={closeFind}
          >
            <XIcon className="size-3.5" />
          </button>
        </div>
      )}
    </div>
  );
});
