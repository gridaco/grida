import grida from "@grida/schema";
import cg from "@grida/cg";
import kolor from "@grida/color";
import { editor } from "@/grida-canvas/editor.i";

export const gray: cg.Paint = {
  type: "solid",
  color: kolor.colorformats.RGBA32F.GRAY,
  active: true,
};

export const white: cg.Paint = {
  type: "solid",
  color: kolor.colorformats.RGBA32F.WHITE,
  active: true,
};

export const black: cg.Paint = {
  type: "solid",
  color: kolor.colorformats.RGBA32F.BLACK,
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
 * const rectMulti = initialNode("rectangle", {}, { fill: "fill_paints" });
 *
 * // Create a line with single stroke
 * const line = initialNode("line", {}, { stroke: "stroke" });
 *
 * // Create a line with multiple strokes
 * const lineMulti = initialNode("line", {}, { stroke: "stroke_paints" });
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
    fill?: "fill" | "fill_paints";
    stroke?: "stroke" | "stroke_paints";
  } = {}
): grida.program.nodes.Node {
  const id = idfac();
  const base: grida.program.nodes.i.IBaseNode &
    grida.program.nodes.i.ISceneNode = {
    id: id,
    name: type,
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
    blend_mode: cg.def.LAYER_BLENDMODE,
    z_index: 0,
    rotation: 0,
    fill: constraints.fill === "fill_paints" ? undefined : gray,
    fill_paints: constraints.fill === "fill_paints" ? [gray] : undefined,
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
        text_align: "left",
        text_align_vertical: "top",
        fill: constraints.fill === "fill_paints" ? undefined : black,
        fill_paints: constraints.fill === "fill_paints" ? [black] : undefined,
        width: "auto",
        height: "auto",
        text: "Text",
        stroke: constraints.stroke === "stroke_paints" ? undefined : undefined,
        stroke_paints: constraints.stroke === "stroke_paints" ? [] : undefined,
        letter_spacing: 0,
        line_height: undefined, // normal
        stroke_width: 0,
        stroke_align: "outside",
        word_spacing: 0,
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
        fill: constraints.fill === "fill_paints" ? undefined : white,
        fill_paints: constraints.fill === "fill_paints" ? [white] : undefined,
        type: "container",
        expanded: false,
        corner_radius: 0,
        padding_top: 0,
        padding_right: 0,
        padding_bottom: 0,
        padding_left: 0,
        layout: "flow",
        direction: "horizontal",
        main_axis_alignment: "start",
        cross_axis_alignment: "start",
        stroke_width: 1,
        stroke_align: "inside",
        stroke_cap: "butt",
        stroke_join: "miter",
        main_axis_gap: 0,
        cross_axis_gap: 0,
        ...seed,
      } satisfies grida.program.nodes.ContainerNode;
    }
    case "iframe": {
      return {
        ...base,
        ...position,
        ...styles,
        fill: constraints.fill === "fill_paints" ? undefined : white,
        fill_paints: constraints.fill === "fill_paints" ? [white] : undefined,
        type: "iframe",
        corner_radius: 0,
        ...seed,
      } satisfies grida.program.nodes.HTMLIFrameNode;
    }
    case "richtext": {
      return {
        ...base,
        ...position,
        ...styles,
        fill: constraints.fill === "fill_paints" ? undefined : white,
        fill_paints: constraints.fill === "fill_paints" ? [white] : undefined,
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
        corner_radius: 0,
        width: 100,
        height: 100,
        fit: "cover",
        fill: constraints.fill === "fill_paints" ? undefined : undefined,
        fill_paints: constraints.fill === "fill_paints" ? [] : undefined,
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
        corner_radius: 0,
        width: 100,
        height: 100,
        fill: constraints.fill === "fill_paints" ? undefined : undefined,
        fill_paints: constraints.fill === "fill_paints" ? [] : undefined,
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
        stroke_width: 0,
        stroke_align: "inside",
        stroke_cap: "butt",
        stroke_join: "miter",
        fill: constraints.fill === "fill_paints" ? undefined : gray,
        fill_paints: constraints.fill === "fill_paints" ? [gray] : undefined,
        angle: 360,
        angle_offset: 0,
        inner_radius: 0,
        ...seed,
      } satisfies grida.program.nodes.EllipseNode;
    }
    case "rectangle": {
      return {
        ...base,
        ...position,
        ...styles,
        type: "rectangle",
        corner_radius: 0,
        rectangular_corner_radius_top_left: 0,
        rectangular_corner_radius_top_right: 0,
        rectangular_corner_radius_bottom_right: 0,
        rectangular_corner_radius_bottom_left: 0,
        width: 100,
        height: 100,
        stroke_width: 0,
        stroke_align: "inside",
        stroke_cap: "butt",
        stroke_join: "miter",
        fill: constraints.fill === "fill_paints" ? undefined : gray,
        fill_paints: constraints.fill === "fill_paints" ? [gray] : undefined,
        ...seed,
      } satisfies grida.program.nodes.RectangleNode;
    }
    case "polygon": {
      return {
        ...base,
        ...position,
        ...styles,
        type: "polygon",
        point_count: 3,
        corner_radius: 0,
        width: 100,
        height: 100,
        stroke_width: 0,
        stroke_align: "inside",
        stroke_cap: "butt",
        stroke_join: "miter",
        fill: constraints.fill === "fill_paints" ? undefined : gray,
        fill_paints: constraints.fill === "fill_paints" ? [gray] : undefined,
        ...seed,
      } satisfies grida.program.nodes.RegularPolygonNode;
    }
    case "star": {
      return {
        ...base,
        ...position,
        ...styles,
        type: "star",
        point_count: 5,
        inner_radius: 0.5,
        corner_radius: 0,
        width: 100,
        height: 100,
        stroke_width: 0,
        stroke_align: "inside",
        stroke_cap: "butt",
        stroke_join: "miter",
        fill: constraints.fill === "fill_paints" ? undefined : gray,
        fill_paints: constraints.fill === "fill_paints" ? [gray] : undefined,
        ...seed,
      } satisfies grida.program.nodes.RegularStarPolygonNode;
    }
    case "line": {
      return {
        ...base,
        ...position,
        ...styles,
        type: "line",
        stroke: constraints.stroke === "stroke_paints" ? undefined : black,
        stroke_paints:
          constraints.stroke === "stroke_paints" ? [black] : undefined,
        stroke_width: 1,
        stroke_cap: "butt",
        stroke_join: "miter",
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
