export type NumberChange = {
  type: "set" | "delta";
  value: number;
};

export type RGB = { r: number; g: number; b: number };
export type RGBA = { r: number; g: number; b: number; a: number };
