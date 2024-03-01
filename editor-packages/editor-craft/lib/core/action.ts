import type { FontWeight, RGBA } from "@reflect-ui/core";
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
  | CraftNodeOverflowAction
  | CraftNodeAllCornerRadiusAction
  | CraftNodeEachCornerRadiusAction
  | CraftNodeBoxShadowAction
  | CraftNodeBoxSizingAction
  | CraftNodeFlexBoxAction
  | CraftTextAction
  | CraftNodeAddBorderAction
  | CraftNodeBorderWidthAction
  | CraftNewWidgetAction
  | CraftDeleteNodeAction
  | CraftCommitNodeBackgroundAction
  | CraftCommitIconDataAction
  | CraftSrcDataAction;

export type CraftNodeOpacityAction = {
  type: "(craft)/node/opacity";
  opacity: number;
};

export type CraftNodeOverflowAction = {
  type: "(craft)/node/overflow";
  value: "hidden" | "visible";
};

export type CraftNodeAllCornerRadiusAction = {
  type: "(craft)/node/corner-radius/all";
  radius: number;
};

export type CraftNodeEachCornerRadiusAction = {
  type: "(craft)/node/corner-radius/each";
  radius: {
    tl?: number;
    tr?: number;
    br?: number;
    bl?: number;
  };
};

export type CraftNodeAddBorderAction = {
  type: "(craft)/node/border/add";
};

export type CraftNodeBorderWidthAction = {
  type: "(craft)/node/border/width";
  width: number;
};

export type CraftNodeBoxShadowAction =
  | CraftNodeAddBoxShadowAction
  | CraftNodeBoxShadowColorAction
  | CraftNodeBoxShadowBlurRadiusAction
  | CraftNodeBoxShadowOffsetAction
  | CraftNodeBoxShadowSpreadAction;

export type CraftNodeAddBoxShadowAction = {
  type: "(craft)/node/box-shadow/add";
};

export type CraftNodeBoxShadowColorAction = {
  type: "(craft)/node/box-shadow/color";
  color: RGBA;
};

export type CraftNodeBoxShadowBlurRadiusAction = {
  type: "(craft)/node/box-shadow/blur-radius";
  radius: number;
};

export type CraftNodeBoxShadowOffsetAction = {
  type: "(craft)/node/box-shadow/offset";
  dx?: number;
  dy?: number;
};

export type CraftNodeBoxShadowSpreadAction = {
  type: "(craft)/node/box-shadow/spread";
  radius: number;
};

export type CraftNodeFlexBoxAction =
  | CraftNodeFlexDirectionAction
  | CraftNodeFlexGapAction;

export type CraftNodeFlexDirectionAction = {
  type: "(craft)/node/flex/direction";
  direction?: "column" | "row";
};

export type CraftNodeFlexGapAction = {
  type: "(craft)/node/flex/gap";
  gap: number;
};

export type CraftNodeBoxSizingAction =
  | CraftNodeBoxPaddingAction
  | CraftNodeBoxMarginAction;

export type CraftNodeBoxPaddingAction = {
  type: "(craft)/node/box/padding";
  padding: number;
};

export type CraftNodeBoxMarginAction = {
  type: "(craft)/node/box/margin";
  margin: number;
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

export type CraftTextAction =
  | CraftCommitTextChangeAction
  | CraftTextAlignAction
  | CraftTextFontWeightAction
  | CraftTextFontSizeAction;

export type CraftCommitTextChangeAction = {
  type: "(craft)/node/text/data";
  data: string;
};

export type CraftTextAlignAction = {
  type: "(craft)/node/text/align";
  align?: "left" | "center" | "right";
};

export type CraftTextFontWeightAction = {
  type: "(craft)/node/text/font/weight";
  weight: FontWeight;
};

export type CraftTextFontSizeAction = {
  type: "(craft)/node/text/font/size";
  size: number;
};

export type CraftCommitIconDataAction = {
  type: "(craft)/node/icon/data";
  data: string;
};

export type CraftSrcDataAction = {
  type: "(craft)/node/src/data";
  data: string;
};
