import produce from "immer";
import { Action, editor } from ".";
import reducer from "./reducers";
import grida from "@grida/schema";

export class Editor {
  private listeners: Set<(editor: this, action?: Action) => void>;
  private mstate: editor.state.IEditorState;

  constructor(initialState: editor.state.IEditorStateInit) {
    this.listeners = new Set();
    this.mstate = editor.state.init(initialState);
  }

  private _locked: boolean = false;

  get locked() {
    return this._locked;
  }

  set locked(value: boolean) {
    this._locked = value;
  }

  get debug() {
    return this.mstate.debug;
  }

  set debug(value: boolean) {
    this.mstate = produce(this.mstate, (draft) => {
      draft.debug = value;
    });
    this.listeners.forEach((l) => l(this));
  }

  public toggleDebug() {
    this.debug = !this.debug;
    return this.debug;
  }

  public reset(state: editor.state.IEditorState, force: boolean = false) {
    this.dispatch(
      {
        type: "__internal/reset",
        state,
      },
      force
    );
  }

  public insert(
    payload:
      | {
          id?: string;
          prototype: grida.program.nodes.NodePrototype;
        }
      | {
          document: grida.program.document.IPackedSceneDocument;
        }
  ) {
    this.dispatch({
      type: "insert",
      ...payload,
    });
  }

  public dispatch(action: Action, force: boolean = false) {
    if (this._locked && !force) return;
    this.mstate = reducer(this.mstate, action);
    this.listeners.forEach((l) => l(this, action));
  }

  public subscribe(fn: (editor: this, action?: Action) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  public getSnapshot() {
    return this.mstate;
  }

  public getJson(): unknown {
    return JSON.parse(JSON.stringify(this.mstate));
  }

  public getDocumentJson(): unknown {
    return JSON.parse(JSON.stringify(this.mstate.document));
  }
}
