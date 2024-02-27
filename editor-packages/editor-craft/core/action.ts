import { WidgetType } from "../widgets";

export type CraftAction =
  | NewWidgetAction
  | NewTextWidgetAction
  | DeleteNodeAction;

export type NewTextWidgetAction = {
  type: "(craft)/widget/text/new";
  initial: {
    value: string;
    color: string;
  };
};

export type NewWidgetAction = {
  type: "(craft)/widget/new";
  widget: WidgetType;
};

export type DeleteNodeAction = {
  type: "(craft)/node/delete";
  id?: string;
};
