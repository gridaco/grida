import type { grida } from "@/grida";

export namespace iopdf {
  export type PortableTextNode = {
    type: "text";
    str: string;
    transform: any;
    fill: grida.program.nodes.TextNode["fill"];
    style: {};
  };
}
