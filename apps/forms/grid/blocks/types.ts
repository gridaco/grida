export type GridaBlock =
  | GridaGridImageBlock
  | GridaGridTypographyBlock
  | GridaGridButtonBlock
  | GridaGridVideoBlock;

export type GridaBlockType = GridaBlock["type"];

export type GridaGridImageBlock = {
  type: "image";
  src: string;
};

export type GridaGridTypographyBlock = {
  type: "typography";
  element: "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "p" | "span";
  data: string;
};

export type GridaGridButtonBlock = {
  type: "button";
  label: string;
  href?: string;
};

export type GridaGridVideoBlock = {
  type: "video";
  src: string;
};
