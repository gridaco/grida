import type grida from "@grida/schema";

export namespace editor.api {
  export type NodeID = string & {};

  export interface IStandaloneEditorApi {
    selection: ReadonlyArray<NodeID>;
    getNodeById: (node_id: NodeID) => grida.program.nodes.Node;
    getNodeDepth: (node_id: NodeID) => number;
    getNodeAbsoluteRotation: (node_id: NodeID) => number;

    select: (...selectors: grida.program.document.Selector[]) => void;
    blur: () => void;
    undo: () => void;
    redo: () => void;
    cut: (target: "selection" | NodeID) => void;
    copy: (target: "selection" | NodeID) => void;
    paste: () => void;
    duplicate: (target: "selection" | NodeID) => void;
    delete: (target: "selection" | NodeID) => void;
    rename: (target: "selection" | NodeID, name: string) => void;

    nudge: (
      target: "selection" | NodeID,
      axis: "x" | "y",
      delta: number
    ) => void;
    nudgeResize: (
      target: "selection" | NodeID,
      axis: "x" | "y",
      delta: number
    ) => void;

    align: (
      target: "selection" | NodeID,
      alignment: {
        horizontal?: "none" | "min" | "max" | "center";
        vertical?: "none" | "min" | "max" | "center";
      }
    ) => void;
    order: (
      target: "selection" | NodeID,
      order: "back" | "front" | number
    ) => void;
    distributeEvenly: (target: "selection" | NodeID[], axis: "x" | "y") => void;

    toggleActive: (target: "selection" | NodeID) => void;
    toggleLocked: (target: "selection" | NodeID) => void;
    toggleBold: (target: "selection" | NodeID) => void;
    setOpacity: (target: "selection" | NodeID, opacity: number) => void;

    createRectangle(
      props: Omit<grida.program.nodes.NodePrototype, "type">
    ): void;
    createEllipse(props: Omit<grida.program.nodes.NodePrototype, "type">): void;
    createText(props: Omit<grida.program.nodes.NodePrototype, "type">): void;

    // defineSchemaProperty: (
    //   name?: string,
    //   definition?: grida.program.schema.PropertyDefinition
    // ) => void;
    // renameSchemaProperty: (name: string, newName: string) => void;
    // updateSchemaProperty: (
    //   name: string,
    //   definition: grida.program.schema.PropertyDefinition
    // ) => void;
    // deleteSchemaProperty: (name: string) => void;

    // configureSurfaceRaycastTargeting: (
    //   config: Partial<SurfaceRaycastTargeting>
    // ) => void;
    configureMeasurement: (measurement: "on" | "off") => void;
    configureTranslateWithCloneModifier: (
      translate_with_clone: "on" | "off"
    ) => void;
    configureTranslateWithAxisLockModifier: (
      tarnslate_with_axis_lock: "on" | "off"
    ) => void;
    configureTransformWithCenterOriginModifier: (
      transform_with_center_origin: "on" | "off"
    ) => void;
    configureTransformWithPreserveAspectRatioModifier: (
      transform_with_preserve_aspect_ratio: "on" | "off"
    ) => void;
    configureRotateWithQuantizeModifier: (
      rotate_with_quantize: number | "off"
    ) => void;
  }
}
