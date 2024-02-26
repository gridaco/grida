interface Position {
  x: number;
  y: number;
}

interface Size {
  width: number;
  height: number;
}

interface AbsolutePosition {
  absoluteX: number;
  absoluteY: number;
}

interface Rotation {
  rotation: number;
}

interface BaseNode {
  id: string;
  name: string;
}

export interface CraftHtmlElement
  extends BaseNode,
    Position,
    Size,
    AbsolutePosition,
    Rotation {
  tag: "div" | "h1" | "span";
  attributes: {
    class: string[];
  };
  style: {
    width?: number;
    height?: number;
    backgroundColor?: string;
  };
  text?: string;
  children?: CraftHtmlElement[];
}
