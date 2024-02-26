import { WidgetType } from "../widgets";

export type CraftAction = NewWidgetAction | NewTextWidgetAction;

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
