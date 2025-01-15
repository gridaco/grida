"use client";

import React from "react";

import {
  SidebarMenuSectionContent,
  SidebarSection,
  SidebarSectionHeaderItem,
  SidebarSectionHeaderLabel,
} from "@/components/sidebar";

import { TextAlignControl } from "./controls/text-align";
import { FontSizeControl } from "./controls/font-size";
import { FontWeightControl } from "./controls/font-weight";
import { OpacityControl } from "./controls/opacity";
import { HrefControl } from "./controls/href";
import { CornerRadiusControl } from "./controls/corner-radius";
import { BorderControl } from "./controls/border";
import { FillControl } from "./controls/fill";
import { StringValueControl } from "./controls/string-value";
import { PaddingControl } from "./controls/padding";
import { BoxShadowControl } from "./controls/box-shadow";
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
import { useComputedNode, useDocument, useNode } from "@/grida-react-canvas";
import {
  Crosshair2Icon,
  LockClosedIcon,
  LockOpen1Icon,
} from "@radix-ui/react-icons";
import { supports } from "@/grida/utils/supports";
import { StrokeWidthControl } from "./controls/stroke-width";
import { PaintControl } from "./controls/paint";
import { StrokeCapControl } from "./controls/stroke-cap";
import { grida } from "@/grida";
import assert from "assert";
import {
  useNodeAction,
  useSelection,
  useSelectionPaints,
} from "@/grida-react-canvas/provider";
import { Checkbox } from "@/components/ui/checkbox";
import { Toggle } from "@/components/ui/toggle";
import { AlignControl as _AlignControl } from "./controls/ext-align";
import { Button } from "@/components/ui/button";
import { ZoomControl } from "./controls/ext-zoom";
import { SchemaProvider } from "./schema";

export function Align() {
  const { selection, align, distributeEvenly } = useDocument();
  const has_selection = selection.length >= 1;

  return (
    <SidebarSection className="mt-2 flex justify-center">
      <_AlignControl
        disabled={!has_selection}
        onAlign={(alignment) => {
          align("selection", alignment);
        }}
        onDistributeEvenly={(axis) => {
          distributeEvenly("selection", axis);
        }}
      />
    </SidebarSection>
  );
}

export const Zoom = ZoomControl;

export function Selection({ empty }: { empty?: React.ReactNode }) {
  const { state: document } = useDocument();

  const selection_length = document.selection.length;

  return (
    <div>
      {selection_length === 0 && empty && empty}
      {selection_length === 1 && <SelectedNodeProperties />}
      {selection_length > 1 && <SelectionMixedProperties />}
    </div>
  );
}

function SelectionMixedProperties() {
  const { state: document } = useDocument();

  const {
    document: { root_id },
  } = document;

  const { selection: ids, nodes, properties, actions: change } = useSelection();
  const {
    id,
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
  const is_root = ids[0] === root_id; // assuming when root is selected, only root is selected
  const types = new Set(nodes.map((n) => n.type));
  const _types = Array.from(types);

  const supports_corner_radius = _types.some((t) => supports.cornerRadius(t));
  const supports_stroke = _types.some((t) => supports.stroke(t));
  const supports_stroke_cap = _types.some((t) => supports.strokeCap(t));
  const has_container = types.has("container");
  const has_flex_container =
    has_container && nodes.some((n) => "layout" in n && n.layout === "flex");

  return (
    <SchemaProvider schema={undefined}>
      <div key={sid} className="mt-4 mb-10">
        <SidebarSection className="border-b pb-4">
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
                className="w-6 h-6 p-0.5 aspect-square"
              >
                {locked ? (
                  <LockOpen1Icon className="w-3 h-3" />
                ) : (
                  <LockClosedIcon className="w-3 h-3" />
                )}
              </Toggle>
              {/* <small className="ms-2 font-mono">{id}</small> */}
            </PropertyLine>
          </SidebarMenuSectionContent>
        </SidebarSection>
        <SidebarSection hidden={is_root} className="border-b pb-4">
          <SidebarSectionHeaderItem>
            <SidebarSectionHeaderLabel>Position</SidebarSectionHeaderLabel>
          </SidebarSectionHeaderItem>
          <SidebarMenuSectionContent className="space-y-2">
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
                value={position!.value}
                onValueChange={change.positioningMode}
              />
            </PropertyLine>
            <PropertyLine>
              <PropertyLineLabel>Rotate</PropertyLineLabel>
              <RotateControl
                value={rotation!.value}
                onValueChange={change.rotation}
              />
            </PropertyLine>
          </SidebarMenuSectionContent>
        </SidebarSection>
        <SidebarSection className="border-b pb-4">
          <SidebarSectionHeaderItem>
            <SidebarSectionHeaderLabel>Size</SidebarSectionHeaderLabel>
          </SidebarSectionHeaderItem>
          <SidebarMenuSectionContent className="space-y-2">
            <PropertyLine>
              <PropertyLineLabel>Width</PropertyLineLabel>
              <LengthPercentageControl
                value={width!.value}
                onValueChange={change.width}
              />
            </PropertyLine>
            <PropertyLine>
              <PropertyLineLabel>Height</PropertyLineLabel>
              <LengthPercentageControl
                value={height!.value}
                onValueChange={change.height}
              />
            </PropertyLine>
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
        <SidebarSection hidden={!types.has("text")} className="border-b pb-4">
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
              <FontFamilyControl
                value={fontFamily?.value}
                onValueChange={change.fontFamily}
              />
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
                onValueChange={change.fontSize}
              />
            </PropertyLine>
            <PropertyLine>
              <PropertyLineLabel>Line</PropertyLineLabel>
              <LineHeightControl
                value={lineHeight?.value}
                onValueChange={change.lineHeight}
              />
            </PropertyLine>
            <PropertyLine>
              <PropertyLineLabel>Letter</PropertyLineLabel>
              <LetterSpacingControl
                value={letterSpacing?.value}
                onValueChange={change.letterSpacing}
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
        <SidebarSection hidden={!types.has("image")} className="border-b pb-4">
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
          <SidebarSection className="border-b pb-4">
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
            <SidebarSectionHeaderLabel>Styles</SidebarSectionHeaderLabel>
          </SidebarSectionHeaderItem>
          <SidebarMenuSectionContent className="space-y-2">
            <PropertyLine>
              <PropertyLineLabel>Opacity</PropertyLineLabel>
              <OpacityControl
                value={opacity!.value}
                onValueChange={change.opacity}
              />
            </PropertyLine>
            {supports_corner_radius && (
              <PropertyLine>
                <PropertyLineLabel>Radius</PropertyLineLabel>
                {cornerRadius?.mixed ? (
                  <CornerRadiusControl onValueChange={change.cornerRadius} />
                ) : (
                  <CornerRadiusControl
                    value={cornerRadius?.value}
                    onValueChange={change.cornerRadius}
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
            {/* <PropertyLine>
              <PropertyLineLabel>Shadow</PropertyLineLabel>
              <BoxShadowControl
                value={{ boxShadow }}
                onValueChange={actions.boxShadow}
              />
            </PropertyLine> */}
            <PropertyLine>
              <PropertyLineLabel>Cursor</PropertyLineLabel>
              <CursorControl
                value={cursor?.value}
                onValueChange={change.cursor}
              />
            </PropertyLine>
          </SidebarMenuSectionContent>
        </SidebarSection>
        {supports_stroke && (
          <SidebarSection className="border-b pb-4">
            <SidebarSectionHeaderItem>
              <SidebarSectionHeaderLabel>Stroke</SidebarSectionHeaderLabel>
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
                  onValueChange={change.strokeWidth}
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
        {/* <SidebarSection className="border-b pb-4">
          <SidebarSectionHeaderItem>
            <SidebarSectionHeaderLabel>Link</SidebarSectionHeaderLabel>
          </SidebarSectionHeaderItem>
          <SidebarMenuSectionContent className="space-y-2">
            <PropertyLine>
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
            )}
          </SidebarMenuSectionContent>
        </SidebarSection> */}
        {/* #region selection colors */}
        <SelectionColors />
        {/* #endregion selection colors */}
        <SidebarSection className="border-b pb-4">
          <SidebarSectionHeaderItem>
            <SidebarSectionHeaderLabel>Developer</SidebarSectionHeaderLabel>
          </SidebarSectionHeaderItem>
          <SidebarMenuSectionContent className="space-y-2">
            <PropertyLine>
              <UserDataControl disabled node_id={""} value={undefined} />
            </PropertyLine>
          </SidebarMenuSectionContent>
        </SidebarSection>
        <SidebarSection className="pb-4">
          <SidebarSectionHeaderItem>
            <SidebarSectionHeaderLabel>Export</SidebarSectionHeaderLabel>
          </SidebarSectionHeaderItem>
          <SidebarMenuSectionContent className="space-y-2">
            <PropertyLine>
              <ExportNodeControl disabled node_id={""} name={""} />
            </PropertyLine>
          </SidebarMenuSectionContent>
        </SidebarSection>
      </div>
    </SchemaProvider>
  );
}

function SelectedNodeProperties() {
  const { state } = useDocument();

  // - color - variables
  const {
    selection,
    document: { root_id },
    debug,
  } = state;

  assert(selection.length === 1);
  const node_id = selection[0];
  const actions = useNodeAction(node_id)!;

  const node = useNode(node_id);
  const root = useNode(root_id);
  const computed = useComputedNode(node_id);
  const {
    id,
    name,
    active,
    locked,
    component_id,
    style,
    type,
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
    boxShadow,

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

  const document_properties = state.document.properties;
  const properties = node.properties;
  const root_properties = root.properties;

  // const istemplate = type?.startsWith("templates/");
  const is_instance = type === "instance";
  const is_templateinstance = type === "template_instance";
  const is_text = type === "text";
  const is_image = type === "image";
  const is_container = type === "container";
  const is_root = node_id === root_id;
  const is_flex_container = is_container && layout === "flex";
  const is_stylable = type !== "template_instance";

  return (
    <SchemaProvider
      schema={{
        properties: document_properties,
      }}
    >
      <div key={node_id} className="mt-4 mb-10">
        <SidebarSection className="border-b pb-4">
          <SidebarMenuSectionContent className="space-y-2">
            <PropertyLine className="items-center gap-1">
              <Checkbox
                checked={active}
                onCheckedChange={actions.active}
                className="me-1"
              />
              <NameControl value={name} onValueChange={actions.name} />
              <Toggle
                variant="outline"
                size="sm"
                pressed={locked}
                onPressedChange={actions.locked}
                className="w-6 h-6 p-0.5 aspect-square"
              >
                {locked ? (
                  <LockOpen1Icon className="w-3 h-3" />
                ) : (
                  <LockClosedIcon className="w-3 h-3" />
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
        <SidebarSection hidden={is_root} className="border-b pb-4">
          <SidebarSectionHeaderItem>
            <SidebarSectionHeaderLabel>Position</SidebarSectionHeaderLabel>
          </SidebarSectionHeaderItem>
          <SidebarMenuSectionContent className="space-y-2">
            <PropertyLine>
              <PositioningConstraintsControl
                value={{
                  position: position!,
                  top,
                  left,
                  right,
                  bottom,
                }}
                onValueChange={actions.positioning}
              />
            </PropertyLine>
            <PropertyLine>
              <PropertyLineLabel>Mode</PropertyLineLabel>
              <PositioningModeControl
                value={position}
                //
                onValueChange={actions.positioningMode}
              />
            </PropertyLine>
            <PropertyLine>
              <PropertyLineLabel>Rotate</PropertyLineLabel>
              <RotateControl
                value={rotation}
                onValueChange={actions.rotation}
              />
            </PropertyLine>
          </SidebarMenuSectionContent>
        </SidebarSection>
        <SidebarSection className="border-b pb-4">
          <SidebarSectionHeaderItem>
            <SidebarSectionHeaderLabel>Size</SidebarSectionHeaderLabel>
          </SidebarSectionHeaderItem>
          <SidebarMenuSectionContent className="space-y-2">
            <PropertyLine>
              <PropertyLineLabel>Width</PropertyLineLabel>
              <LengthPercentageControl
                value={width}
                onValueChange={actions.width}
              />
            </PropertyLine>
            <PropertyLine>
              <PropertyLineLabel>Height</PropertyLineLabel>
              <LengthPercentageControl
                value={height}
                onValueChange={actions.height}
              />
            </PropertyLine>
          </SidebarMenuSectionContent>
        </SidebarSection>
        <SidebarSection hidden={!is_templateinstance} className="border-b pb-4">
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
        <SidebarSection hidden={!is_templateinstance} className="border-b pb-4">
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
        </SidebarSection>

        <SidebarSection hidden={!is_text} className="border-b pb-4">
          <SidebarSectionHeaderItem>
            <SidebarSectionHeaderLabel>Text</SidebarSectionHeaderLabel>
          </SidebarSectionHeaderItem>
          <SidebarMenuSectionContent className="space-y-2">
            <PropertyLine>
              <PropertyLineLabel>Value</PropertyLineLabel>
              <StringValueControl
                value={node.text}
                maxlength={maxLength}
                onValueChange={actions.text}
              />
            </PropertyLine>
            <PropertyLine>
              <PropertyLineLabel>Font</PropertyLineLabel>
              <FontFamilyControl
                value={fontFamily}
                onValueChange={actions.fontFamily}
              />
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
              <FontSizeControl
                value={fontSize}
                onValueChange={actions.fontSize}
              />
            </PropertyLine>
            <PropertyLine>
              <PropertyLineLabel>Line</PropertyLineLabel>
              <LineHeightControl
                value={lineHeight}
                onValueChange={actions.lineHeight}
              />
            </PropertyLine>
            <PropertyLine>
              <PropertyLineLabel>Letter</PropertyLineLabel>
              <LetterSpacingControl
                value={letterSpacing}
                onValueChange={actions.letterSpacing}
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
            <PropertyLine>
              <PropertyLineLabel>Max Length</PropertyLineLabel>
              <MaxlengthControl
                value={maxLength}
                placeholder={(
                  computed.text as any as string
                )?.length?.toString()}
                onValueChange={actions.maxLength}
              />
            </PropertyLine>
          </SidebarMenuSectionContent>
        </SidebarSection>
        <SidebarSection hidden={!is_image} className="border-b pb-4">
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
          <SidebarSection className="border-b pb-4">
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
                  onValueChange={actions.gap}
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
                  onValueChange={actions.padding}
                />
              </PropertyLine>
            </SidebarMenuSectionContent>
          </SidebarSection>
        )}
        <SidebarSection hidden={!is_stylable} className="border-b pb-4">
          <SidebarSectionHeaderItem>
            <SidebarSectionHeaderLabel>Styles</SidebarSectionHeaderLabel>
          </SidebarSectionHeaderItem>
          <SidebarMenuSectionContent className="space-y-2">
            <PropertyLine>
              <PropertyLineLabel>Opacity</PropertyLineLabel>
              <OpacityControl
                value={opacity as any}
                onValueChange={actions.opacity}
              />
            </PropertyLine>
            {supports.cornerRadius(node.type) && (
              <PropertyLine>
                <PropertyLineLabel>Radius</PropertyLineLabel>
                <CornerRadiusControl
                  value={cornerRadius}
                  onValueChange={actions.cornerRadius}
                />
              </PropertyLine>
            )}
            {supports.border(node.type) && (
              <PropertyLine>
                <PropertyLineLabel>Border</PropertyLineLabel>
                <BorderControl value={border} onValueChange={actions.border} />
              </PropertyLine>
            )}
            <PropertyLine>
              <PropertyLineLabel>Fill</PropertyLineLabel>
              <FillControl
                value={fill}
                onValueChange={actions.fill}
                removable
              />
            </PropertyLine>
            <PropertyLine>
              <PropertyLineLabel>Cursor</PropertyLineLabel>
              <CursorControl value={cursor} onValueChange={actions.cursor} />
            </PropertyLine>
          </SidebarMenuSectionContent>
        </SidebarSection>
        {supports.stroke(node.type) && (
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
              <PropertyLine hidden={!stroke}>
                <PropertyLineLabel>Width</PropertyLineLabel>
                <StrokeWidthControl
                  value={strokeWidth}
                  onValueChange={actions.strokeWidth}
                />
              </PropertyLine>
              <PropertyLine hidden={!supports.strokeCap(node.type)}>
                <PropertyLineLabel>Cap</PropertyLineLabel>
                <StrokeCapControl
                  value={strokeCap}
                  onValueChange={actions.strokeCap}
                />
              </PropertyLine>
            </SidebarMenuSectionContent>
          </SidebarSection>
        )}
        <SidebarSection
          hidden={!supports.boxShadow(type)}
          className="border-b pb-4"
        >
          <SidebarSectionHeaderItem>
            <SidebarSectionHeaderLabel>Effects</SidebarSectionHeaderLabel>
          </SidebarSectionHeaderItem>
          <SidebarMenuSectionContent className="space-y-2">
            <PropertyLine>
              <PropertyLineLabel>Shadow</PropertyLineLabel>
              <BoxShadowControl
                value={boxShadow}
                onValueChange={actions.boxShadow}
              />
            </PropertyLine>
          </SidebarMenuSectionContent>
        </SidebarSection>
        <SidebarSection className="border-b pb-4">
          <SidebarSectionHeaderItem>
            <SidebarSectionHeaderLabel>Link</SidebarSectionHeaderLabel>
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
          </SidebarMenuSectionContent>
        </SidebarSection>
        {/* #region selection colors */}
        <SelectionColors />
        {/* #endregion selection colors */}
        <SidebarSection className="border-b pb-4">
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
        <SidebarSection className="pb-4">
          <SidebarSectionHeaderItem>
            <SidebarSectionHeaderLabel>Export</SidebarSectionHeaderLabel>
          </SidebarSectionHeaderItem>
          <SidebarMenuSectionContent className="space-y-2">
            <PropertyLine>
              <ExportNodeControl node_id={id} name={name} />
            </PropertyLine>
          </SidebarMenuSectionContent>
        </SidebarSection>
      </div>
    </SchemaProvider>
  );
}

function SelectionColors() {
  const { select } = useDocument();
  const { ids, paints, setPaint } = useSelectionPaints();

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
                  select(ids);
                }}
              >
                <Crosshair2Icon className="w-3 h-3" />
              </Button>
            </div>
          </PropertyLine>
        ))}
      </SidebarMenuSectionContent>
    </SidebarSection>
  );
}
