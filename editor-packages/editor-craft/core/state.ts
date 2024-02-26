export interface CraftHtmlElement {
  tag: "div" | "h1" | "span";
  attributes: {
    class: string[];
  };
  style: {
    width?: number;
    height?: number;
    backgroundColor?: string;
  };
  text?: string;
  children?: CraftHtmlElement[];
}
