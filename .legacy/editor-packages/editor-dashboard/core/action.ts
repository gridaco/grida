export type Action =
  | NewSectionAction
  | MakeDirAction
  | MoveAction
  | FilterAction
  | FoldUnfoldAction
  | FoldUnfoldAllAction;

export type ActionTypes = Action["type"];

export type NewSectionAction = {
  type: "fsv/new-section";
  name: string;
};

export type FilterAction = {
  type: "filter";
  query: string;
};

export type MakeDirAction = {
  type: "fsv/mkdir";
  cwd: string;
  /**
   * name of the directory. if non provided, it will automatically assign a name like "Untitled 1"
   */
  name?: string;
};

export type MoveAction = {
  type: "fsv/mv";
  source: string[];
  dest: string;
};

export type FoldUnfoldAllAction = FoldAllAction | UnfoldAllAction;

export type FoldAllAction = {
  type: "fsv/fold-all";
};

export type UnfoldAllAction = {
  type: "fsv/unfold-all";
};

export type FoldUnfoldAction = FoldAction | UnfoldAction;

export type FoldAction = {
  type: "fsv/fold";
  path: string;
};

export type UnfoldAction = {
  type: "fsv/unfold";
  path: string;
};
