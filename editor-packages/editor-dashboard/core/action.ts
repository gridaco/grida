export type Action =
  | NewSectionAction
  | NewFolderAction
  | FilterAction
  | FoldUnfoldAction
  | FoldUnfoldAllAction;

export type ActionTypes = Action["type"];

export type NewSectionAction = {
  type: "hierarchy/new-section";
  name: string;
};

export type FilterAction = {
  type: "filter";
  query: string;
};

export type NewFolderAction = {
  type: "hierarchy/new-directory";
  path: string;
};

export type FoldUnfoldAllAction = FoldAllAction | UnfoldAllAction;

export type FoldAllAction = {
  type: "hierarchy/fold-all";
};

export type UnfoldAllAction = {
  type: "hierarchy/unfold-all";
};

export type FoldUnfoldAction = FoldAction | UnfoldAction;

export type FoldAction = {
  type: "hierarchy/fold";
  path: string;
};

export type UnfoldAction = {
  type: "hierarchy/unfold";
  path: string;
};
