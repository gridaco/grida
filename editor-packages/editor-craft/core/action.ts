import type { RGBA } from "@reflect-ui/core";
import { WidgetType } from "../widgets";

export type CraftAction = CraftDraftAction | CraftHistoryAction;

export type CraftDraftAction =
  | CraftPreviewNodeBackgroundColorAction
  | CraftPreviewNodeForegroundColorAction
  | CraftPreviewNodeBorderColorAction;

export type CraftPreviewNodeBackgroundColorAction = {
  type: "(draft)/(craft)/node/background-color";
  color: RGBA;
};

export type CraftPreviewNodeForegroundColorAction = {
  type: "(draft)/(craft)/node/foreground-color";
  color: RGBA;
};

export type CraftPreviewNodeBorderColorAction = {
  type: "(draft)/(craft)/node/border/color";
  color: RGBA;
};

export type CraftHistoryAction =
  | CraftNodeOpacityAction
  | CraftNodeCornerRadiusAction
  | CraftNodeAddBorderAction
  | CraftNodeBorderWidthAction
  | CraftNewWidgetAction
  | CraftDeleteNodeAction
  | CraftCommitNodeBackgroundAction
  | CraftCommitTextChangeAction
  | CraftCommitIconDataAction;

export type CraftNodeOpacityAction = {
  type: "(craft)/node/opacity";
  opacity: number;
};

export type CraftNodeCornerRadiusAction = {
  type: "(craft)/node/corners";
  radius: number;
};

export type CraftNodeAddBorderAction = {
  type: "(craft)/node/border/add";
};

export type CraftNodeBorderWidthAction = {
  type: "(craft)/node/border/width";
  width: number;
};

export type CraftNewWidgetAction = {
  type: "(craft)/widget/new";
  widget: WidgetType;
};

export type CraftDeleteNodeAction = {
  type: "(craft)/node/delete";
  id?: string;
};

export type CraftCommitNodeBackgroundAction = {
  type: "(craft)/node/background-color";
  color: RGBA;
};

export type CraftCommitTextChangeAction = {
  type: "(craft)/node/text/data";
  data: string;
};

export type CraftCommitIconDataAction = {
  type: "(craft)/node/icon/data";
  data: string;
};
