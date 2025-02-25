import { ContainerWidget } from "./container";
import { VectorWidget } from "./vector";
import { TextWidget } from "./text";
import { ImageWidget } from "./image";
import { VideoWidget } from "./video";
import { RectangleWidget } from "./rectangle";
import { EllipseWidget } from "./ellipse";
import { SVGLineWidget } from "./line";
import { SVGPolyLineWidget } from "./polyline";
import { IFrameWidget } from "./iframe";
import { RichTextWidget } from "./richtext";
import { PathWidget } from "./path";
import { BitmapWidget } from "./bitmap";

export namespace ReactNodeRenderers {
  export const container = ContainerWidget;
  export const component = ContainerWidget; // TODO:
  export const iframe = IFrameWidget;
  export const vector = VectorWidget;
  export const path = PathWidget;
  export const line = SVGLineWidget;
  export const polyline = SVGPolyLineWidget;
  export const rectangle = RectangleWidget;
  export const ellipse = EllipseWidget;
  export const text = TextWidget;
  export const image = ImageWidget;
  export const video = VideoWidget;
  export const richtext = RichTextWidget;
  export const bitmap = BitmapWidget;
  // export const icon = IconWidget;
  // export const Theme = ThemeWidget;
}
