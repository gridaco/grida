import produce from "immer";
import { Action, editor } from ".";
import reducer from "./reducers";
import grida from "@grida/schema";
import cg from "@grida/cg";
import nid from "./reducers/tools/id";
import type { TChange } from "./action";
import type { tokens } from "@grida/tokens";

export class Editor
  implements editor.api.IDocumentEditorActions, editor.api.INodeChangeActions
{
  private listeners: Set<(editor: this, action?: Action) => void>;
  private mstate: editor.state.IEditorState;

  constructor(initialState: editor.state.IEditorStateInit) {
    this.listeners = new Set();
    this.mstate = editor.state.init(initialState);
  }

  private _locked: boolean = false;

  /**
   * If the editor is locked, no actions will be dispatched. (unless forced)
   */
  get locked() {
    return this._locked;
  }

  set locked(value: boolean) {
    this._locked = value;
  }

  get debug() {
    return this.mstate.debug;
  }

  set debug(value: boolean) {
    this.mstate = produce(this.mstate, (draft) => {
      draft.debug = value;
    });
    this.listeners.forEach((l) => l(this));
  }

  public toggleDebug() {
    this.debug = !this.debug;
    return this.debug;
  }

  public reset(state: editor.state.IEditorState, force: boolean = false) {
    this.dispatch(
      {
        type: "__internal/reset",
        state,
      },
      force
    );
  }

  public insert(
    payload:
      | {
          id?: string;
          prototype: grida.program.nodes.NodePrototype;
        }
      | {
          document: grida.program.document.IPackedSceneDocument;
        }
  ) {
    this.dispatch({
      type: "insert",
      ...payload,
    });
  }

  public dispatch(action: Action, force: boolean = false) {
    if (this._locked && !force) return;
    this.mstate = reducer(this.mstate, action);
    this.listeners.forEach((l) => l(this, action));
  }

  public subscribe(fn: (editor: this, action?: Action) => void) {
    this.listeners.add(fn);
    return () => this.listeners.delete(fn);
  }

  public getSnapshot() {
    return this.mstate;
  }

  public getJson(): unknown {
    return JSON.parse(JSON.stringify(this.mstate));
  }

  public getDocumentJson(): unknown {
    return JSON.parse(JSON.stringify(this.mstate.document));
  }

  // #region IDocumentEditorActions implementation
  public loadScene(scene_id: string) {
    this.dispatch({
      type: "load",
      scene: scene_id,
    });
  }

  public createScene(scene?: grida.program.document.SceneInit) {
    this.dispatch({
      type: "scenes/new",
      scene: scene,
    });
  }

  public deleteScene(scene_id: string) {
    this.dispatch({
      type: "scenes/delete",
      scene: scene_id,
    });
  }

  public duplicateScene(scene_id: string) {
    this.dispatch({
      type: "scenes/duplicate",
      scene: scene_id,
    });
  }

  public renameScene(scene_id: string, name: string) {
    this.dispatch({
      type: "scenes/change/name",
      scene: scene_id,
      name,
    });
  }

  public changeSceneBackground(
    scene_id: string,
    backgroundColor: grida.program.document.ISceneBackground["backgroundColor"]
  ) {
    this.dispatch({
      type: "scenes/change/background-color",
      scene: scene_id,
      backgroundColor,
    });
  }

  setTool(tool: editor.state.ToolMode) {
    this.dispatch({
      type: "surface/tool",
      tool: tool,
    });
  }

  /**
   * Try to enter content edit mode - only works when the selected node is a text or vector node
   *
   * when triggered on such invalid context, it should be a no-op
   */
  tryEnterContentEditMode() {
    this.dispatch({
      type: "surface/content-edit-mode/try-enter",
    });
  }

  tryExitContentEditMode() {
    this.dispatch({
      type: "surface/content-edit-mode/try-exit",
    });
  }

  tryToggleContentEditMode() {
    if (this.mstate.content_edit_mode) {
      this.tryExitContentEditMode();
    } else {
      this.tryEnterContentEditMode();
    }
  }

  public hoverNode(node_id: string, event: "enter" | "leave") {
    this.dispatch({
      type: "hover",
      target: node_id,
      event,
    });
  }

  public hoverEnterNode(node_id: string) {
    this.hoverNode(node_id, "enter");
  }

  public hoverLeaveNode(node_id: string) {
    this.hoverNode(node_id, "leave");
  }

  public select(...selectors: grida.program.document.Selector[]) {
    this.dispatch({
      type: "select",
      selectors,
    });
  }

  public blur() {
    this.dispatch({
      type: "blur",
    });
  }

  public undo() {
    this.dispatch({
      type: "undo",
    });
  }

  public redo() {
    this.dispatch({
      type: "redo",
    });
  }

  public cut(target: "selection" | editor.NodeID) {
    this.dispatch({
      type: "cut",
      target,
    });
  }

  public copy(target: "selection" | editor.NodeID) {
    this.dispatch({
      type: "copy",
      target,
    });
  }

  public paste() {
    this.dispatch({
      type: "paste",
    });
  }

  public duplicate(target: "selection" | editor.NodeID) {
    this.dispatch({
      type: "duplicate",
      target,
    });
  }

  public setClipboardColor(color: cg.RGBA8888) {
    this.dispatch({
      type: "clip/color",
      color,
    });
  }

  public deleteNode(target: "selection" | editor.NodeID) {
    this.dispatch({
      type: "delete",
      target,
    });
  }

  public selectVertex(node_id: editor.NodeID, vertex: number) {
    this.dispatch({
      type: "select-vertex",
      target: {
        node_id,
        vertex,
      },
    });
  }

  public deleteVertex(node_id: editor.NodeID, vertex: number) {
    this.dispatch({
      type: "delete-vertex",
      target: {
        node_id,
        vertex,
      },
    });
  }

  public createNodeId(): editor.NodeID {
    // TODO: use a instance-wise generator
    return nid();
  }

  public getNodeById(node_id: editor.NodeID): grida.program.nodes.Node {
    return editor.dq.__getNodeById(this.mstate, node_id);
  }

  public getNodeDepth(node_id: editor.NodeID): number {
    return editor.dq.getDepth(this.mstate.document_ctx, node_id);
  }

  public insertNode(prototype: grida.program.nodes.NodePrototype) {
    this.dispatch({
      type: "insert",
      prototype,
    });
  }

  public nudgeResize(
    target: "selection" | editor.NodeID = "selection",
    axis: "x" | "y",
    delta: number = 1
  ) {
    this.dispatch({
      type: "nudge-resize",
      delta,
      axis,
      target,
    });
  }

  public align(
    target: "selection" | editor.NodeID,
    alignment: {
      horizontal?: "none" | "min" | "max" | "center";
      vertical?: "none" | "min" | "max" | "center";
    }
  ) {
    this.dispatch({
      type: "align",
      target,
      alignment,
    });
  }

  public order(
    target: "selection" | editor.NodeID,
    order: "back" | "front" | number
  ) {
    this.dispatch({
      type: "order",
      target,
      order,
    });
  }

  public mv(source: editor.NodeID[], target: editor.NodeID, index?: number) {
    this.dispatch({
      type: "mv",
      source,
      target,
      index,
    });
  }

  public distributeEvenly(
    target: "selection" | editor.NodeID[],
    axis: "x" | "y"
  ) {
    this.dispatch({
      type: "distribute-evenly",
      target,
      axis,
    });
  }

  public autoLayout(target: "selection" | editor.NodeID[]) {
    this.dispatch({
      type: "autolayout",
      target,
    });
  }

  public contain(target: "selection" | editor.NodeID[]) {
    this.dispatch({
      type: "contain",
      target,
    });
  }

  public configureSurfaceRaycastTargeting(
    config: Partial<editor.state.HitTestingConfig>
  ) {
    this.dispatch({
      type: "config/surface/raycast-targeting",
      config,
    });
  }

  public configureMeasurement(measurement: "on" | "off") {
    this.dispatch({
      type: "config/surface/measurement",
      measurement,
    });
  }

  public configureTranslateWithCloneModifier(
    translate_with_clone: "on" | "off"
  ) {
    this.dispatch({
      type: "config/modifiers/translate-with-clone",
      translate_with_clone,
    });
  }

  public configureTranslateWithAxisLockModifier(
    tarnslate_with_axis_lock: "on" | "off"
  ) {
    this.dispatch({
      type: "config/modifiers/translate-with-axis-lock",
      tarnslate_with_axis_lock,
    });
  }

  public configureTransformWithCenterOriginModifier(
    transform_with_center_origin: "on" | "off"
  ) {
    this.dispatch({
      type: "config/modifiers/transform-with-center-origin",
      transform_with_center_origin,
    });
  }

  public configureTransformWithPreserveAspectRatioModifier(
    transform_with_preserve_aspect_ratio: "on" | "off"
  ) {
    this.dispatch({
      type: "config/modifiers/transform-with-preserve-aspect-ratio",
      transform_with_preserve_aspect_ratio,
    });
  }

  public configureRotateWithQuantizeModifier(
    rotate_with_quantize: number | "off"
  ) {
    this.dispatch({
      type: "config/modifiers/rotate-with-quantize",
      rotate_with_quantize,
    });
  }

  public toggleActive(target: "selection" | editor.NodeID = "selection") {
    const target_ids =
      target === "selection" ? this.mstate.selection : [target];
    target_ids.forEach((node_id) => {
      this.dispatch({
        type: "node/toggle/active",
        node_id,
      });
    });
  }

  public toggleLocked(target: "selection" | editor.NodeID = "selection") {
    const target_ids =
      target === "selection" ? this.mstate.selection : [target];
    target_ids.forEach((node_id) => {
      this.dispatch({
        type: "node/toggle/locked",
        node_id,
      });
    });
  }

  public toggleBold(target: "selection" | editor.NodeID = "selection") {
    const target_ids =
      target === "selection" ? this.mstate.selection : [target];
    target_ids.forEach((node_id) => {
      this.dispatch({
        type: "node/toggle/bold",
        node_id,
      });
    });
  }

  public setOpacity(
    target: "selection" | editor.NodeID = "selection",
    opacity: number
  ) {
    const target_ids =
      target === "selection" ? this.mstate.selection : [target];
    target_ids.forEach((node_id) => {
      this.dispatch({
        type: "node/change/opacity",
        node_id,
        opacity: { type: "set", value: opacity },
      });
    });
  }

  public schemaDefineProperty(
    key?: string,
    definition?: grida.program.schema.PropertyDefinition
  ) {
    this.dispatch({
      type: "document/properties/define",
      key,
      definition,
    });
  }

  public schemaRenameProperty(key: string, newName: string) {
    this.dispatch({
      type: "document/properties/rename",
      key,
      newKey: newName,
    });
  }

  public schemaUpdateProperty(
    key: string,
    definition: grida.program.schema.PropertyDefinition
  ) {
    this.dispatch({
      type: "document/properties/update",
      key,
      definition,
    });
  }

  public schemaPutProperty(key: string, value: any) {
    this.dispatch({
      type: "document/properties/put",
      key,
      definition: value,
    });
  }

  public schemaDeleteProperty(key: string) {
    this.dispatch({
      type: "document/properties/delete",
      key,
    });
  }
  // #endregion IDocumentEditorActions implementation

  // #region INodeChangeActios

  toggleNodeActive(node_id: string) {
    this.dispatch({
      type: "node/toggle/active",
      node_id: node_id,
    });
  }
  toggleNodeLocked(node_id: string) {
    this.dispatch({
      type: "node/toggle/locked",
      node_id: node_id,
    });
  }
  toggleNodeBold(node_id: string) {
    this.dispatch({
      type: "node/toggle/bold",
      node_id: node_id,
    });
  }
  changeNodeProps(
    node_id: string,
    key: string,
    value?: tokens.StringValueExpression
  ) {
    this.dispatch({
      type: "node/change/props",
      node_id: node_id,
      props: {
        [key]: value,
      },
    });
  }
  changeNodeComponent(node_id: string, component_id: string) {
    this.dispatch({
      type: "node/change/component",
      node_id: node_id,
      component_id: component_id,
    });
  }
  changeNodeText(node_id: string, text?: tokens.StringValueExpression) {
    this.dispatch({
      type: "node/change/text",
      node_id: node_id,
      text,
    });
  }
  changeNodeName(node_id: string, name: string) {
    this.dispatch({
      type: "node/change/name",
      node_id: node_id,
      name: name,
    });
  }
  changeNodeUserData(node_id: string, userdata: unknown) {
    this.dispatch({
      type: "node/change/userdata",
      node_id: node_id,
      userdata: userdata as any,
    });
  }
  changeNodeActive(node_id: string, active: boolean) {
    this.dispatch({
      type: "node/change/active",
      node_id: node_id,
      active: active,
    });
  }
  changeNodeLocked(node_id: string, locked: boolean) {
    this.dispatch({
      type: "node/change/locked",
      node_id: node_id,
      locked: locked,
    });
  }
  changeNodePositioning(
    node_id: string,
    positioning: grida.program.nodes.i.IPositioning
  ) {
    this.dispatch({
      type: "node/change/positioning",
      node_id: node_id,
      positioning,
    });
  }
  changeNodePositioningMode(
    node_id: string,
    position: grida.program.nodes.i.IPositioning["position"]
  ) {
    this.dispatch({
      type: "node/change/positioning-mode",
      node_id: node_id,
      position,
    });
  }
  changeNodeSrc(node_id: string, src?: tokens.StringValueExpression) {
    this.dispatch({
      type: "node/change/src",
      node_id: node_id,
      src,
    });
  }
  changeNodeHref(
    node_id: string,
    href?: grida.program.nodes.i.IHrefable["href"]
  ) {
    this.dispatch({
      type: "node/change/href",
      node_id: node_id,
      href,
    });
  }
  changeNodeTarget(
    node_id: string,
    target?: grida.program.nodes.i.IHrefable["target"]
  ) {
    this.dispatch({
      type: "node/change/target",
      node_id: node_id,
      target,
    });
  }
  changeNodeOpacity(node_id: string, opacity: TChange<number>) {
    requestAnimationFrame(() => {
      this.dispatch({
        type: "node/change/opacity",
        node_id: node_id,
        opacity,
      });
    });
  }
  changeNodeRotation(node_id: string, rotation: TChange<number>) {
    requestAnimationFrame(() => {
      this.dispatch({
        type: "node/change/rotation",
        node_id: node_id,
        rotation,
      });
    });
  }
  changeNodeSize(
    node_id: string,
    axis: "width" | "height",
    value: grida.program.css.LengthPercentage | "auto"
  ) {
    requestAnimationFrame(() => {
      this.dispatch({
        type: "node/change/size",
        node_id: node_id,
        axis,
        value: value,
      });
    });
  }
  changeNodeFill(
    node_id: string,
    fill: grida.program.nodes.i.props.SolidPaintToken | cg.PaintWithoutID | null
  ) {
    requestAnimationFrame(() => {
      this.dispatch({
        type: "node/change/fill",
        node_id: node_id,
        fill,
      });
    });
  }
  changeNodeStroke(
    node_id: string,
    stroke:
      | grida.program.nodes.i.props.SolidPaintToken
      | cg.PaintWithoutID
      | null
  ) {
    requestAnimationFrame(() => {
      this.dispatch({
        type: "node/change/stroke",
        node_id: node_id,
        stroke,
      });
    });
  }
  changeNodeStrokeWidth(node_id: string, strokeWidth: TChange<number>) {
    requestAnimationFrame(() => {
      this.dispatch({
        type: "node/change/stroke-width",
        node_id: node_id,
        strokeWidth,
      });
    });
  }
  changeNodeStrokeCap(node_id: string, strokeCap: cg.StrokeCap) {
    requestAnimationFrame(() => {
      this.dispatch({
        type: "node/change/stroke-cap",
        node_id: node_id,
        strokeCap,
      });
    });
  }
  changeNodeFit(node_id: string, fit: cg.BoxFit) {
    requestAnimationFrame(() => {
      this.dispatch({
        type: "node/change/fit",
        node_id: node_id,
        fit,
      });
    });
  }
  changeNodeCornerRadius(
    node_id: string,
    cornerRadius: grida.program.nodes.i.IRectangleCorner["cornerRadius"]
  ) {
    requestAnimationFrame(() => {
      this.dispatch({
        type: "node/change/cornerRadius",
        node_id: node_id,
        cornerRadius,
      });
    });
  }
  // text style
  changeTextNodeFontFamily(node_id: string, fontFamily: string | undefined) {
    requestAnimationFrame(() => {
      this.dispatch({
        type: "node/change/fontFamily",
        node_id: node_id,
        fontFamily,
      });
    });
  }
  changeTextNodeFontWeight(node_id: string, fontWeight: cg.NFontWeight) {
    requestAnimationFrame(() => {
      this.dispatch({
        type: "node/change/fontWeight",
        node_id: node_id,
        fontWeight,
      });
    });
  }
  changeTextNodeFontSize(node_id: string, fontSize: TChange<number>) {
    requestAnimationFrame(() => {
      this.dispatch({
        type: "node/change/fontSize",
        node_id: node_id,
        fontSize,
      });
    });
  }
  changeTextNodeTextAlign(node_id: string, textAlign: cg.TextAlign) {
    requestAnimationFrame(() => {
      this.dispatch({
        type: "node/change/textAlign",
        node_id: node_id,
        textAlign,
      });
    });
  }
  changeTextNodeTextAlignVertical(
    node_id: string,
    textAlignVertical: cg.TextAlignVertical
  ) {
    requestAnimationFrame(() => {
      this.dispatch({
        type: "node/change/textAlignVertical",
        node_id: node_id,
        textAlignVertical,
      });
    });
  }
  changeTextNodeLineHeight(
    node_id: string,
    lineHeight: TChange<grida.program.nodes.TextNode["lineHeight"]>
  ) {
    requestAnimationFrame(() => {
      this.dispatch({
        type: "node/change/lineHeight",
        node_id: node_id,
        lineHeight,
      });
    });
  }
  changeTextNodeLetterSpacing(
    node_id: string,
    letterSpacing: TChange<grida.program.nodes.TextNode["letterSpacing"]>
  ) {
    requestAnimationFrame(() => {
      this.dispatch({
        type: "node/change/letterSpacing",
        node_id: node_id,
        letterSpacing,
      });
    });
  }
  changeTextNodeMaxlength(node_id: string, maxlength: number | undefined) {
    requestAnimationFrame(() => {
      this.dispatch({
        type: "node/change/maxlength",
        node_id: node_id,
        maxlength,
      });
    });
  }
  //
  changeNodeBorder(
    node_id: string,
    border: grida.program.css.Border | undefined
  ) {
    requestAnimationFrame(() => {
      this.dispatch({
        type: "node/change/border",
        node_id: node_id,
        border: border,
      });
    });
  }
  //
  changeContainerNodePadding(
    node_id: string,
    padding: grida.program.nodes.i.IPadding["padding"]
  ) {
    requestAnimationFrame(() => {
      this.dispatch({
        type: "node/change/padding",
        node_id: node_id,
        padding,
      });
    });
  }
  changeNodeBoxShadow(node_id: string, boxShadow?: cg.BoxShadow) {
    requestAnimationFrame(() => {
      this.dispatch({
        type: "node/change/box-shadow",
        node_id: node_id,
        boxShadow,
      });
    });
  }
  changeContainerNodeLayout(
    node_id: string,
    layout: grida.program.nodes.i.IFlexContainer["layout"]
  ) {
    requestAnimationFrame(() => {
      this.dispatch({
        type: "node/change/layout",
        node_id: node_id,
        layout,
      });
    });
  }
  changeFlexContainerNodeDirection(node_id: string, direction: cg.Axis) {
    requestAnimationFrame(() => {
      this.dispatch({
        type: "node/change/direction",
        node_id: node_id,
        direction,
      });
    });
  }
  changeFlexContainerNodeMainAxisAlignment(
    node_id: string,
    mainAxisAlignment: cg.MainAxisAlignment
  ) {
    requestAnimationFrame(() => {
      this.dispatch({
        type: "node/change/mainAxisAlignment",
        node_id: node_id,
        mainAxisAlignment,
      });
    });
  }
  changeFlexContainerNodeCrossAxisAlignment(
    node_id: string,
    crossAxisAlignment: cg.CrossAxisAlignment
  ) {
    requestAnimationFrame(() => {
      this.dispatch({
        type: "node/change/crossAxisAlignment",
        node_id: node_id,
        crossAxisAlignment,
      });
    });
  }
  changeFlexContainerNodeGap(
    node_id: string,
    gap: number | { mainAxisGap: number; crossAxisGap: number }
  ) {
    requestAnimationFrame(() => {
      this.dispatch({
        type: "node/change/gap",
        node_id: node_id,
        gap,
      });
    });
  }
  //
  changeNodeMouseCursor(node_id: string, cursor: cg.SystemMouseCursor) {
    this.dispatch({
      type: "node/change/mouse-cursor",
      node_id,
      cursor,
    });
  }
  changeNodeStyle(
    node_id: string,
    key: keyof grida.program.css.ExplicitlySupportedCSSProperties,
    value: any
  ) {
    requestAnimationFrame(() => {
      this.dispatch({
        type: "node/change/style",
        node_id: node_id,
        style: {
          [key]: value,
        },
      });
    });
  }
  // #endregion INodeChangeActios
}
