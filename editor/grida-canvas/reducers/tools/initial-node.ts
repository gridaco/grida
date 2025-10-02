import grida from "@grida/schema";
import cg from "@grida/cg";
import { editor } from "@/grida-canvas/editor.i";

export const gray: cg.Paint = {
  type: "solid",
  color: { r: 217, g: 217, b: 217, a: 1 },
  active: true,
};

export const white: cg.Paint = {
  type: "solid",
  color: { r: 255, g: 255, b: 255, a: 1 },
  active: true,
};

export const black: cg.Paint = {
  type: "solid",
  color: { r: 0, g: 0, b: 0, a: 1 },
  active: true,
};

/**
 * Creates an initial node with default properties for a given node type.
 *
 * @param type - The type of node to create
 * @param seed - Optional partial properties to override defaults
 * @param constraints - Optional constraints to control which paint properties are set
 * @returns A new node with default properties
 *
 * @example
 * ```typescript
 * // Create a rectangle with single fill
 * const rect = initialNode("rectangle", {}, { fill: "fill" });
 *
 * // Create a rectangle with multiple fills
 * const rectMulti = initialNode("rectangle", {}, { fill: "fills" });
 *
 * // Create a line with single stroke
 * const line = initialNode("line", {}, { stroke: "stroke" });
 *
 * // Create a line with multiple strokes
 * const lineMulti = initialNode("line", {}, { stroke: "strokes" });
 * ```
 */
export default function initialNode(
  type:
    | "text"
    | "container"
    | "iframe"
    | "richtext"
    | "image"
    | "video"
    | "ellipse"
    | "rectangle"
    | "polygon"
    | "star"
    | "line",
  idfac: () => string,
  seed: Partial<Omit<grida.program.nodes.UnknwonNode, "type">> = {},
  constraints: {
    fill?: "fill" | "fills";
    stroke?: "stroke" | "strokes";
  } = {}
): grida.program.nodes.Node {
  const id = idfac();
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
    blendMode: cg.def.LAYER_BLENDMODE,
    zIndex: 0,
    rotation: 0,
    fill: constraints.fill === "fills" ? undefined : gray,
    fills: constraints.fill === "fills" ? [gray] : undefined,
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
        ...editor.config.fonts.DEFAULT_TEXT_STYLE_INTER,
        type: "text",
        textAlign: "left",
        textAlignVertical: "top",
        fill: constraints.fill === "fills" ? undefined : black,
        fills: constraints.fill === "fills" ? [black] : undefined,
        width: "auto",
        height: "auto",
        text: "Text",
        stroke: constraints.stroke === "strokes" ? undefined : undefined,
        strokes: constraints.stroke === "strokes" ? [] : undefined,
        letterSpacing: 0,
        lineHeight: undefined, // normal
        strokeWidth: 0,
        wordSpacing: 0,
        ...seed,
      } satisfies grida.program.nodes.TextNode;
    }
    case "container": {
      return {
        ...base,
        ...position,
        ...styles,
        style: {
          overflow: "clip",
        },
        fill: constraints.fill === "fills" ? undefined : white,
        fills: constraints.fill === "fills" ? [white] : undefined,
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
        children: [],
        ...seed,
      } satisfies grida.program.nodes.ContainerNode;
    }
    case "iframe": {
      return {
        ...base,
        ...position,
        ...styles,
        fill: constraints.fill === "fills" ? undefined : white,
        fills: constraints.fill === "fills" ? [white] : undefined,
        type: "iframe",
        cornerRadius: 0,
        ...seed,
      } satisfies grida.program.nodes.HTMLIFrameNode;
    }
    case "richtext": {
      return {
        ...base,
        ...position,
        ...styles,
        fill: constraints.fill === "fills" ? undefined : white,
        fills: constraints.fill === "fills" ? [white] : undefined,
        type: "richtext",
        width: "auto",
        height: "auto",
        html: __richtext_html,
        ...seed,
      } satisfies grida.program.nodes.HTMLRichTextNode;
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
        fill: constraints.fill === "fills" ? undefined : undefined,
        fills: constraints.fill === "fills" ? [] : undefined,
        // TODO: replace with static url
        src: "/dummy/image/png/png-square-transparent-1k.png",
        ...seed,
      } satisfies grida.program.nodes.ImageNode;
    }
    case "video": {
      return {
        ...base,
        ...position,
        ...styles,
        type: "video",
        cornerRadius: 0,
        width: 100,
        height: 100,
        fill: constraints.fill === "fills" ? undefined : undefined,
        fills: constraints.fill === "fills" ? [] : undefined,
        fit: "cover",
        // TODO: replace with static url
        src: "/dummy/video/mp4/mp4-30s-5mb.mp4",
        loop: true,
        muted: true,
        autoplay: true,
        ...seed,
      } satisfies grida.program.nodes.VideoNode;
    }
    case "ellipse": {
      return {
        ...base,
        ...position,
        ...styles,
        type: "ellipse",
        width: 100,
        height: 100,
        strokeWidth: 0,
        strokeCap: "butt",
        fill: constraints.fill === "fills" ? undefined : gray,
        fills: constraints.fill === "fills" ? [gray] : undefined,
        angle: 360,
        angleOffset: 0,
        innerRadius: 0,
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
        cornerRadiusTopLeft: 0,
        cornerRadiusTopRight: 0,
        cornerRadiusBottomRight: 0,
        cornerRadiusBottomLeft: 0,
        width: 100,
        height: 100,
        strokeWidth: 0,
        strokeCap: "butt",
        fill: constraints.fill === "fills" ? undefined : gray,
        fills: constraints.fill === "fills" ? [gray] : undefined,
        ...seed,
      } satisfies grida.program.nodes.RectangleNode;
    }
    case "polygon": {
      return {
        ...base,
        ...position,
        ...styles,
        type: "polygon",
        pointCount: 3,
        cornerRadius: 0,
        width: 100,
        height: 100,
        strokeWidth: 0,
        strokeCap: "butt",
        fill: constraints.fill === "fills" ? undefined : gray,
        fills: constraints.fill === "fills" ? [gray] : undefined,
        ...seed,
      } satisfies grida.program.nodes.RegularPolygonNode;
    }
    case "star": {
      return {
        ...base,
        ...position,
        ...styles,
        type: "star",
        pointCount: 5,
        innerRadius: 0.5,
        cornerRadius: 0,
        width: 100,
        height: 100,
        strokeWidth: 0,
        strokeCap: "butt",
        fill: constraints.fill === "fills" ? undefined : gray,
        fills: constraints.fill === "fills" ? [gray] : undefined,
        ...seed,
      } satisfies grida.program.nodes.RegularStarPolygonNode;
    }
    case "line": {
      return {
        ...base,
        ...position,
        ...styles,
        type: "line",
        stroke: constraints.stroke === "strokes" ? undefined : black,
        strokes: constraints.stroke === "strokes" ? [black] : undefined,
        strokeWidth: 1,
        strokeCap: "butt",
        width: 100,
        height: 0,
        ...seed,
      } satisfies grida.program.nodes.LineNode;
    }
  }
}

const __richtext_html = `
<h1>Welcome to Rich Text Editor!</h1>
<h2>Subheading Example</h2>
<h3>Smaller Subheading</h3>
<p>This is a regular paragraph where you can make words <strong>bold</strong> or <em>italic</em>.</p>
<p>You can also <u>underline</u> words or show <s>crossed-out text</s> if needed.</p>
<p>Want to call attention to something? Try <mark>highlighting</mark> it!</p>

<blockquote>
    "This is a great way to add a quote or a special message."
</blockquote>

<p>Here’s how you can create lists:</p>
<ul>
    <li>First item</li>
    <li>Second item</li>
    <li>Third item</li>
</ul>

<p>Or make a numbered list:</p>
<ol>
    <li>Step one</li>
    <li>Step two</li>
    <li>Step three</li>
</ol>

<p>Need to include a link? Here’s an example: <a href="https://example.com">Visit Example</a>.</p>
<p>Want to add a little note? Use small text like this: <small>Some extra details here.</small></p>

<p>You can also add <sup>superscripts</sup> for things like numbers<sup>2</sup>, or <sub>subscripts</sub> for small details<sub>2</sub>.</p>

<pre>
    This area is for text that needs to stay exactly as it is.
    It's great for showing things like poetry or special formatting!
</pre>

<h2>Try experimenting with these elements!</h2>
<p>Have fun creating beautiful, rich text content for your website!</p>
`;
