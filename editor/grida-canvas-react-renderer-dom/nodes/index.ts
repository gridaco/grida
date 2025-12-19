import { ContainerWidget } from "./container";
import { TextWidget } from "./text";
import { ImageWidget } from "./image";
import { VideoWidget } from "./video";
import { RectangleWidget } from "./rectangle";
import { EllipseWidget } from "./ellipse";
import { SVGLineWidget } from "./line";
import { SVGPolyLineWidget } from "./polyline";
import { IFrameWidget } from "./iframe";
import { RichTextWidget } from "./richtext";
import { VectorWidget } from "./vector";
import { BitmapWidget } from "./bitmap";
import { RegularPolygonWidget } from "./polygon";
import { RegularStarPolygonWidget } from "./star";

export namespace ReactNodeRenderers {
  export const container = ContainerWidget;
  export const component = ContainerWidget; // TODO:
  export const iframe = IFrameWidget;
  export const vector = VectorWidget;
  export const line = SVGLineWidget;
  export const polyline = SVGPolyLineWidget;
  export const rectangle = RectangleWidget;
  export const ellipse = EllipseWidget;
  export const polygon = RegularPolygonWidget;
  export const star = RegularStarPolygonWidget;
  export const text = TextWidget;
  export const image = ImageWidget;
  export const video = VideoWidget;
  export const richtext = RichTextWidget;
  export const bitmap = BitmapWidget;
  // export const icon = IconWidget;
  // export const Theme = ThemeWidget;
}
