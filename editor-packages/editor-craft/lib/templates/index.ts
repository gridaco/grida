import { CraftHtmlElement, CraftRadixIconElement } from "../core";

type TemplateInitProps = {
  id: string;
  name: string;
  x: number;
  y: number;
  absoluteX: number;
  absoluteY: number;
  width: number;
  height: number;
};

export function new_container_widget({
  id,
  name,
  x,
  y,
  width,
  height,
  absoluteX,
  absoluteY,
}: TemplateInitProps): CraftHtmlElement {
  return {
    type: "html",
    id,
    name: name,
    x,
    y,
    tag: "div",
    attributes: {
      class: [],
    },
    style: {
      width,
      height,
      backgroundColor: "grey",
    },
    children: [],
    width,
    height,
    absoluteX,
    absoluteY,
    rotation: 0,
  };
}

export function new_textfield_widget({
  id,
  name,
  x,
  y,
  width,
  height,
  absoluteX,
  absoluteY,
}: TemplateInitProps): CraftHtmlElement {
  return {
    type: "html",
    id,
    name: name,
    x: x,
    y: y,
    tag: "input",
    attributes: {
      type: "text",
      placeholder: "Enter your text",
      class: [],
    },
    style: {},
    children: [],
    width: width,
    height: height,
    absoluteX: absoluteX,
    absoluteY: absoluteY,
    rotation: 0,
  };
}

export function new_radix_icon_widget(
  init: TemplateInitProps
): CraftRadixIconElement {
  return {
    type: "@radix-ui/react-icons",
    id: init.id,
    name: "icon",
    tag: "svg",
    x: init.x,
    y: init.y,
    icon: "PlusIcon",
    color: "black",
    // style: {},
    width: 15,
    height: 15,
    absoluteX: init.x,
    absoluteY: init.y,
    rotation: 0,
  };
}

export function new_text_widget(init: TemplateInitProps): CraftHtmlElement {
  return {
    type: "html",
    id: init.id,
    name: "text",
    x: init.x,
    y: init.y,
    tag: "span",
    attributes: {
      class: [],
    },
    style: {
      color: "black",
      fontWeight: 400,
    },
    text: "Text",
    children: [],
    width: init.width,
    height: init.height,
    absoluteX: init.absoluteX,
    absoluteY: init.absoluteY,
    rotation: 0,
  };
}

export function new_image_widget(init: TemplateInitProps): CraftHtmlElement {
  return {
    type: "html",
    id: init.id,
    name: "image",
    x: init.x,
    y: init.y,
    tag: "img",
    attributes: {
      class: [],
      src: "https://via.placeholder.com/150",
    },
    style: {
      width: 100,
      height: 100,
      objectFit: "cover",
    },
    width: init.width,
    height: init.height,
    absoluteX: init.absoluteX,
    absoluteY: init.absoluteY,
    rotation: 0,
  };
}

export function new_circle_image_widget(
  init: TemplateInitProps
): CraftHtmlElement<"img"> {
  return {
    type: "html",
    id: init.id,
    name: "circle image",
    x: init.x,
    y: init.y,
    tag: "img",
    style: {
      width: 100,
      height: 100,
      borderRadius: 999,
      overflow: "hidden",
      objectFit: "cover",
    },
    attributes: {
      src: "https://via.placeholder.com/150",
      tw: ["rounded-full", "overflow-hidden", "border-4", "border-white"].join(
        " "
      ),
    },
    children: [],
    width: init.width,
    height: init.height,
    absoluteX: init.absoluteX,
    absoluteY: init.absoluteY,
    rotation: 0,
  };
}

export function new_video_widget(
  init: TemplateInitProps
): CraftHtmlElement<"video"> {
  return {
    type: "html",
    id: init.id,
    name: "video",
    x: init.x,
    y: init.y,
    tag: "video",
    attributes: {
      src: "https://www.w3schools.com/html/mov_bbb.mp4",
    },
    style: {
      width: 100,
      height: 100,
      backgroundColor: "black",
    },
    children: [],
    width: init.width,
    height: init.height,
    absoluteX: init.absoluteX,
    absoluteY: init.absoluteY,
    rotation: 0,
  };
}

export function new_button_widget(
  init: TemplateInitProps
): CraftHtmlElement<"button"> {
  return {
    type: "html",
    id: init.id,
    name: "button",
    x: init.x,
    y: init.y,
    tag: "button",
    attributes: {
      tw: ["bg-blue-500", "text-white", "p-2", "rounded", "shadow-md"].join(
        " "
      ),
    },
    style: {
      padding: 10,
      backgroundColor: "black",
      color: "white",
    },
    children: [],
    text: "Button",
    width: init.width,
    height: init.height,
    absoluteX: init.absoluteX,
    absoluteY: init.absoluteY,
    rotation: 0,
  };
}

export function new_divider_widget(
  init: TemplateInitProps
): CraftHtmlElement<"hr"> {
  return {
    type: "html",
    id: init.id,
    name: init.name,
    x: init.x,
    y: init.y,
    tag: "hr",
    attributes: {
      tw: ["border-2", "border-gray-300", "w-full", "my-4"].join(" "),
    },
    style: {
      width: 100,
      height: 1,
    },
    children: [],
    width: init.width,
    height: init.height,
    absoluteX: init.absoluteX,
    absoluteY: init.absoluteY,
    rotation: 0,
  };
}

export function new_flex_row_widget(
  init: TemplateInitProps
): CraftHtmlElement<"div"> {
  return {
    type: "html",
    id: init.id,
    name: "flex flex-row",
    x: init.x,
    y: init.y,
    tag: "div",
    attributes: {
      tw: ["flex", "flex-row"].join(" "),
    },
    style: {
      width: init.width,
      height: init.height,
      display: "flex",
      flexDirection: "row",
      gap: 10,
    },
    children: [
      {
        type: "html",
        id: init.id + "-1",
        name: "child 1",
        x: 0,
        y: 0,
        width: init.width / 2,
        height: init.height,
        tag: "div",
        style: {
          flex: 1,
          backgroundColor: "rgba(0, 0, 0, 0.1)",
        },
        children: [],
        absoluteX: init.absoluteX,
        absoluteY: init.absoluteY,
        rotation: 0,
      },
      {
        type: "html",
        id: init.id + "-2",
        name: "child 2",
        x: init.x + init.width / 2,
        y: 0,
        width: init.width / 2,
        height: init.height,
        tag: "div",
        style: {
          flex: 1,
          backgroundColor: "rgba(0, 0, 0, 0.2)",
        },
        children: [],
        absoluteX: init.absoluteX + init.width / 2,
        absoluteY: init.absoluteY,
        rotation: 0,
      },
    ],
    width: init.width,
    height: init.height,
    absoluteX: init.absoluteX,
    absoluteY: init.absoluteY,
    rotation: 0,
  };
}
