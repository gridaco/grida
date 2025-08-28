"use client";

import React, { useCallback, useMemo } from "react";

import {
  SidebarMenuSectionContent,
  SidebarSection,
  SidebarSectionHeaderActions,
  SidebarSectionHeaderItem,
  SidebarSectionHeaderLabel,
} from "@/components/sidebar";
import { TextAlignControl } from "./controls/text-align";
import { FontSizeControl } from "./controls/font-size";
import { FontWeightControl } from "./controls/font-weight";
import { OpacityControl } from "./controls/opacity";
import { HrefControl } from "./controls/href";
import {
  CornerRadius4Control,
  CornerRadiusControl,
} from "./controls/corner-radius";
import { BorderControl } from "./controls/border";
import { FillControl } from "./controls/fill";
import { StringValueControl } from "./controls/string-value";
import { PaddingControl } from "./controls/padding";
import { GapControl } from "./controls/gap";
import { CrossAxisAlignmentControl } from "./controls/cross-axis-alignment";
import { MainAxisAlignmentControl } from "./controls/main-axis-alignment";
import { TemplateControl } from "./controls/template";
import { CursorControl } from "./controls/cursor";
import { PropertyLine, PropertyLineLabel } from "./ui";
import { SrcControl } from "./controls/src";
import { BoxFitControl } from "./controls/box-fit";
import { PropsControl } from "./controls/props";
import { TargetBlankControl } from "./controls/target";
import { ExportNodeControl } from "./controls/export";
import { FontFamilyControl } from "./controls/font-family";
import {
  PositioningConstraintsControl,
  PositioningModeControl,
} from "./controls/positioning";
import { RotateControl } from "./controls/rotate";
import { TextAlignVerticalControl } from "./controls/text-align-vertical";
import { LetterSpacingControl } from "./controls/letter-spacing";
import { LineHeightControl } from "./controls/line-height";
import { NameControl } from "./controls/name";
import { UserDataControl } from "./controls/x-userdata";
import { LengthPercentageControl } from "./controls/length-percentage";
import { LayoutControl } from "./controls/layout";
import { AxisControl } from "./controls/axis";
import { MaxlengthControl } from "./controls/maxlength";
import { BlendModeDropdown } from "./controls/blend-mode";
import {
  useComputedNode,
  useCurrentEditor,
  useEditorState,
} from "@/grida-canvas-react";
import {
  Crosshair2Icon,
  LockClosedIcon,
  LockOpen1Icon,
  MixerVerticalIcon,
  PlusIcon,
} from "@radix-ui/react-icons";
import { supports } from "@/grida-canvas/utils/supports";
import { StrokeWidthControl } from "./controls/stroke-width";
import { PaintControl } from "./controls/paint";
import { StrokeCapControl } from "./controls/stroke-cap";
import grida from "@grida/schema";
import {
  useCurrentSceneState,
  useEditorFlagsState,
  useNodeActions,
  useNodeState,
  useSelectionState,
  useBackendState,
  useContentEditModeMinimalState,
} from "@/grida-canvas-react/provider";
import { Checkbox } from "@/components/ui/checkbox";
import { Toggle } from "@/components/ui/toggle";
import { AlignControl as _AlignControl } from "./controls/ext-align";
import { Button } from "@/components/ui-editor/button";
import { ZoomControl } from "./controls/ext-zoom";
import { SchemaProvider, useSchema } from "./schema";
import { BoltIcon } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PropertyAccessExpressionControl } from "./controls/props-property-access-expression";
import { dq } from "@/grida-canvas/query";
import { StrokeAlignControl } from "./controls/stroke-align";
import { TextDetails } from "./controls/widgets/text-details";
import cg from "@grida/cg";
import { FeControl } from "./controls/fe";
import InputPropertyNumber from "./ui/number";
import { ArcPropertiesControl } from "./controls/arc-properties";
import { ModeVectorEditModeProperties } from "./chunks/mode-vector";
import { OpsControl } from "./controls/ext-ops";
import { MaskControl } from "./controls/ext-mask";
import {
  useMixedProperties,
  useMixedPaints,
  MixedPropertiesEditor,
} from "@/grida-canvas-react/use-mixed-properties";
import { editor } from "@/grida-canvas";

function Align() {
  const editor = useCurrentEditor();
  const { selection } = useSelectionState();
  const has_selection = selection.length >= 1;

  return (
    <_AlignControl
      disabled={!has_selection}
      onAlign={(alignment) => {
        editor.align("selection", alignment);
      }}
      onDistributeEvenly={(axis) => {
        editor.distributeEvenly("selection", axis);
      }}
      className="justify-between"
    />
  );
}

function BooleanOperations() {
  const editor = useCurrentEditor();
  const { selection } = useSelectionState();
  const backend = useBackendState();
  const has_selection = selection.length >= 1;
  const supports_boolean = backend === "canvas";

  return (
    <SidebarSection className="mt-2 flex justify-center">
      <OpsControl
        disabled={!has_selection || !supports_boolean}
        onOp={(op) => {
          editor.op(selection, op);
        }}
      />
    </SidebarSection>
  );
}

function Header() {
  return (
    <>
      <div className="w-full flex items-center justify-end gap-1">
        <MaskControl disabled />
        <BooleanOperations />
      </div>
      <hr />
    </>
  );
}

export const Zoom = ZoomControl;

export function Selection({
  empty,
  config,
}: {
  empty?: React.ReactNode;
  config?: ControlsConfig;
}) {
  const instance = useCurrentEditor();
  const selection = useEditorState(instance, (state) => state.selection);
  const documentProperties = useEditorState(
    instance,
    (state) => state.document.properties
  );
  const cem = useContentEditModeMinimalState();

  const is_vector_edit_mode = cem?.type === "vector";
  const selection_length = selection.length;
  const is_empty = selection_length === 0 && !is_vector_edit_mode;

  if (is_empty) {
    return empty;
  }

  return (
    <SchemaProvider
      schema={{
        properties: documentProperties,
      }}
    >
      <Header />
      {is_vector_edit_mode ? (
        <ModeVectorEditModeProperties node_id={cem.node_id} />
      ) : (
        <>
          {selection_length === 0 && empty && empty}
          {selection_length === 1 && (
            <ModeNodeProperties config={config} node_id={selection[0]} />
          )}
          {selection_length > 1 && (
            <ModeMixedNodeProperties ids={selection} config={config} />
          )}
        </>
      )}
    </SchemaProvider>
  );
}

export interface ControlsConfig {
  base?: "on" | "off";
  position?: "on" | "off";
  size?: "on" | "off";
  template?: "on" | "off";
  link?: "on" | "off";
  developer?: "on" | "off";
  export?: "on" | "off";
  props?: "on" | "off";
  text?: "on" | "off";
  image?: "on" | "off";
  layout?: "on" | "off";
}

const __default_controls_config: ControlsConfig = {
  base: "on",
  position: "on",
  size: "on",
  template: "on",
  link: "on",
  developer: "on",
  export: "on",
  props: "on",
  text: "on",
  image: "on",
};

function ModeMixedNodeProperties({
  ids,
  config = __default_controls_config,
}: {
  ids: string[];
  config?: ControlsConfig;
}) {
  const scene = useCurrentSceneState();
  const backend = useBackendState();
  const mp = useMixedProperties(ids);
  const { nodes, properties, actions: change } = mp;
  const {
    name,
    active,
    locked,
    component_id,
    style,
    type,
    // properties,
    opacity,
    cornerRadius,
    rotation,
    fill,
    stroke,
    strokeWidth,
    strokeCap,
    position,
    width,
    height,
    left,
    top,
    right,
    bottom,
    fit,
    fontFamily,
    fontWeight,
    fontSize,
    lineHeight,
    letterSpacing,
    textAlign,
    textAlignVertical,
    maxLength,

    //
    border,
    //
    padding,

    //
    layout,
    direction,
    mainAxisAlignment,
    crossAxisAlignment,
    mainAxisGap,
    crossAxisGap,
    //
    cursor,

    // x
    userdata,
  } = properties;

  const sid = ids.join(",");
  // const is_root = ids.length === 0 && scene.children.includes(ids[0]); // assuming when root is selected, only root is selected
  const types = new Set(nodes.map((n) => n.type));
  const _types = Array.from(types);

  const supports_corner_radius = _types.some((t) =>
    supports.cornerRadius(t, { backend })
  );
  const supports_stroke = _types.some((t) => supports.stroke(t, { backend }));
  const supports_stroke_cap = _types.some((t) =>
    supports.strokeCap(t, { backend })
  );
  const has_container = types.has("container");
  const has_flex_container =
    has_container && nodes.some((n) => "layout" in n && n.layout === "flex");

  return (
    <div key={sid} className="mt-4 mb-10">
      <SidebarSection hidden={config.base === "off"} className="border-b pb-4">
        <SidebarMenuSectionContent className="space-y-2">
          <PropertyLine className="items-center gap-1">
            <Checkbox
              checked={active.mixed ? false : active.value}
              disabled={active.mixed}
              onCheckedChange={change.active}
              className="me-1"
            />
            <NameControl
              value={name.mixed ? `${ids.length} selections` : name.value}
              disabled={name.mixed}
              onValueChange={change.name}
            />
            <Toggle
              variant="outline"
              size="sm"
              disabled={locked.mixed}
              pressed={locked.mixed ? true : locked.value}
              onPressedChange={change.locked}
              className="size-6 p-0.5 aspect-square"
            >
              {locked ? (
                <LockClosedIcon className="size-3" />
              ) : (
                <LockOpen1Icon className="size-3" />
              )}
            </Toggle>
            {/* <small className="ms-2 font-mono">{id}</small> */}
          </PropertyLine>
        </SidebarMenuSectionContent>
      </SidebarSection>
      {config.position !== "off" && <SectionMixedPosition mp={mp} />}
      <SidebarSection hidden={config.size === "off"} className="border-b pb-4">
        <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>Size</SidebarSectionHeaderLabel>
        </SidebarSectionHeaderItem>
        <SidebarMenuSectionContent className="space-y-2">
          <PropertyLine>
            <PropertyLineLabel>Width</PropertyLineLabel>
            <LengthPercentageControl
              value={width?.value}
              onValueCommit={change.width}
            />
          </PropertyLine>
          <PropertyLine>
            <PropertyLineLabel>Height</PropertyLineLabel>
            <LengthPercentageControl
              value={height?.value}
              onValueCommit={change.height}
            />
          </PropertyLine>
        </SidebarMenuSectionContent>
      </SidebarSection>
      <SidebarSection className="border-b pb-4">
        <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>Appearance</SidebarSectionHeaderLabel>
        </SidebarSectionHeaderItem>
        <SidebarMenuSectionContent className="space-y-2">
          <PropertyLine>
            <PropertyLineLabel>Opacity</PropertyLineLabel>
            <OpacityControl
              value={opacity?.value}
              // onValueChange={change.opacity}
              onValueCommit={change.opacity}
            />
          </PropertyLine>
          {supports_corner_radius && (
            <PropertyLine>
              <PropertyLineLabel>Radius</PropertyLineLabel>
              {cornerRadius?.mixed ? (
                <CornerRadius4Control onValueCommit={change.cornerRadius} />
              ) : (
                <CornerRadius4Control
                  value={{ cornerRadius: cornerRadius?.value }}
                  onValueCommit={change.cornerRadius}
                />
              )}
            </PropertyLine>
          )}
          {/* {supports.border(node.type) && (
              <PropertyLine>
                <PropertyLineLabel>Border</PropertyLineLabel>
                <BorderControl value={border} onValueChange={actions.border} />
              </PropertyLine>
            )} */}

          {/* <PropertyLine>
              <PropertyLineLabel>Shadow</PropertyLineLabel>
              <BoxShadowControl
                value={{ boxShadow }}
                onValueChange={actions.boxShadow}
              />
            </PropertyLine> */}
        </SidebarMenuSectionContent>
      </SidebarSection>

      {/* TODO: */}
      {/* <SidebarSection hidden={!is_templateinstance} className="border-b pb-4">
          <SidebarSectionHeaderItem>
            <SidebarSectionHeaderLabel>Template</SidebarSectionHeaderLabel>
          </SidebarSectionHeaderItem>
          <SidebarMenuSectionContent>
            <TemplateControl
              value={component_id}
              onValueChange={actions.component}
            />
          </SidebarMenuSectionContent>
        </SidebarSection> */}
      {/* <SidebarSection hidden={!is_templateinstance} className="border-b pb-4">
          <SidebarSectionHeaderItem>
            <SidebarSectionHeaderLabel>Props</SidebarSectionHeaderLabel>
          </SidebarSectionHeaderItem>

          {properties && (
            <SidebarMenuSectionContent className="space-y-2">
              <PropsControl
                properties={properties}
                props={computed.props || {}}
                onValueChange={actions.value}
              />
            </SidebarMenuSectionContent>
          )}
        </SidebarSection> */}
      <SidebarSection
        hidden={config.text === "off" || !types.has("text")}
        className="border-b pb-4"
      >
        <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>Text</SidebarSectionHeaderLabel>
        </SidebarSectionHeaderItem>
        <SidebarMenuSectionContent className="space-y-2">
          <PropertyLine>
            <PropertyLineLabel>Value</PropertyLineLabel>
            <StringValueControl disabled value={"multiple"} />
          </PropertyLine>
          <PropertyLine>
            <PropertyLineLabel>Font</PropertyLineLabel>
            <div className="flex-1">
              <FontFamilyControl
                value={fontFamily?.value}
                onValueChange={change.fontFamily}
              />
            </div>
          </PropertyLine>
          <PropertyLine>
            <PropertyLineLabel>Weight</PropertyLineLabel>
            <FontWeightControl
              value={fontWeight?.value}
              onValueChange={change.fontWeight}
            />
          </PropertyLine>
          <PropertyLine>
            <PropertyLineLabel>Size</PropertyLineLabel>
            <FontSizeControl
              value={fontSize?.value}
              onValueCommit={change.fontSize}
            />
          </PropertyLine>
          <PropertyLine>
            <PropertyLineLabel>Line</PropertyLineLabel>
            <LineHeightControl
              value={lineHeight?.value}
              onValueCommit={change.lineHeight}
            />
          </PropertyLine>
          <PropertyLine>
            <PropertyLineLabel>Letter</PropertyLineLabel>
            <LetterSpacingControl
              value={letterSpacing?.value}
              onValueCommit={change.letterSpacing}
            />
          </PropertyLine>
          <PropertyLine>
            <PropertyLineLabel>Align</PropertyLineLabel>
            <TextAlignControl
              value={textAlign?.value}
              onValueChange={change.textAlign}
            />
          </PropertyLine>
          <PropertyLine>
            <PropertyLineLabel></PropertyLineLabel>
            <TextAlignVerticalControl
              value={textAlignVertical?.value}
              onValueChange={change.textAlignVertical}
            />
          </PropertyLine>
          <PropertyLine>
            <PropertyLineLabel>Max Length</PropertyLineLabel>
            <MaxlengthControl disabled placeholder={"multiple"} />
          </PropertyLine>
        </SidebarMenuSectionContent>
      </SidebarSection>
      <SidebarSection
        hidden={config.image === "off" || !types.has("image")}
        className="border-b pb-4"
      >
        <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>Image</SidebarSectionHeaderLabel>
        </SidebarSectionHeaderItem>
        <SidebarMenuSectionContent className="space-y-2">
          {/* <PropertyLine>
              <PropertyLineLabel>Source</PropertyLineLabel>
              <SrcControl value={node.src} onValueChange={actions.src} />
            </PropertyLine> */}
          <PropertyLine>
            <PropertyLineLabel>Fit</PropertyLineLabel>
            <BoxFitControl value={fit?.value} onValueChange={change.fit} />
          </PropertyLine>
        </SidebarMenuSectionContent>
      </SidebarSection>
      {types.has("container") && (
        <SidebarSection
          hidden={config.layout === "off"}
          className="border-b pb-4"
        >
          <SidebarSectionHeaderItem>
            <SidebarSectionHeaderLabel>Layout</SidebarSectionHeaderLabel>
          </SidebarSectionHeaderItem>
          <SidebarMenuSectionContent className="space-y-2">
            <PropertyLine>
              <PropertyLineLabel>Type</PropertyLineLabel>
              <LayoutControl
                value={layout?.value}
                onValueChange={change.layout}
              />
            </PropertyLine>
            <PropertyLine hidden={!has_flex_container}>
              <PropertyLineLabel>Direction</PropertyLineLabel>
              <AxisControl
                value={direction?.value}
                onValueChange={change.direction}
              />
            </PropertyLine>
            <PropertyLine hidden={!has_flex_container}>
              <PropertyLineLabel>Distribute</PropertyLineLabel>
              <MainAxisAlignmentControl
                value={mainAxisAlignment?.value}
                onValueChange={change.mainAxisAlignment}
              />
            </PropertyLine>
            <PropertyLine hidden={!has_flex_container}>
              <PropertyLineLabel>Align</PropertyLineLabel>
              <CrossAxisAlignmentControl
                value={crossAxisAlignment?.value}
                direction={
                  direction?.value !== grida.mixed
                    ? direction?.value
                    : undefined
                }
                onValueChange={change.crossAxisAlignment}
              />
            </PropertyLine>
            {/* <PropertyLine hidden={!has_flex_container}>
                <PropertyLineLabel>Gap</PropertyLineLabel>
                <GapControl
                  value={{
                    mainAxisGap: mainAxisGap!,
                    crossAxisGap: crossAxisGap!,
                  }}
                  onValueChange={actions.gap}
                />
              </PropertyLine> */}
            {/* <PropertyLine hidden={!has_flex_container}>
                <PropertyLineLabel>Padding</PropertyLineLabel>
                <PaddingControl
                  value={padding!}
                  onValueChange={actions.padding}
                />
              </PropertyLine> */}
          </SidebarMenuSectionContent>
        </SidebarSection>
      )}

      <SidebarSection className="border-b pb-4">
        <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>Fills</SidebarSectionHeaderLabel>
        </SidebarSectionHeaderItem>
        <SidebarMenuSectionContent className="space-y-2">
          <PropertyLine>
            <PropertyLineLabel>Fill</PropertyLineLabel>
            {fill?.mixed || fill?.partial ? (
              <PaintControl
                value={undefined}
                onValueChange={change.fill}
                removable
              />
            ) : (
              <PaintControl
                value={fill?.value}
                onValueChange={change.fill}
                removable
              />
            )}
          </PropertyLine>
        </SidebarMenuSectionContent>
      </SidebarSection>
      {supports_stroke && (
        <SidebarSection className="border-b pb-4">
          <SidebarSectionHeaderItem>
            <SidebarSectionHeaderLabel>Strokes</SidebarSectionHeaderLabel>
          </SidebarSectionHeaderItem>
          <SidebarMenuSectionContent className="space-y-2">
            <PropertyLine>
              <PropertyLineLabel>Color</PropertyLineLabel>
              {stroke?.mixed || stroke?.partial ? (
                <PaintControl
                  value={undefined}
                  onValueChange={change.stroke}
                  removable
                />
              ) : (
                <PaintControl
                  value={stroke?.value}
                  onValueChange={change.stroke}
                  removable
                />
              )}
            </PropertyLine>
            <PropertyLine hidden={!stroke?.value}>
              <PropertyLineLabel>Width</PropertyLineLabel>
              <StrokeWidthControl
                value={strokeWidth?.value}
                onValueCommit={change.strokeWidth}
              />
            </PropertyLine>
            <PropertyLine hidden={!supports_stroke_cap}>
              <PropertyLineLabel>Cap</PropertyLineLabel>
              <StrokeCapControl
                value={strokeCap?.value}
                onValueChange={change.strokeCap}
              />
            </PropertyLine>
          </SidebarMenuSectionContent>
        </SidebarSection>
      )}
      {backend === "dom" && (
        <SidebarSection className="border-b pb-4">
          <SidebarSectionHeaderItem>
            <SidebarSectionHeaderLabel>Actions</SidebarSectionHeaderLabel>
          </SidebarSectionHeaderItem>
          <SidebarMenuSectionContent className="space-y-2">
            {/* <PropertyLine>
                <PropertyLineLabel>Link To</PropertyLineLabel>
                <HrefControl value={node.href} onValueChange={actions.href} />
              </PropertyLine>
              {node.href && (
                <PropertyLine>
                  <PropertyLineLabel>New Tab</PropertyLineLabel>
                  <TargetBlankControl
                    value={node.target}
                    onValueChange={actions.target}
                  />
                </PropertyLine>
              )} */}
            <PropertyLine>
              <PropertyLineLabel>Cursor</PropertyLineLabel>
              <CursorControl
                value={cursor?.value}
                onValueChange={change.cursor}
              />
            </PropertyLine>
          </SidebarMenuSectionContent>
        </SidebarSection>
      )}
      {/* #region selection colors */}
      <SelectionColors />
      {/* #endregion selection colors */}
      <SidebarSection
        hidden={config.export === "off"}
        className="border-b pb-4"
      >
        <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>Export</SidebarSectionHeaderLabel>
        </SidebarSectionHeaderItem>
        <SidebarMenuSectionContent className="space-y-2">
          <PropertyLine>
            <ExportNodeControl disabled node_id={""} name={""} />
          </PropertyLine>
        </SidebarMenuSectionContent>
      </SidebarSection>
      <SidebarSection hidden={config.developer === "off"} className="pb-4">
        <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>Developer</SidebarSectionHeaderLabel>
        </SidebarSectionHeaderItem>
        <SidebarMenuSectionContent className="space-y-2">
          <PropertyLine>
            <UserDataControl disabled node_id={""} value={undefined} />
          </PropertyLine>
        </SidebarMenuSectionContent>
      </SidebarSection>
    </div>
  );
}

function ModeNodeProperties({
  node_id,
  config = __default_controls_config,
}: {
  node_id: string;
  config?: ControlsConfig;
}) {
  const instance = useCurrentEditor();
  const { debug } = useEditorFlagsState();
  const backend = useBackendState();

  const actions = useNodeActions(node_id)!;

  // TODO: chunk by usage, so the controls won't re-render when not needed
  const node = useNodeState(node_id, (node) => ({
    id: node.id,
    name: node.name,
    active: node.active,
    locked: node.locked,
    component_id: node.component_id,
    properties: node.properties,
    src: node.src,
    type: node.type,
    blendMode: node.blendMode,
    cornerRadius: node.cornerRadius,
    cornerRadiusTopLeft: node.cornerRadiusTopLeft,
    cornerRadiusTopRight: node.cornerRadiusTopRight,
    cornerRadiusBottomRight: node.cornerRadiusBottomRight,
    cornerRadiusBottomLeft: node.cornerRadiusBottomLeft,
    pointCount: node.pointCount,
    innerRadius: node.innerRadius,
    angle: node.angle,
    angleOffset: node.angleOffset,

    fit: node.fit,

    //
    border: node.border,
    //
    padding: node.padding,

    //
    layout: node.layout,
    direction: node.direction,
    mainAxisAlignment: node.mainAxisAlignment,
    crossAxisAlignment: node.crossAxisAlignment,
    mainAxisGap: node.mainAxisGap,
    crossAxisGap: node.crossAxisGap,

    //
    href: node.href,
    target: node.target,
    cursor: node.cursor,

    // x
    userdata: node.userdata,
  }));

  const computed = useComputedNode(node_id);
  const {
    id,
    name,
    active,
    locked,
    component_id,
    type,
    blendMode,
    cornerRadius,
    cornerRadiusTopLeft,
    cornerRadiusTopRight,
    cornerRadiusBottomRight,
    cornerRadiusBottomLeft,
    pointCount,
    innerRadius,
    angle,
    angleOffset,

    fit,

    //
    border,
    //
    padding,
    //
    layout,
    direction,
    mainAxisAlignment,
    crossAxisAlignment,
    mainAxisGap,
    crossAxisGap,

    //
    href,
    target,
    cursor,

    // x
    userdata,
  } = node;

  // const istemplate = type?.startsWith("templates/");
  const is_templateinstance = type === "template_instance";
  const is_text = type === "text";
  const is_image = type === "image";
  const is_container = type === "container";
  const is_flex_container = is_container && layout === "flex";
  const is_stylable = type !== "template_instance";

  return (
    <div key={node_id} className="mt-4 mb-10">
      <SidebarSection hidden={config.base === "off"} className="border-b pb-4">
        <SidebarMenuSectionContent className="space-y-2">
          <PropertyLine className="items-center gap-1">
            <ConfigurableProperty propertyName="active" propertyType="boolean">
              <Checkbox
                className="me-1"
                checked={active}
                onCheckedChange={actions.active}
              />
            </ConfigurableProperty>

            <NameControl value={name} onValueChange={actions.name} />
            <Toggle
              variant="outline"
              size="sm"
              pressed={locked}
              onPressedChange={actions.locked}
              className="size-6 p-0.5 aspect-square"
            >
              {locked ? (
                <LockClosedIcon className="size-3" />
              ) : (
                <LockOpen1Icon className="size-3" />
              )}
            </Toggle>
          </PropertyLine>

          {debug && (
            <PropertyLine className="items-center gap-1">
              <PropertyLineLabel>id</PropertyLineLabel>
              <small className="ms-2 font-mono">{id}</small>
            </PropertyLine>
          )}
        </SidebarMenuSectionContent>
      </SidebarSection>
      {config.position !== "off" && <SectionPosition node_id={node_id} />}
      {config.size !== "off" && <SectionDimension node_id={node_id} />}

      <SidebarSection
        hidden={config.template === "off" || !is_templateinstance}
        className="border-b pb-4"
      >
        <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>Template</SidebarSectionHeaderLabel>
        </SidebarSectionHeaderItem>
        <SidebarMenuSectionContent>
          <TemplateControl
            value={component_id}
            onValueChange={actions.component}
          />
        </SidebarMenuSectionContent>
      </SidebarSection>
      <SidebarSection
        hidden={config.props === "off" || !is_templateinstance}
        className="border-b pb-4"
      >
        <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>Props</SidebarSectionHeaderLabel>
        </SidebarSectionHeaderItem>

        {node.properties && Object.keys(node.properties).length ? (
          <SidebarMenuSectionContent className="space-y-2">
            <PropsControl
              properties={node.properties}
              props={computed.props || {}}
              onValueChange={actions.value}
            />
          </SidebarMenuSectionContent>
        ) : (
          <SidebarMenuSectionContent className="space-y-2">
            <p className="text-xs text-muted-foreground">
              No properties defined
            </p>
          </SidebarMenuSectionContent>
        )}
      </SidebarSection>

      <SidebarSection hidden={!is_stylable} className="border-b pb-4">
        <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>Appearance</SidebarSectionHeaderLabel>
          <SidebarSectionHeaderActions>
            <BlendModeDropdown
              value={blendMode}
              onValueChange={actions.blendMode}
            />
          </SidebarSectionHeaderActions>
        </SidebarSectionHeaderItem>
        <SidebarMenuSectionContent className="space-y-2">
          <PropertyLineOpacity node_id={node_id} />
          {supports.border(node.type, { backend }) && (
            <PropertyLine>
              <PropertyLineLabel>Border</PropertyLineLabel>
              <BorderControl value={border} onValueChange={actions.border} />
            </PropertyLine>
          )}
          {supports.cornerRadius(node.type, { backend }) && (
            <>
              {supports.cornerRadius4(node.type, { backend }) ? (
                <PropertyLine>
                  <PropertyLineLabel>Radius</PropertyLineLabel>
                  <CornerRadius4Control
                    value={{
                      cornerRadius,
                      cornerRadiusTopLeft,
                      cornerRadiusTopRight,
                      cornerRadiusBottomRight,
                      cornerRadiusBottomLeft,
                    }}
                    onValueCommit={actions.cornerRadius}
                  />
                </PropertyLine>
              ) : (
                <PropertyLine>
                  <PropertyLineLabel>Radius</PropertyLineLabel>
                  <CornerRadiusControl
                    value={cornerRadius}
                    onValueCommit={actions.cornerRadius}
                  />
                </PropertyLine>
              )}
            </>
          )}
          {(pointCount != null || innerRadius != null) && (
            <>
              {pointCount != null &&
                supports.pointCount(node.type, { backend }) && (
                  <PropertyLine>
                    <PropertyLineLabel>Count</PropertyLineLabel>
                    <InputPropertyNumber
                      mode="fixed"
                      min={3}
                      max={60}
                      value={pointCount}
                      onValueCommit={actions.pointCount}
                    />
                  </PropertyLine>
                )}
              {innerRadius != null && type !== "ellipse" && (
                <PropertyLine>
                  <PropertyLineLabel>Ratio</PropertyLineLabel>
                  <InputPropertyNumber
                    mode="fixed"
                    min={0}
                    max={1}
                    step={0.01}
                    value={innerRadius}
                    onValueCommit={actions.innerRadius}
                  />
                </PropertyLine>
              )}
            </>
          )}
          {supports.arcData(node.type, { backend }) && (
            <PropertyLine>
              <PropertyLineLabel>Arc</PropertyLineLabel>
              <ArcPropertiesControl
                value={{
                  angle: angle ?? 360,
                  angleOffset: angleOffset ?? 0,
                  innerRadius: innerRadius ?? 0,
                }}
                onValueChange={(v) => {
                  actions.arcData(v);
                }}
              />
            </PropertyLine>
          )}
        </SidebarMenuSectionContent>
      </SidebarSection>
      {config.text === "on" && is_text && <SectionText node_id={node_id} />}
      <SidebarSection
        hidden={config.image === "off" || !is_image}
        className="border-b pb-4"
      >
        <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>Image</SidebarSectionHeaderLabel>
        </SidebarSectionHeaderItem>
        <SidebarMenuSectionContent className="space-y-2">
          <PropertyLine>
            <PropertyLineLabel>Source</PropertyLineLabel>
            <SrcControl value={node.src} onValueChange={actions.src} />
          </PropertyLine>
          <PropertyLine>
            <PropertyLineLabel>Fit</PropertyLineLabel>
            <BoxFitControl value={fit} onValueChange={actions.fit} />
          </PropertyLine>
        </SidebarMenuSectionContent>
      </SidebarSection>
      {is_container && (
        <SidebarSection
          hidden={config.layout === "off"}
          className="border-b pb-4"
        >
          <SidebarSectionHeaderItem>
            <SidebarSectionHeaderLabel>Layout</SidebarSectionHeaderLabel>
          </SidebarSectionHeaderItem>
          <SidebarMenuSectionContent className="space-y-2">
            <PropertyLine>
              <PropertyLineLabel>Type</PropertyLineLabel>
              <LayoutControl value={layout!} onValueChange={actions.layout} />
            </PropertyLine>
            <PropertyLine hidden={!is_flex_container}>
              <PropertyLineLabel>Direction</PropertyLineLabel>
              <AxisControl
                value={direction!}
                onValueChange={actions.direction}
              />
            </PropertyLine>
            {/* <PropertyLine>
              <PropertyLineLabel>Wrap</PropertyLineLabel>
              <FlexWrapControl
                value={flexWrap as any}
                onValueChange={actions.flexWrap}
              />
            </PropertyLine> */}
            <PropertyLine hidden={!is_flex_container}>
              <PropertyLineLabel>Distribute</PropertyLineLabel>
              <MainAxisAlignmentControl
                value={mainAxisAlignment!}
                onValueChange={actions.mainAxisAlignment}
              />
            </PropertyLine>
            <PropertyLine hidden={!is_flex_container}>
              <PropertyLineLabel>Align</PropertyLineLabel>
              <CrossAxisAlignmentControl
                value={crossAxisAlignment!}
                direction={direction}
                onValueChange={actions.crossAxisAlignment}
              />
            </PropertyLine>
            <PropertyLine hidden={!is_flex_container}>
              <PropertyLineLabel>Gap</PropertyLineLabel>
              <GapControl
                value={{
                  mainAxisGap: mainAxisGap!,
                  crossAxisGap: crossAxisGap!,
                }}
                onValueCommit={actions.gap}
              />
            </PropertyLine>
            {/* <PropertyLine hidden={!is_flex_container}>
              <PropertyLineLabel>Margin</PropertyLineLabel>
              <MarginControl
                value={margin as any}
                onValueChange={actions.margin}
              />
            </PropertyLine> */}
            <PropertyLine hidden={!is_flex_container}>
              <PropertyLineLabel>Padding</PropertyLineLabel>
              <PaddingControl
                value={padding!}
                onValueCommit={actions.padding}
              />
            </PropertyLine>
          </SidebarMenuSectionContent>
        </SidebarSection>
      )}

      <SectionFills node_id={node_id} />
      {supports.stroke(node.type, { backend }) && (
        <SectionStrokes
          node_id={node_id}
          config={{
            stroke_cap: !supports.strokeCap(node.type, { backend })
              ? "off"
              : "on",
          }}
        />
      )}
      <SectionEffects node_id={node_id} />
      {backend === "dom" && (
        <SidebarSection
          hidden={config.link === "off"}
          className="border-b pb-4"
        >
          <SidebarSectionHeaderItem>
            <SidebarSectionHeaderLabel>Actions</SidebarSectionHeaderLabel>
          </SidebarSectionHeaderItem>
          <SidebarMenuSectionContent className="space-y-2">
            <PropertyLine>
              <PropertyLineLabel>Link To</PropertyLineLabel>
              <HrefControl value={href} onValueChange={actions.href} />
            </PropertyLine>
            {href && (
              <PropertyLine>
                <PropertyLineLabel>New Tab</PropertyLineLabel>
                <TargetBlankControl
                  value={target}
                  onValueChange={actions.target}
                />
              </PropertyLine>
            )}
            <PropertyLine>
              <PropertyLineLabel>Cursor</PropertyLineLabel>
              <CursorControl value={cursor} onValueChange={actions.cursor} />
            </PropertyLine>
          </SidebarMenuSectionContent>
        </SidebarSection>
      )}
      {/* #region selection colors */}
      <SelectionColors />
      {/* #endregion selection colors */}
      <SidebarSection
        hidden={config.export === "off"}
        className="border-b pb-4"
      >
        <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>Export</SidebarSectionHeaderLabel>
        </SidebarSectionHeaderItem>
        <SidebarMenuSectionContent className="space-y-2">
          <PropertyLine>
            <ExportNodeControl node_id={id} name={name} />
          </PropertyLine>
        </SidebarMenuSectionContent>
      </SidebarSection>
      <SidebarSection hidden={config.developer === "off"} className="pb-4">
        <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>Developer</SidebarSectionHeaderLabel>
        </SidebarSectionHeaderItem>
        <SidebarMenuSectionContent className="space-y-2">
          <PropertyLine>
            <UserDataControl
              node_id={id}
              value={userdata}
              onValueCommit={actions.userdata}
            />
          </PropertyLine>
        </SidebarMenuSectionContent>
      </SidebarSection>
    </div>
  );
}

function PropertyLineOpacity({ node_id }: { node_id: string }) {
  const actions = useNodeActions(node_id)!;
  const opacity = useNodeState(node_id, (node) => node.opacity);

  return (
    <PropertyLine>
      <PropertyLineLabel>Opacity</PropertyLineLabel>
      <OpacityControl value={opacity as any} onValueCommit={actions.opacity} />
    </PropertyLine>
  );
}

function SectionPosition({ node_id }: { node_id: string }) {
  const instance = useCurrentEditor();
  const document_ctx = useEditorState(instance, (state) => state.document_ctx);
  const scene = useCurrentSceneState();
  const top_id = dq.getTopId(document_ctx, node_id)!;
  const is_root = node_id === top_id;
  const is_single_mode_root =
    scene.constraints.children === "single" && is_root;

  const actions = useNodeActions(node_id)!;

  const { position, rotation, top, left, right, bottom } = useNodeState(
    node_id,
    (node) => ({
      position: node.position,
      rotation: node.rotation,
      top: node.top,
      left: node.left,
      right: node.right,
      bottom: node.bottom,
    })
  );

  return (
    <SidebarSection hidden={is_single_mode_root} className="border-b pb-4">
      <SidebarSectionHeaderItem>
        <SidebarSectionHeaderLabel>Position</SidebarSectionHeaderLabel>
      </SidebarSectionHeaderItem>
      <SidebarMenuSectionContent className="space-y-2">
        <div className="pb-2 border-b">
          <Align />
        </div>
        <PropertyLine>
          <PositioningConstraintsControl
            value={{
              position: position!,
              top,
              left,
              right,
              bottom,
            }}
            onValueCommit={actions.positioning}
          />
        </PropertyLine>
        <PropertyLine>
          <PropertyLineLabel>Mode</PropertyLineLabel>
          <PositioningModeControl
            value={position}
            onValueChange={actions.positioningMode}
          />
        </PropertyLine>
        <PropertyLine>
          <PropertyLineLabel>Rotate</PropertyLineLabel>
          <RotateControl value={rotation} onValueCommit={actions.rotation} />
        </PropertyLine>
      </SidebarMenuSectionContent>
    </SidebarSection>
  );
}

function SectionMixedPosition({ mp }: { mp: MixedPropertiesEditor }) {
  return (
    <SidebarSection className="border-b pb-4">
      <SidebarSectionHeaderItem>
        <SidebarSectionHeaderLabel>Position</SidebarSectionHeaderLabel>
      </SidebarSectionHeaderItem>
      <SidebarMenuSectionContent className="space-y-2">
        <div className="pb-2 border-b">
          <Align />
        </div>
        <PropertyLine>
          <PositioningConstraintsControl
            // TODO:
            value={{
              position: "relative",
              top: undefined,
              left: undefined,
              right: undefined,
              bottom: undefined,
            }}
            // onValueChange={actions.positioning}
          />
        </PropertyLine>
        <PropertyLine>
          <PropertyLineLabel>Mode</PropertyLineLabel>
          <PositioningModeControl
            value={mp.properties.position!.value}
            onValueChange={mp.actions.positioningMode}
          />
        </PropertyLine>
        <PropertyLine>
          <PropertyLineLabel>Rotate</PropertyLineLabel>
          <RotateControl
            value={mp.properties.rotation?.value}
            onValueCommit={mp.actions.rotation}
          />
        </PropertyLine>
      </SidebarMenuSectionContent>
    </SidebarSection>
  );
}

function SectionText({ node_id }: { node_id: string }) {
  const actions = useNodeActions(node_id)!;
  const computed = useComputedNode(node_id);
  const instance = useCurrentEditor();
  const {
    text,
    fontFamily,
    fontWeight,
    fontSize,
    lineHeight,
    letterSpacing,
    textAlign,
    textAlignVertical,
    textDecorationLine,
    textDecorationStyle,
    textDecorationColor,
    textDecorationSkipInk,
    textDecorationThickness,
    textTransform,
    maxLines,
    maxLength,
    fontVariations,
    fontFeatures,
  } = useNodeState(node_id, (node) => ({
    text: node.text,
    fontFamily: node.fontFamily,
    fontWeight: node.fontWeight,
    fontSize: node.fontSize,
    lineHeight: node.lineHeight,
    letterSpacing: node.letterSpacing,
    textAlign: node.textAlign,
    textAlignVertical: node.textAlignVertical,
    textDecorationLine: node.textDecorationLine,
    textDecorationStyle: node.textDecorationStyle,
    textDecorationColor: node.textDecorationColor,
    textDecorationSkipInk: node.textDecorationSkipInk,
    textDecorationThickness: node.textDecorationThickness,
    textTransform: node.textTransform,
    maxLines: node.maxLines,
    maxLength: node.maxLength,
    fontVariations: node.fontVariations,
    fontFeatures: node.fontFeatures,
  }));

  type AxisMap = Record<string, { min: number; max: number; def: number }>;
  const [axes, setAxes] = React.useState<AxisMap>({});
  const [features, setFeatures] = React.useState<cg.OpenTypeFeature[]>([]);

  React.useEffect(() => {
    let canceled = false;
    (async () => {
      if (!fontFamily) {
        if (!canceled) {
          setAxes({});
          setFeatures([]);
        }
        return;
      }
      const detail = await instance.getFontDetails(fontFamily);
      if (!detail) {
        if (!canceled) {
          setAxes({});
          setFeatures([]);
        }
        return;
      }
      const record: AxisMap = {};
      for (const tag of Object.keys(detail.axes)) {
        const axis = detail.axes[tag];
        record[tag] = axis;
      }
      if (!canceled) {
        setAxes(record);
        setFeatures(detail.features as cg.OpenTypeFeature[]);
      }
    })();
    return () => {
      canceled = true;
    };
  }, [instance, fontFamily, fontWeight]);

  return (
    <SidebarSection className="border-b pb-4">
      <SidebarSectionHeaderItem>
        <SidebarSectionHeaderLabel>Text</SidebarSectionHeaderLabel>
        <SidebarSectionHeaderActions>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="xs">
                <MixerVerticalIcon />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="p-0 w-64 h-[500px]">
              <TextDetails
                axes={axes}
                textAlign={textAlign}
                textDecorationLine={textDecorationLine}
                textDecorationStyle={textDecorationStyle ?? undefined}
                textDecorationThickness={textDecorationThickness ?? undefined}
                textDecorationColor={textDecorationColor ?? undefined}
                textDecorationSkipInk={textDecorationSkipInk ?? undefined}
                textTransform={textTransform}
                maxLines={maxLines}
                maxLength={maxLength}
                fontVariations={fontVariations}
                fontWeight={fontWeight}
                fontFamily={fontFamily}
                fontFeatures={fontFeatures}
                features={features}
                onTextTransformChange={actions.textTransform}
                onTextAlignChange={actions.textAlign}
                onTextDecorationLineChange={actions.textDecorationLine}
                onTextDecorationStyleChange={actions.textDecorationStyle}
                onTextDecorationThicknessChange={
                  actions.textDecorationThickness
                }
                onTextDecorationColorChange={actions.textDecorationColor}
                onTextDecorationSkipInkChange={actions.textDecorationSkipInk}
                onMaxLinesChange={actions.maxLines}
                onMaxLengthChange={actions.maxLength}
                onFontWeightChange={(value) =>
                  actions.fontWeight(value as cg.NFontWeight)
                }
                onFontVariationChange={(key, value) => {
                  actions.fontVariation(key, value);
                }}
                onFontFeatureChange={(key, value) => {
                  actions.fontFeature(key, value);
                }}
              />
            </DropdownMenuContent>
          </DropdownMenu>
        </SidebarSectionHeaderActions>
      </SidebarSectionHeaderItem>
      <SidebarMenuSectionContent className="space-y-2">
        <PropertyLine>
          <PropertyLineLabel>Value</PropertyLineLabel>
          <StringValueControl
            value={text}
            maxlength={maxLength}
            onValueChange={(value) => actions.text(value ?? null)}
          />
        </PropertyLine>
        <PropertyLine>
          <PropertyLineLabel>Font</PropertyLineLabel>
          <div className="flex-1">
            <FontFamilyControl
              value={fontFamily}
              onValueChange={actions.fontFamily}
            />
          </div>
        </PropertyLine>
        <PropertyLine>
          <PropertyLineLabel>Weight</PropertyLineLabel>
          <FontWeightControl
            value={fontWeight}
            onValueChange={actions.fontWeight}
          />
        </PropertyLine>
        <PropertyLine>
          <PropertyLineLabel>Size</PropertyLineLabel>
          <FontSizeControl value={fontSize} onValueCommit={actions.fontSize} />
        </PropertyLine>
        <PropertyLine>
          <PropertyLineLabel>Line</PropertyLineLabel>
          <LineHeightControl
            value={lineHeight}
            onValueCommit={actions.lineHeight}
          />
        </PropertyLine>
        <PropertyLine>
          <PropertyLineLabel>Letter</PropertyLineLabel>
          <LetterSpacingControl
            value={letterSpacing}
            onValueCommit={actions.letterSpacing}
          />
        </PropertyLine>
        <PropertyLine>
          <PropertyLineLabel>Align</PropertyLineLabel>
          <TextAlignControl
            value={textAlign}
            onValueChange={actions.textAlign}
          />
        </PropertyLine>
        <PropertyLine>
          <PropertyLineLabel></PropertyLineLabel>
          <TextAlignVerticalControl
            value={textAlignVertical}
            onValueChange={actions.textAlignVertical}
          />
        </PropertyLine>
      </SidebarMenuSectionContent>
    </SidebarSection>
  );
}

function SectionDimension({ node_id }: { node_id: string }) {
  const { width, height } = useNodeState(node_id, (node) => ({
    width: node.width,
    height: node.height,
  }));

  const actions = useNodeActions(node_id)!;

  return (
    <SidebarSection className="border-b pb-4">
      <SidebarSectionHeaderItem>
        <SidebarSectionHeaderLabel>Size</SidebarSectionHeaderLabel>
      </SidebarSectionHeaderItem>
      <SidebarMenuSectionContent className="space-y-2">
        <PropertyLine>
          <PropertyLineLabel>Width</PropertyLineLabel>
          <LengthPercentageControl
            value={width}
            onValueCommit={actions.width}
          />
        </PropertyLine>
        <PropertyLine>
          <PropertyLineLabel>Height</PropertyLineLabel>
          <LengthPercentageControl
            value={height}
            onValueCommit={actions.height}
          />
        </PropertyLine>
      </SidebarMenuSectionContent>
    </SidebarSection>
  );
}

function SectionFills({ node_id }: { node_id: string }) {
  const instance = useCurrentEditor();
  const { content_edit_mode } = useEditorState(instance, (state) => ({
    content_edit_mode: state.content_edit_mode,
  }));

  const { fill } = useNodeState(node_id, (node) => ({
    fill: node.fill,
  }));

  const selectedGradientStop =
    content_edit_mode?.type === "fill/gradient"
      ? content_edit_mode.selected_stop
      : undefined;

  const actions = useNodeActions(node_id)!;

  return (
    <SidebarSection className="border-b pb-4">
      <SidebarSectionHeaderItem>
        <SidebarSectionHeaderLabel>Fills</SidebarSectionHeaderLabel>
      </SidebarSectionHeaderItem>
      <SidebarMenuSectionContent className="space-y-2">
        <PropertyLine>
          <PropertyLineLabel>Fill</PropertyLineLabel>
          <FillControl
            value={fill}
            onValueChange={actions.fill}
            removable
            selectedGradientStop={selectedGradientStop}
            onSelectedGradientStopChange={(stop) => {
              instance.selectGradientStop(node_id, stop);
            }}
            onOpenChange={(open) => {
              if (open) {
                instance.tryEnterContentEditMode(node_id, "fill/gradient");
              } else {
                instance.tryExitContentEditMode();
              }
              //
            }}
          />
        </PropertyLine>
      </SidebarMenuSectionContent>
    </SidebarSection>
  );
}

function SectionStrokes({
  node_id,
  config = {
    stroke_cap: "on",
  },
}: {
  node_id: string;
  config?: {
    stroke_cap: "on" | "off";
  };
}) {
  const { stroke, strokeWidth, strokeAlign, strokeCap } = useNodeState(
    node_id,
    (node) => ({
      stroke: node.stroke,
      strokeWidth: node.strokeWidth,
      strokeAlign: node.strokeAlign,
      strokeCap: node.strokeCap,
    })
  );

  const has_stroke_paint = stroke !== undefined;
  const actions = useNodeActions(node_id)!;

  return (
    <SidebarSection className="border-b pb-4">
      <SidebarSectionHeaderItem>
        <SidebarSectionHeaderLabel>Stroke</SidebarSectionHeaderLabel>
      </SidebarSectionHeaderItem>
      <SidebarMenuSectionContent className="space-y-2">
        <PropertyLine>
          <PropertyLineLabel>Color</PropertyLineLabel>
          <PaintControl
            value={stroke}
            onValueChange={actions.stroke}
            removable
          />
        </PropertyLine>
        {has_stroke_paint && (
          <>
            <PropertyLine>
              <PropertyLineLabel>Width</PropertyLineLabel>
              <StrokeWidthControl
                value={strokeWidth}
                onValueCommit={actions.strokeWidth}
              />
            </PropertyLine>
            <PropertyLine>
              <PropertyLineLabel>Align</PropertyLineLabel>
              <StrokeAlignControl
                value={strokeAlign}
                onValueChange={actions.strokeAlign}
              />
            </PropertyLine>
            <PropertyLine hidden={config.stroke_cap === "off"}>
              <PropertyLineLabel>Cap</PropertyLineLabel>
              <StrokeCapControl
                value={strokeCap}
                onValueChange={actions.strokeCap}
              />
            </PropertyLine>
          </>
        )}
      </SidebarMenuSectionContent>
    </SidebarSection>
  );
}

function SectionEffects({ node_id }: { node_id: string }) {
  const backend = useBackendState();
  const instance = useCurrentEditor();
  const { type, feShadows, feBlur, feBackdropBlur } = useNodeState(
    node_id,
    (node) => ({
      type: node.type,
      feShadows: node.feShadows,
      feBlur: node.feBlur,
      feBackdropBlur: node.feBackdropBlur,
    })
  );

  const effects = useMemo(() => {
    const effects: cg.FilterEffect[] = [];
    if (feShadows) {
      effects.push(...feShadows);
    }
    if (feBlur) {
      effects.push({
        type: "filter-blur",
        blur: feBlur,
      });
    }
    if (feBackdropBlur) {
      effects.push({
        type: "backdrop-filter-blur",
        blur: feBackdropBlur,
      });
    }
    return effects;
  }, [feShadows, feBlur, feBackdropBlur]);

  const onAddEffect = useCallback(() => {
    instance.changeNodeFilterEffects(node_id, [
      ...effects,
      {
        type: "shadow",
        ...editor.config.DEFAULT_FE_SHADOW,
      },
    ]);
  }, [effects, instance, node_id]);

  const empty = effects.length === 0;

  return (
    <SidebarSection
      hidden={!supports.feDropShadow(type, { backend })}
      data-empty={empty}
      className="border-b pb-4 [&[data-empty='true']]:pb-0"
    >
      <SidebarSectionHeaderItem onClick={onAddEffect}>
        <SidebarSectionHeaderLabel>Effects</SidebarSectionHeaderLabel>
        <SidebarSectionHeaderActions>
          <Button variant="ghost" size="xs">
            <PlusIcon className="size-3" />
          </Button>
        </SidebarSectionHeaderActions>
      </SidebarSectionHeaderItem>
      {!empty && (
        <SidebarMenuSectionContent className="space-y-2">
          {effects.map((effect, index) => (
            <PropertyLine key={index}>
              <FeControl
                value={effect}
                onValueChange={(value) => {
                  instance.changeNodeFilterEffects(node_id, [
                    ...effects.slice(0, index),
                    value,
                    ...effects.slice(index + 1),
                  ]);
                }}
                onRemove={() => {
                  instance.changeNodeFilterEffects(node_id, [
                    ...effects.slice(0, index),
                    ...effects.slice(index + 1),
                  ]);
                }}
              />
            </PropertyLine>
          ))}
        </SidebarMenuSectionContent>
      )}
    </SidebarSection>
  );
}

function SelectionColors() {
  const editor = useCurrentEditor();
  const { ids, paints, setPaint } = useMixedPaints();

  // this should show when,
  // 1. paints are more than 1
  // 2. paints is 1 but ids are more than 1
  // (to be more accurate, it should be, paints is 1 and that paint is not from the root selection)
  const should_display = ids.length > 1 || paints.length > 1;

  if (!should_display) {
    return <></>;
  }

  return (
    <SidebarSection className="border-b pb-4">
      <SidebarSectionHeaderItem>
        <SidebarSectionHeaderLabel>Selection colors</SidebarSectionHeaderLabel>
      </SidebarSectionHeaderItem>
      <SidebarMenuSectionContent className="space-y-2">
        {paints.map(({ value, ids }, index) => (
          <PropertyLine key={index}>
            <PaintControl
              value={value}
              onValueChange={(value) => {
                setPaint(index, value);
              }}
            />
            <div className="ms-1">
              <Button
                variant="ghost"
                size="xs"
                className="opacity-0 group-hover:opacity-100"
                onClick={() => {
                  editor.select(ids);
                }}
              >
                <Crosshair2Icon className="size-3" />
              </Button>
            </div>
          </PropertyLine>
        ))}
      </SidebarMenuSectionContent>
    </SidebarSection>
  );
}

function ConfigurableProperty({
  propertyName,
  propertyType,
  children,
}: React.PropsWithChildren<{
  propertyName?: string;
  propertyType?: grida.program.schema.PropertyDefinitionType;
}>) {
  const schema = useSchema();

  const [open, setOpen] = React.useState(false);
  return (
    <DropdownMenu open={open} onOpenChange={setOpen} modal>
      <Tooltip delayDuration={50}>
        <DropdownMenuTrigger
          onContextMenu={(e) => {
            e.preventDefault();
            setOpen(true);
          }}
          asChild
        >
          <TooltipTrigger asChild>{children}</TooltipTrigger>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>Configure</DropdownMenuItem>
          {schema && (
            <PropertyAccessExpressionControl
              schema={schema}
              propertyType={propertyType}
            />
          )}
        </DropdownMenuContent>
        <TooltipContent>
          <div className="flex items-center gap-1">
            <span>{propertyName}</span>
            <BoltIcon
              onClick={() => {
                setOpen(true);
              }}
              className="size-3"
            />
          </div>
        </TooltipContent>
      </Tooltip>
    </DropdownMenu>
  );
}
