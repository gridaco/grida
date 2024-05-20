import { GridaBlock } from "../blocks";

export type Action =
  | UIInsertPanelOpenChangeAction
  | InsertBlock
  //
  | MediaSrcAction
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

export type InsertBlock = {
  type: "block/insert";
  id: string;
  data: GridaBlock;
};
