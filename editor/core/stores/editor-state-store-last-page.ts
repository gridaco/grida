import { EditorState } from "core/states";

export const last_page_by_mode = {
  get: (mode: EditorState["mode"]["value"]): string | null => {
    return localStorage.getItem("editor-state-store/lastpage-of-mode-" + mode);
  },
  set: (mode: EditorState["mode"]["value"], page: string) => {
    localStorage.setItem("editor-state-store/lastpage-of-mode-" + mode, page);
  },
};
