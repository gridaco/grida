export type Action = NewSectionAction | NewFolderAction | FilterAction;

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
