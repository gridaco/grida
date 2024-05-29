import type {
  CSSProperties,
  GridaBlock,
  GridaGridImageBlock,
  ObjectFit,
  TypographyCSSProperties,
} from "../blocks";

export type Action =
  | UIInsertPanelOpenChangeAction
  | InsertBlock
  | DeleteBlock
  //
  | TagAction
  | StyleAction
  | MediaSrcAction
  | ObjectFitAction
  | TextDataAction;

export type UIInsertPanelOpenChangeAction = {
  type: "ui/insert-panel/open";
  open: boolean;
};

export type TextDataAction = {
  type: "block/text/data";
  id: string;
  data: string;
};

export type MediaSrcAction = {
  type: "block/media/src";
  id: string;
  src: string;
};

export type ObjectFitAction = {
  type: "block/media/object-fit";
  id: string;
  objectFit: ObjectFit;
};

export type TagAction = {
  type: "block/tag";
  id: string;
  tag: string;
};

export type StyleAction = {
  type: "block/style";
  id: string;
  style: Partial<CSSProperties | TypographyCSSProperties>;
};

export type InsertBlock = {
  type: "block/insert";
  id: string;
  data: GridaBlock;
};

export type DeleteBlock = {
  type: "block/delete";
  id: string;
};
