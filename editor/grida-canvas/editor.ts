import { Action, editor } from ".";
import reducer from "./reducers";

export class Editor {
  private listeners: Set<() => void>;
  private mstate: editor.state.IEditorState;

  constructor(initialState: editor.state.IEditorStateInit) {
    this.listeners = new Set();
    this.mstate = editor.state.init(initialState);
  }

  dispatch(action: Action) {
    const prev = this.mstate;
    this.mstate = reducer(prev, action);
    this.listeners.forEach((l) => l());
  }

  subscribe(fn: () => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  getSnapshot() {
    return this.mstate;
  }

  getJson(): unknown {
    return JSON.parse(JSON.stringify(this.mstate));
  }

  getDocumentJson(): unknown {
    return JSON.parse(JSON.stringify(this.mstate.document));
  }
}
