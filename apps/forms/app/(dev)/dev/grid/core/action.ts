import { GridaBlock } from "../blocks";

export type Action =
  | UIInsertPanelOpenChangeAction
  | TextDataAction
  | InsertBlock;

export type UIInsertPanelOpenChangeAction = {
  type: "ui/panels/insert/open";
  open: boolean;
};

export type TextDataAction = {
  type: "block/text/data";
  id: string;
  data: string;
};

export type InsertBlock = {
  type: "block/insert";
  id: string;
  data: GridaBlock;
};
