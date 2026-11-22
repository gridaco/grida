import { NativeEditorSurfaces } from "@grida/desktop-bridge";
import type { SvgEditor } from "@grida/svg-editor";
import { EditorSelection } from "./editor-selection";

type SelectionSource = {
  read(): EditorSelection.Surface | undefined;
  clear(): void;
};

/** Live selection sources registered under the owning window or tab. */
export class EditorSelectionSurface {
  private readonly sources = new Map<string, SelectionSource>();
  private readonly listeners = new Set<() => void>();

  constructor(
    private readonly activeKey: () => string | null,
    private readonly observeActive?: (listener: () => void) => () => void
  ) {}

  private active(): SelectionSource | undefined {
    const key = this.activeKey();
    if (key !== null) return this.sources.get(key);
  }

  readonly subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    const stop = this.observeActive?.(listener);
    return () => {
      this.listeners.delete(listener);
      stop?.();
    };
  };

  readonly selection = new EditorSelection(
    () => this.active()?.read(),
    this.subscribe,
    () => this.active()?.clear()
  );

  bindSvg(
    key: string,
    path: string,
    editor: SvgEditor
  ): (() => void) | undefined {
    if (!NativeEditorSurfaces.isSvgPath(path)) return;
    const surface = {
      editor,
      basis: {},
      subject: { kind: "svg", path },
    } as const;
    return this.bind(key, {
      read: () => surface,
      clear: () => {
        if (editor.state.mode === "select") editor.commands.deselect();
        else if (editor.state.mode === "edit-content")
          editor.commands.set_vector_selection({});
      },
    });
  }

  bindDocument(
    key: string,
    source: {
      read(): EditorSelection.Document | undefined;
      clear(): void;
      subscribe(listener: () => void): () => void;
    }
  ): () => void {
    const basis = {};
    return this.bind(
      key,
      {
        read: () => {
          const document = source.read();
          if (document) return { ...document, basis };
        },
        clear: () => source.clear(),
      },
      (listener) => source.subscribe(listener)
    );
  }

  private bind(
    key: string,
    source: SelectionSource,
    subscribe?: (listener: () => void) => () => void
  ): () => void {
    this.sources.set(key, source);
    const stop = subscribe?.(() => {
      if (this.sources.get(key) === source) this.changed(key);
    });
    this.changed(key);
    return () => {
      stop?.();
      if (this.sources.get(key) !== source) return;
      this.sources.delete(key);
      this.changed(key);
    };
  }

  private changed(key: string): void {
    if (this.activeKey() !== key) return;
    for (const listener of this.listeners) listener();
  }
}
