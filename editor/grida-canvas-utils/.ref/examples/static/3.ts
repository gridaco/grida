import { grida } from "../../../index";

function randcolor(): grida.program.cg.RGBA8888 {
  return {
    r: Math.floor(Math.random() * 256),
    g: Math.floor(Math.random() * 256),
    b: Math.floor(Math.random() * 256),
    a: 1,
  } satisfies grida.program.cg.RGBA8888;
}

function _1000_rects(): Array<grida.program.nodes.RectangleNode> {
  const rects: grida.program.nodes.RectangleNode[] = [];
  for (let i = 0; i < 1000; i++) {
    rects.push({
      id: `rect_${i}`,
      name: `rect_${i}`,
      type: "rectangle",
      active: true,
      locked: false,
      opacity: 1,
      zIndex: 0,
      rotation: 0,
      width: 200,
      height: 200,
      position: "absolute",
      top: 0 + i * 1,
      left: 0 + i * 1,
      cornerRadius: 0,
      fill: { type: "solid", color: randcolor() },
      strokeWidth: 0,
      strokeCap: "butt",
      effects: [],
    } satisfies grida.program.nodes.RectangleNode);
  }
  return rects;
}

const rects = _1000_rects();

// eslint-disable-next-line import/no-anonymous-default-export
export default {
  root_id: "playground",
  nodes: {
    playground: {
      id: "playground",
      name: "playground",
      type: "container",
      active: true,
      locked: false,
      expanded: true,
      opacity: 1,
      zIndex: 0,
      rotation: 0,
      position: "relative",
      width: 960,
      height: 540,
      fill: { type: "solid", color: { r: 0, g: 0, b: 0, a: 1 } },
      cornerRadius: 0,
      padding: 0,
      boxShadow: {
        color: { r: 0, g: 0, b: 0, a: 0.1 },
        offset: [0, 0],
        blur: 10,
        spread: 0,
      },
      style: {},
      children: rects.map((rect) => rect.id),
      layout: "flow",
      direction: "horizontal",
      mainAxisAlignment: "start",
      crossAxisAlignment: "start",
      mainAxisGap: 0,
      crossAxisGap: 0,
    },
    // recta
    ...rects.reduce((acc, rect) => {
      // @ts-ignore
      acc[rect.id] = rect;
      return acc;
    }, {}),
  },
  textures: {},
  properties: {},
} satisfies grida.program.document.IDocumentDefinition;
