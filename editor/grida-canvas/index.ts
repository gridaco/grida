import type { SurfaceRaycastTargeting } from "@/grida-react-canvas";
import type { TChange } from "@/grida-react-canvas/action";
import type cg from "@grida/cg";
import type grida from "@grida/schema";
import type { tokens } from "@grida/tokens";

export namespace editor {
  export type NodeID = string & {};

  export namespace api {
    export type NudgeUXConfig = {
      /**
       * when gesture is true, it will set the gesture state to trigger the surface guide rendering.
       *
       * @default true
       */
      gesture: boolean;
      /**
       * delay in ms to toggle off the gesture state
       *
       * @default 500
       */
      delay: number;
    };
    export interface INodeChangeActions {
      toggleNodeActive: (node_id: NodeID) => void;
      toggleNodeLocked: (node_id: NodeID) => void;
      toggleNodeBold: (node_id: NodeID) => void;
      changeNodeActive: (node_id: NodeID, active: boolean) => void;
      changeNodeLocked: (node_id: NodeID, locked: boolean) => void;
      changeNodeName: (node_id: NodeID, name: string) => void;
      changeNodeUserData: (node_id: NodeID, userdata: unknown) => void;
      changeNodeSize: (
        node_id: NodeID,
        axis: "width" | "height",
        value: grida.program.css.LengthPercentage | "auto"
      ) => void;
      changeNodeBorder: (
        node_id: NodeID,
        border: grida.program.css.Border | undefined
      ) => void;
      changeNodeProps: (
        node_id: string,
        key: string,
        value?: tokens.StringValueExpression
      ) => void;
      changeNodeComponent: (node_id: NodeID, component: string) => void;
      changeNodeText: (
        node_id: NodeID,
        text?: tokens.StringValueExpression
      ) => void;
      changeNodeStyle: (
        node_id: NodeID,
        key: keyof grida.program.css.ExplicitlySupportedCSSProperties,
        value: any
      ) => void;
      changeNodeMouseCursor: (
        node_id: NodeID,
        mouseCursor: cg.SystemMouseCursor
      ) => void;
      changeNodeSrc: (
        node_id: NodeID,
        src?: tokens.StringValueExpression
      ) => void;
      changeNodeHref: (
        node_id: NodeID,
        href?: grida.program.nodes.i.IHrefable["href"]
      ) => void;
      changeNodeTarget: (
        node_id: NodeID,
        target?: grida.program.nodes.i.IHrefable["target"]
      ) => void;
      changeNodePositioning: (
        node_id: NodeID,
        positioning: grida.program.nodes.i.IPositioning
      ) => void;
      changeNodePositioningMode: (
        node_id: NodeID,
        positioningMode: "absolute" | "relative"
      ) => void;
      changeNodeCornerRadius: (
        node_id: NodeID,
        cornerRadius: grida.program.nodes.i.IRectangleCorner["cornerRadius"]
      ) => void;
      changeNodeFill: (
        node_id: NodeID,
        fill:
          | grida.program.nodes.i.props.SolidPaintToken
          | cg.PaintWithoutID
          | null
      ) => void;
      changeNodeStroke: (
        node_id: NodeID,
        stroke:
          | grida.program.nodes.i.props.SolidPaintToken
          | cg.PaintWithoutID
          | null
      ) => void;
      changeNodeStrokeWidth: (
        node_id: NodeID,
        strokeWidth: TChange<number>
      ) => void;
      changeNodeStrokeCap: (node_id: NodeID, strokeCap: cg.StrokeCap) => void;
      changeNodeFit: (node_id: NodeID, fit: cg.BoxFit) => void;
      changeNodeOpacity: (node_id: NodeID, opacity: TChange<number>) => void;
      changeNodeRotation: (node_id: NodeID, rotation: TChange<number>) => void;
      changeTextNodeFontFamily: (node_id: NodeID, fontFamily: string) => void;
      changeTextNodeFontWeight: (
        node_id: NodeID,
        fontWeight: cg.NFontWeight
      ) => void;
      changeTextNodeFontSize: (
        node_id: NodeID,
        fontSize: TChange<number>
      ) => void;
      changeTextNodeTextAlign: (
        node_id: NodeID,
        textAlign: cg.TextAlign
      ) => void;
      changeTextNodeTextAlignVertical: (
        node_id: NodeID,
        textAlignVertical: cg.TextAlignVertical
      ) => void;
      changeTextNodeLineHeight: (
        node_id: NodeID,
        lineHeight: TChange<grida.program.nodes.TextNode["lineHeight"]>
      ) => void;
      changeTextNodeLetterSpacing: (
        node_id: NodeID,
        letterSpacing: TChange<grida.program.nodes.TextNode["letterSpacing"]>
      ) => void;
      changeTextNodeMaxlength: (
        node_id: NodeID,
        maxlength: number | undefined
      ) => void;
      changeContainerNodePadding: (
        node_id: NodeID,
        padding: grida.program.nodes.i.IPadding["padding"]
      ) => void;
      changeNodeBoxShadow: (node_id: NodeID, boxShadow?: cg.BoxShadow) => void;
      changeContainerNodeLayout: (
        node_id: NodeID,
        layout: grida.program.nodes.i.IFlexContainer["layout"]
      ) => void;
      changeFlexContainerNodeDirection: (
        node_id: string,
        direction: cg.Axis
      ) => void;
      changeFlexContainerNodeMainAxisAlignment: (
        node_id: string,
        mainAxisAlignment: cg.MainAxisAlignment
      ) => void;
      changeFlexContainerNodeCrossAxisAlignment: (
        node_id: string,
        crossAxisAlignment: cg.CrossAxisAlignment
      ) => void;
      changeFlexContainerNodeGap: (
        node_id: string,
        gap: number | { mainAxisGap: number; crossAxisGap: number }
      ) => void;
    }

    export interface IDocumentEditorActions {
      loadScene: (scene_id: string) => void;
      createScene: (scene?: grida.program.document.SceneInit) => void;
      deleteScene: (scene_id: string) => void;
      duplicateScene: (scene_id: string) => void;
      renameScene: (scene_id: string, name: string) => void;

      //
      hoverNode: (node_id: string, event: "enter" | "leave") => void;
      hoverEnterNode: (node_id: string) => void;
      hoverLeaveNode: (node_id: string) => void;

      //
      select: (...selectors: grida.program.document.Selector[]) => void;
      blur: () => void;
      undo: () => void;
      redo: () => void;
      cut: (target: "selection" | NodeID) => void;
      copy: (target: "selection" | NodeID) => void;
      paste: () => void;
      duplicate: (target: "selection" | NodeID) => void;

      setClipboardColor: (color: cg.RGBA8888) => void;
      deleteNode: (target: "selection" | NodeID) => void;

      //
      createNodeId: () => NodeID;
      getNodeById: (node_id: NodeID) => grida.program.nodes.Node;
      getNodeDepth: (node_id: NodeID) => number;
      getNodeAbsoluteRotation: (node_id: NodeID) => number;
      insertNode: (prototype: grida.program.nodes.NodePrototype) => void;

      //
      nudge: (
        target: "selection" | NodeID,
        axis: "x" | "y",
        delta: number,
        config?: NudgeUXConfig
      ) => void;
      nudgeResize: (
        target: "selection" | NodeID,
        axis: "x" | "y",
        delta: number
      ) => void;
      a11yarrow: (
        target: "selection" | NodeID,
        direction: "up" | "down" | "left" | "right",
        shiftKey: boolean,
        config?: NudgeUXConfig
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
      mv: (source: NodeID[], target: NodeID, index?: number) => void;
      //
      distributeEvenly: (
        target: "selection" | NodeID[],
        axis: "x" | "y"
      ) => void;
      autoLayout: (target: "selection" | NodeID[]) => void;
      contain: (target: "selection" | NodeID[]) => void;
      configureSurfaceRaycastTargeting: (
        config: Partial<SurfaceRaycastTargeting>
      ) => void;
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
      // //
      toggleActive: (target: "selection" | NodeID) => void;
      toggleLocked: (target: "selection" | NodeID) => void;
      toggleBold: (target: "selection" | NodeID) => void;
      // //
      setOpacity: (target: "selection" | NodeID, opacity: number) => void;
      // //
      schemaDefineProperty: (
        key?: string,
        definition?: grida.program.schema.PropertyDefinition
      ) => void;
      schemaRenameProperty: (key: string, newName: string) => void;
      schemaUpdateProperty: (
        key: string,
        definition: grida.program.schema.PropertyDefinition
      ) => void;
      schemaPutProperty: (key: string, value: any) => void;
      schemaDeleteProperty: (key: string) => void;
    }

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
      distributeEvenly: (
        target: "selection" | NodeID[],
        axis: "x" | "y"
      ) => void;

      toggleActive: (target: "selection" | NodeID) => void;
      toggleLocked: (target: "selection" | NodeID) => void;
      toggleBold: (target: "selection" | NodeID) => void;
      setOpacity: (target: "selection" | NodeID, opacity: number) => void;

      createRectangle(
        props: Omit<grida.program.nodes.NodePrototype, "type">
      ): void;
      createEllipse(
        props: Omit<grida.program.nodes.NodePrototype, "type">
      ): void;
      createText(props: Omit<grida.program.nodes.NodePrototype, "type">): void;

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
}
