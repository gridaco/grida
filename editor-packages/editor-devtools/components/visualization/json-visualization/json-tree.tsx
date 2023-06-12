import type { ReflectSceneNode } from "@design-sdk/figma-node";
import { JsxWidget } from "@web-builder/core";
import { Figma } from "@design-sdk/figma";
import { Widget as ReflectWidget } from "@reflect-ui/core";
import React from "react";
import JSONTree from "react-json-tree";
import type { Theme } from "react-base16-styling";
import assert from "assert";

interface CompactNodeTree {
  id: string;
  name: string;
  children?: CompactNodeTree[];
}

const monokai: Theme = {
  scheme: "monokai",
  author: "wimer hazenberg (http://www.monokai.nl)",
  base00: "#272822",
  base01: "#383830",
  base02: "#49483e",
  base03: "#75715e",
  base04: "#a59f85",
  base05: "#f8f8f2",
  base06: "#f5f4f1",
  base07: "#f9f8f5",
  base08: "#f92672",
  base09: "#fd971f",
  base0A: "#f4bf75",
  base0B: "#a6e22e",
  base0C: "#a1efe4",
  base0D: "#66d9ef",
  base0E: "#ae81ff",
  base0F: "#cc6633",
};

export function JsonTree({
  data,
  hideRoot,
  expandRoot = false,
  expandParent = false,
  theme = monokai,
  backgroundColor,
  sortkeys = false,
  omitkeys = [],
}: {
  data: any;
  hideRoot?: boolean;
  expandRoot?: boolean;
  expandParent?: boolean;
  theme?: Theme;
  backgroundColor?: React.CSSProperties["backgroundColor"];
  sortkeys?: ReadonlyArray<string> | boolean;
  // not used
  omitkeys?: ReadonlyArray<string>;
}) {
  const sorter = (a: string, b: string) => {
    assert(sortkeys instanceof Array, "keysort must be an array");
    const aindex = sortkeys.indexOf(a);
    const bindex = sortkeys.indexOf(b);
    // the sortkeys may not contain all keys.

    // if a is not in sortkeys, it should be placed after b
    if (aindex === -1) {
      return 1;
    }

    // if b is not in sortkeys, it should be placed after a
    if (bindex === -1) {
      return -1;
    }

    // if both are not in sortkeys, they should be placed in the order of appearance
    if (aindex === -1 && bindex === -1) {
      return 0;
    }

    // if both are in sortkeys, they should be placed in the order of sortkeys
    return aindex - bindex;
  };

  return (
    <JSONTree
      data={data}
      theme={{
        ...(theme as object),
        ...(backgroundColor ? { base00: backgroundColor } : {}),
        tree: ({ style }) => ({
          style: {
            ...style,
            fontFamily: "Monaco, monospace",
            fontSize: 14,
          },
        }),
      }}
      invertTheme={false}
      hideRoot={hideRoot}
      sortObjectKeys={typeof sortkeys === "boolean" ? sortkeys : sorter}
      shouldExpandNode={(keypath, data, level) => {
        if (level === 0) {
          return expandRoot;
        }
        if (keypath[keypath.length - 1] === "parent") {
          return expandParent;
        }
        return true;
      }}
      getItemString={(type, data, itemType, itemString) => {
        return (
          <span>
            {type} {itemType}
          </span>
        );
      }}
    />
  );
}

type WidgetDataLike =
  | CompactNodeTree
  | JsxWidget
  | ReflectWidget
  | Figma.SceneNode
  | ReflectSceneNode;
export function WidgetTree(props: {
  data: WidgetDataLike;
  hideRoot?: boolean;
}) {
  const getname = (data: WidgetDataLike | any): string => {
    if (data.name) {
      return data.name.substring(0, 20);
    }
    if (data instanceof JsxWidget) {
      return data.key.name;
    } else if (data instanceof ReflectWidget) {
      return data.key.originName;
    } else {
      return data.constructor?.name ?? "";
    }
  };

  const gettype = (data: WidgetDataLike): string => {
    if ("_type" in data) {
      return data._type;
    }
    if ("type" in data) {
      return data.type;
    }
  };

  return (
    <JSONTree
      data={props.data}
      theme={monokai}
      hideRoot={props.hideRoot}
      getItemString={(type, data: WidgetDataLike, itemType, itemString) => {
        return (
          <span>
            {getname(data) && getname(data)} {gettype(data) && gettype(data)}{" "}
            {itemType}
          </span>
        );
      }}
    />
  );
}

export function WidgetTreeLegend({
  title,
  description,
}: {
  title: string;
  description?: string;
}) {
  return (
    <div style={{ margin: 8 }}>
      <h5>{title}</h5>
      {description && <p>{description}</p>}
    </div>
  );
}
