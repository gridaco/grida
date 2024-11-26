import { grida } from "@/grida";
import { v4 } from "uuid";

export const gray: grida.program.cg.Paint = {
  type: "solid",
  color: { r: 217, g: 217, b: 217, a: 1 },
};

export const white: grida.program.cg.Paint = {
  type: "solid",
  color: { r: 255, g: 255, b: 255, a: 1 },
};

export const black: grida.program.cg.Paint = {
  type: "solid",
  color: { r: 0, g: 0, b: 0, a: 1 },
};

export default function initialNode(
  type: grida.program.nodes.Node["type"],
  seed: Partial<Omit<grida.program.nodes.AnyNode, "type">> = {}
): grida.program.nodes.Node {
  const id = v4();
  const base: grida.program.nodes.i.IBaseNode &
    grida.program.nodes.i.ISceneNode = {
    id: id,
    name: type,
    userdata: undefined,
    //
    locked: false,
    active: true,
  };

  const position: grida.program.nodes.i.IPositioning = {
    position: "absolute",
    top: 0,
    left: 0,
  };

  const styles: grida.program.nodes.i.ICSSStylable = {
    opacity: 1,
    zIndex: 0,
    rotation: 0,
    fill: gray,
    width: 100,
    height: 100,
    position: "absolute",
    border: undefined,
    style: {},
  };

  switch (type) {
    case "text": {
      return {
        ...base,
        ...position,
        ...styles,
        type: "text",
        textAlign: "left",
        textAlignVertical: "top",
        textDecoration: "none",
        fontWeight: 400,
        fontSize: 14,
        fill: black,
        width: "auto",
        height: "auto",
        text: "Text",
        ...seed,
      } satisfies grida.program.nodes.TextNode;
    }
    case "container": {
      return {
        ...base,
        ...position,
        ...styles,
        fill: white,
        type: "container",
        expanded: false,
        cornerRadius: 0,
        padding: 0,
        layout: "flow",
        direction: "horizontal",
        mainAxisAlignment: "start",
        crossAxisAlignment: "start",
        mainAxisGap: 0,
        crossAxisGap: 0,
        ...seed,
      } satisfies grida.program.nodes.ContainerNode;
    }
    case "iframe": {
      return {
        ...base,
        ...position,
        ...styles,
        fill: white,
        type: "iframe",
        cornerRadius: 0,
        ...seed,
      } satisfies grida.program.nodes.HTMLIFrameNode;
    }
    case "ellipse": {
      return {
        ...base,
        ...position,
        ...styles,
        type: "ellipse",
        width: 100,
        height: 100,
        effects: [],
        ...seed,
      } satisfies grida.program.nodes.EllipseNode;
    }
    case "rectangle": {
      return {
        ...base,
        ...position,
        ...styles,
        type: "rectangle",
        cornerRadius: 0,
        width: 100,
        height: 100,
        effects: [],
        ...seed,
      } satisfies grida.program.nodes.RectangleNode;
    }
    case "image": {
      return {
        ...base,
        ...position,
        ...styles,
        type: "image",
        cornerRadius: 0,
        width: 100,
        height: 100,
        fit: "cover",
        fill: undefined,
        // TODO: replace with static url
        src: "/assets/image.png",
        ...seed,
      } satisfies grida.program.nodes.ImageNode;
    }
    case "line": {
      return {
        ...base,
        ...position,
        ...styles,
        type: "line",
        width: 100,
        height: 0,
        ...seed,
      } satisfies grida.program.nodes.LineNode;
    }
    case "vector":
    case "instance":
    case "template_instance": {
      throw new Error(`${type} insertion not supported`);
    }
  }
}
