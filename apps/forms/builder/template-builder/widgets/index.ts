import { ComponentWidget } from "./component";
import { ContainerWidget } from "./container";
import { FlexWidget } from "./flex";
import { GridWidget } from "./grid";
import { IconWidget } from "./icon";
import { LayerkWidget } from "./layer";
import { LayoutWidget } from "./layout";
import { LinkWidget } from "./link";
import { RichTextWidget } from "./richtext";
import { SlotWidget } from "./slot";
import { SvgWidget } from "./svg";
import { TextWidget } from "./text";
import { ThemeWidget } from "./theme";

export namespace TemplateBuilderWidgets {
  export const Container = ContainerWidget;
  export const Component = ComponentWidget;
  export const Flex = FlexWidget;
  export const Grid = GridWidget;
  export const Icon = IconWidget;
  export const Layer = LayerkWidget;
  export const Layout = LayoutWidget;
  export const Link = LinkWidget;
  export const RichText = RichTextWidget;
  export const Slot = SlotWidget;
  export const Svg = SvgWidget;
  export const Text = TextWidget;
  export const Theme = ThemeWidget;
}
