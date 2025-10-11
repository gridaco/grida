import type { editor } from "@/grida-canvas";

export namespace distro {
  export function snapshot_file_name() {
    const now = new Date();
    const date = now.toISOString().split("T")[0];
    const time = now.toLocaleTimeString().replace(/:/g, ".");
    return `Snapshot ${date} at ${time}.grida`;
  }

  export namespace playground {
    export const EMPTY_DOCUMENT: editor.state.IEditorStateInit = {
      editable: true,
      debug: false,
      document: {
        nodes: {},
        scenes: {
          main: {
            type: "scene",
            id: "main",
            name: "main",
            children_refs: [],
            guides: [],
            constraints: {
              children: "multiple",
            },
            backgroundColor: { r: 245, g: 245, b: 245, a: 1 },
          },
        },
      },
    };
  }

  export namespace ui {
    export type UILayoutVariant = "full" | "minimal" | "hidden";
    export type UILayout = {
      sidebar_left: boolean;
      sidebar_right: "hidden" | "visible" | "floating-when-selection";
      toolbar_bottom: boolean;
      help_fab: boolean;
    };

    //
    export const LAYOUT_VARIANTS: Record<UILayoutVariant, UILayout> = {
      hidden: {
        sidebar_left: false,
        sidebar_right: "hidden",
        toolbar_bottom: false,
        help_fab: false,
      },
      minimal: {
        sidebar_left: false,
        sidebar_right: "floating-when-selection",
        toolbar_bottom: true,
        help_fab: true,
      },
      full: {
        sidebar_left: true,
        sidebar_right: "visible",
        toolbar_bottom: true,
        help_fab: true,
      },
    };
  }
}
