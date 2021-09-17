import { Widget as WebWidget } from "../../../../packages/builder-web-core";
import { ReflectSceneNode } from "@design-sdk/core/nodes";
import { Figma } from "@design-sdk/figma";
import { Widget as ReflectWidget } from "@reflect-ui/core";
import React from "react";
import JSONTree from "react-json-tree";

const theme = {
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
  "background-color": "transparent",
};

export function JsonTree(props: { data: any; hideRoot?: boolean }) {
  return (
    <JSONTree
      data={props.data}
      theme={theme}
      hideRoot={props.hideRoot}
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
  | WebWidget
  | ReflectWidget
  | Figma.SceneNode
  | ReflectSceneNode;
export function WidgetTree(props: {
  data: WidgetDataLike;
  hideRoot?: boolean;
}) {
  const getname = (data: WidgetDataLike | any): string => {
    if (data instanceof WebWidget) {
      return data.key.name;
    } else if (data instanceof ReflectWidget) {
      return data.key.originName;
    } else {
      return data.constructor?.name ?? undefined;
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
      theme={theme}
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
