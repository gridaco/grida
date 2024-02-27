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

type ElementAttributes<T extends keyof JSX.IntrinsicElements> = {
  tag: T;
  attributes?: JSX.IntrinsicElements[T];
  style?: React.CSSProperties;
  text?: string;
  children?: CraftHtmlElement<any>[];
};

export type CraftHtmlElement<T extends keyof JSX.IntrinsicElements = any> =
  ElementAttributes<T> &
    BaseNode &
    Position &
    Size &
    AbsolutePosition &
    Rotation & {
      type: "html";
    };

export type CraftRadixIconElement = Omit<ElementAttributes<"svg">, "tag"> &
  BaseNode &
  Position &
  Size &
  AbsolutePosition &
  Rotation & {
    type: "@radix-ui/react-icons";
    icon: string;
    color: string;
  };

export type CraftElement = CraftHtmlElement | CraftRadixIconElement;
