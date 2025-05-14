export type ImageHashMap = { [key: string]: string };

export type FigmaImageType = "baked" | "image";

export type TargetImage = string | string[];

export type FetchOptions = {
  version?: string;
  scale?: number;
  use_absolute_bounds?: boolean;
} & (
  | { format: "png" | "jpg" }
  | {
      format: "svg";
      svg_include_id?: boolean;
      svg_simplify_stroke?: boolean;
    }
  | { format: "pdf" }
);

export type Format = FetchOptions["format"];

export type IndexedImage = {
  id: string;
  url: string;
};

export type IndexedImageQuery = {
  id: string;
  version?: string;
  format?: Format;
  scale?: number;
};
