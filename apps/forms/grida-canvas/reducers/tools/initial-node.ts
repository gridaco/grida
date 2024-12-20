import { grida } from "@/grida";
import nid from "./id";

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
  const id = nid();
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
        fontFamily: "Inter",
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
        style: {
          overflow: "clip",
        },
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
    case "richtext": {
      return {
        ...base,
        ...position,
        ...styles,
        fill: white,
        type: "richtext",
        width: "auto",
        height: "auto",
        html: __richtext_html,
        ...seed,
      } satisfies grida.program.nodes.HTMLRichTextNode;
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
    case "video": {
      return {
        ...base,
        ...position,
        ...styles,
        type: "video",
        cornerRadius: 0,
        width: 100,
        height: 100,
        fill: undefined,
        fit: "cover",
        // TODO: replace with static url
        src: "/assets/video.mp4",
        loop: true,
        muted: true,
        autoplay: true,
        ...seed,
      } satisfies grida.program.nodes.VideoNode;
    }
    case "line": {
      return {
        ...base,
        ...position,
        ...styles,
        type: "line",
        stroke: black,
        width: 100,
        height: 0,
        ...seed,
      } satisfies grida.program.nodes.LineNode;
    }
    case "vector":
    case "component":
    case "instance":
    case "template_instance": {
      throw new Error(`${type} insertion not supported`);
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
