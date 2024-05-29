import * as CSS from "./css";
export type GridaBlock =
  | GridaGridImageBlock
  | GridaGridTypographyBlock
  | GridaGridButtonBlock
  | GridaGridVideoBlock
  | GridaFormsBlock;

export type GridaBlockType = GridaBlock["type"];

export type ObjectFit = "cover" | "contain" | "fill" | "none" | "scale-down";

export type CSSProperties = CSS.Properties;

export type TypographyCSSProperties = CSSProperties & {
  textAlignVertical?: "top" | "middle" | "bottom";
};

export type GridaGridImageBlock = {
  type: "image";
  src: string;
  style: CSSProperties;
};

export type GridaGridTypographyBlock = {
  type: "typography";
  tag: "h1" | "h2" | "h3" | "h4" | "h5" | "h6" | "p" | "span";
  data: string;
  style: TypographyCSSProperties;
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

export type GridaFormsBlock =
  | GridaFormsTimerBlock
  | GridaFormsStartButtonBlock
  | GridaFormsGalleryBlock;

export type GridaFormsTimerBlock = {
  type: "https://forms.grida.co/blocks/timer.schema.json";
};

export type GridaFormsStartButtonBlock = {
  type: "https://forms.grida.co/blocks/start-button.schema.json";
  status: {
    ok: {
      label: string;
    };
    alreadyresponded: {
      label: string;
    };
    formclosed: {
      label: string;
    };
  };
};

export type GridaFormsGalleryBlock = {
  type: "https://forms.grida.co/blocks/gallery.schema.json";
  pictures: { src: string }[];
};
