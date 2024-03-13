interface XYWHRotation {
  type: "xywhr";
  xywh: [number, number, number, number];
  rotation?: number;
  zoom: number;
}

export type OutlineProps = XYWHRotation & {
  width?: number;
};

export type ResizeHandleOrigin =
  | "nw"
  | "ne"
  | "sw"
  | "se"
  | "n"
  | "s"
  | "w"
  | "e";
