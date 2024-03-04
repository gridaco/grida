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
  disabled?: boolean;
  locked?: boolean;
}

import * as core from "@reflect-ui/core";
type CraftStyle = Omit<React.CSSProperties, "boxShadow"> & {
  boxShadow?: core.BoxShadowManifest;
};

type ElementAttributes<T extends keyof JSX.IntrinsicElements> = {
  tag: T;
  attributes?: JSX.IntrinsicElements[T];
  style?: CraftStyle;
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

export type CraftRadixIconElement = BaseNode &
  Position &
  Size &
  AbsolutePosition &
  Rotation & {
    type: "@radix-ui/react-icons";
    tag: "svg";
    icon: string;
    color: string;
  };

export type CraftViewportNode = BaseNode &
  Position &
  Size &
  AbsolutePosition & {
    type: "viewport";
    appearance: "light" | "dark";
    breakpoint: "sm" | "md" | "lg" | "xl" | "2xl";
    children: CraftElement[];
  };

export type CraftNode = CraftElement | CraftViewportNode;

export type CraftElement = CraftHtmlElement | CraftRadixIconElement;

// type CraftComponentNode = {
//   interface: { [key: string]: CraftParameterType };
// };

// type CraftParameterType =
//   | CraftLiteralStringParameterDefinition
//   | "number"
//   | "boolean"
//   | "color"
//   | "enum";

// type CraftLiteralStringParameterDefinition =
//   | {
//       type: "string";
//       value: string;
//       optional: false;
//     }
//   | {
//       type: "string";
//       value?: string | null;
//       optional: true;
//     };
