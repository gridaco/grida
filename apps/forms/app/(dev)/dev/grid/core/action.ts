import type {
  CSSProperties,
  GridaBlock,
  GridaGridImageBlock,
  ObjectFit,
} from "../blocks";

export type Action =
  | UIInsertPanelOpenChangeAction
  | InsertBlock
  //
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

export type StyleAction = {
  type: "block/style";
  id: string;
  style: Partial<CSSProperties>;
};

export type InsertBlock = {
  type: "block/insert";
  id: string;
  data: GridaBlock;
};
