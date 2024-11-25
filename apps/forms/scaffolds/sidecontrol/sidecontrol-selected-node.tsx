"use client";

import React, { useEffect, useMemo } from "react";

import {
  SidebarMenuSectionContent,
  SidebarSection,
  SidebarSectionHeaderItem,
  SidebarSectionHeaderLabel,
} from "@/components/sidebar";

import { TextAlignControl } from "./controls/text-align";
import { FontSizeControl } from "./controls/font-size";
import { FontWeightControl } from "./controls/font-weight";
import { HiddenControl } from "./controls/hidden";
import { OpacityControl } from "./controls/opacity";
import { HrefControl } from "./controls/href";
import { CornerRadiusControl } from "./controls/corner-radius";
import { BorderControl } from "./controls/border";
import { FillControl } from "./controls/fill";
import { StringValueControl } from "./controls/string-value";
import { MarginControl } from "./controls/margin";
import { PaddingControl } from "./controls/padding";
import { AspectRatioControl } from "./controls/aspect-ratio";
import { BoxShadowControl } from "./controls/box-shadow";
import { GapControl } from "./controls/gap";
import { CrossAxisAlignmentControl } from "./controls/cross-axis-alignment";
import { FlexWrapControl } from "./controls/flex-wrap";
import { FlexDirectionControl } from "./controls/flex-direction";
import { MainAxisAlignmentControl } from "./controls/main-axis-alignment";
import { TemplateControl } from "./controls/template";
import { CursorControl } from "./controls/cursor";
import { PropertyLine, PropertyLineLabel } from "./ui";
import { SrcControl } from "./controls/src";
import { BoxFitControl } from "./controls/box-fit";
import { PropsControl } from "./controls/props";
import { TargetBlankControl } from "./controls/target";
import { ExportNodeWithHtmlToImage } from "./controls/export";

import { useComputedNode, useDocument, useNode } from "@/builder";
import assert from "assert";
import { grida } from "@/grida";
import { FontFamilyControl } from "./controls/font-family";
import { TextColorControl } from "./controls/text-color";
import {
  PositioningConstraintsControl,
  PositioningModeControl,
} from "./controls/positioning";
import { useNodeDomElement } from "@/builder/provider";
import { RotateControl } from "./controls/rotate";
import { LockClosedIcon } from "@radix-ui/react-icons";
import { TextAlignVerticalControl } from "./controls/text-align-vertical";
import { LetterSpacingControl } from "./controls/letter-spacing";
import { LineHeightControl } from "./controls/line-height";
import { NameControl } from "./controls/name";
import { UserDataControl } from "./controls/x-userdata";
import { LengthControl } from "./controls/length";
import { LayoutControl } from "./controls/layout";
import { AxisControl } from "./controls/axis";
import { MaxlengthControl } from "./controls/maxlength";

export function SelectedNodeProperties() {
  const { state: document, selectedNode } = useDocument();
  assert(selectedNode);

  // - color - variables
  const { selected_node_id } = document;

  const node = useNode(selected_node_id!);
  const computed = useComputedNode(selected_node_id!);
  const {
    id,
    name,
    active,
    locked,
    component_id,
    style,
    type,
    properties,
    opacity,
    cornerRadius,
    rotation,
    fill,
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

    // x
    userdata,
  } = node;

  // const istemplate = type?.startsWith("templates/");
  const is_instance = type === "instance";
  const is_templateinstance = type === "template_instance";
  const is_text = type === "text";
  const is_image = type === "image";
  const is_container = type === "container";
  const is_flex_container = is_container && layout === "flex";
  const is_stylable = type !== "template_instance";

  const {
    //
    boxShadow,
    //
    // margin,
    // padding,
    //
    aspectRatio,
    //
    // flexWrap,
    // gap,
    //
    cursor,
    //
    //
  } = {
    // ...selected_node_default_style,
    ...(style || {}),
  } satisfies grida.program.css.ExplicitlySupportedCSSProperties;

  return (
    <div key={selected_node_id} className="mt-4 mb-10">
      {/* {process.env.NODE_ENV === "development" && (
        <SidebarSection className="border-b pb-4">
          <SidebarSectionHeaderItem>
            <SidebarSectionHeaderLabel>Debug</SidebarSectionHeaderLabel>
          </SidebarSectionHeaderItem>
          <DebugControls />
        </SidebarSection>
      )} */}
      <SidebarSection className="border-b">
        <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel className="w-full flex justify-between items-center">
            <div>
              <div className="capitalize">{type}</div>
              <br />
              <small className="font-mono">{id}</small>
            </div>
          </SidebarSectionHeaderLabel>
        </SidebarSectionHeaderItem>
      </SidebarSection>
      <SidebarSection className="border-b pb-4">
        <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>Layer</SidebarSectionHeaderLabel>
        </SidebarSectionHeaderItem>
        <SidebarMenuSectionContent className="space-y-2">
          <PropertyLine className="items-center">
            <PropertyLineLabel>Name</PropertyLineLabel>
            <NameControl value={name} onValueChange={selectedNode.name} />
          </PropertyLine>
          <PropertyLine className="items-center">
            <PropertyLineLabel>Active</PropertyLineLabel>
            <HiddenControl value={active} onValueChange={selectedNode.active} />
          </PropertyLine>
          <PropertyLine className="items-center">
            <PropertyLineLabel>
              <LockClosedIcon />
            </PropertyLineLabel>
            <HiddenControl value={locked} onValueChange={selectedNode.locked} />
          </PropertyLine>
        </SidebarMenuSectionContent>
      </SidebarSection>
      <SidebarSection className="border-b pb-4">
        <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>Position</SidebarSectionHeaderLabel>
        </SidebarSectionHeaderItem>
        <SidebarMenuSectionContent className="space-y-2">
          <PropertyLine>
            <PositioningConstraintsControl
              value={{
                position,
                top,
                left,
                right,
                bottom,
              }}
              onValueChange={selectedNode.positioning}
            />
          </PropertyLine>
          <PropertyLine>
            <PropertyLineLabel>Mode</PropertyLineLabel>
            <PositioningModeControl
              value={position}
              //
              onValueChange={selectedNode.positioningMode}
            />
          </PropertyLine>
          <PropertyLine>
            <PropertyLineLabel>Rotate</PropertyLineLabel>
            <RotateControl
              value={rotation}
              onValueChange={selectedNode.rotation}
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
            <LengthControl value={width} onValueChange={selectedNode.width} />
          </PropertyLine>
          <PropertyLine>
            <PropertyLineLabel>Height</PropertyLineLabel>
            <LengthControl value={height} onValueChange={selectedNode.height} />
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
            <HrefControl value={node.href} onValueChange={selectedNode.href} />
          </PropertyLine>
          {node.href && (
            <PropertyLine>
              <PropertyLineLabel>New Tab</PropertyLineLabel>
              <TargetBlankControl
                value={node.target}
                onValueChange={selectedNode.target}
              />
            </PropertyLine>
          )}
        </SidebarMenuSectionContent>
      </SidebarSection>
      <SidebarSection hidden={!is_templateinstance} className="border-b pb-4">
        <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>Template</SidebarSectionHeaderLabel>
        </SidebarSectionHeaderItem>
        <SidebarMenuSectionContent>
          <TemplateControl
            value={component_id}
            onValueChange={selectedNode.component}
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
              onValueChange={selectedNode.value}
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
              onValueChange={selectedNode.text}
            />
          </PropertyLine>
          <PropertyLine>
            <PropertyLineLabel>Font</PropertyLineLabel>
            <FontFamilyControl
              value={fontFamily as any}
              onValueChange={selectedNode.fontFamily}
            />
          </PropertyLine>
          <PropertyLine>
            <PropertyLineLabel>Weight</PropertyLineLabel>
            <FontWeightControl
              value={fontWeight as any}
              onValueChange={selectedNode.fontWeight}
            />
          </PropertyLine>
          <PropertyLine>
            <PropertyLineLabel>Size</PropertyLineLabel>
            <FontSizeControl
              value={fontSize as any}
              onValueChange={selectedNode.fontSize}
            />
          </PropertyLine>
          <PropertyLine>
            <PropertyLineLabel>Line</PropertyLineLabel>
            <LineHeightControl
              value={lineHeight as any}
              onValueChange={selectedNode.lineHeight}
            />
          </PropertyLine>
          <PropertyLine>
            <PropertyLineLabel>Letter</PropertyLineLabel>
            <LetterSpacingControl
              value={letterSpacing as any}
              onValueChange={selectedNode.letterSpacing}
            />
          </PropertyLine>
          <PropertyLine>
            <PropertyLineLabel>Align</PropertyLineLabel>
            <TextAlignControl
              value={textAlign}
              onValueChange={selectedNode.textAlign}
            />
          </PropertyLine>
          <PropertyLine>
            <PropertyLineLabel></PropertyLineLabel>
            <TextAlignVerticalControl
              value={textAlignVertical}
              onValueChange={selectedNode.textAlignVertical}
            />
          </PropertyLine>
          <PropertyLine>
            <PropertyLineLabel>Max Length</PropertyLineLabel>
            <MaxlengthControl
              value={maxLength}
              placeholder={(computed.text as any as string)?.length?.toString()}
              onValueChange={selectedNode.maxLength}
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
            <SrcControl value={node.src} onValueChange={selectedNode.src} />
          </PropertyLine>
          <PropertyLine>
            <PropertyLineLabel>Fit</PropertyLineLabel>
            <BoxFitControl value={fit} onValueChange={selectedNode.fit} />
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
              <LayoutControl
                value={layout!}
                onValueChange={selectedNode.layout}
              />
            </PropertyLine>
            {is_flex_container && (
              <>
                <PropertyLine>
                  <PropertyLineLabel>Direction</PropertyLineLabel>
                  <AxisControl
                    value={direction!}
                    onValueChange={selectedNode.direction}
                  />
                </PropertyLine>
                {/* <PropertyLine>
              <PropertyLineLabel>Wrap</PropertyLineLabel>
              <FlexWrapControl
                value={flexWrap as any}
                onValueChange={selectedNode.flexWrap}
              />
            </PropertyLine> */}
                <PropertyLine>
                  <PropertyLineLabel>Distribute</PropertyLineLabel>
                  <MainAxisAlignmentControl
                    value={mainAxisAlignment!}
                    onValueChange={selectedNode.mainAxisAlignment}
                  />
                </PropertyLine>
                <PropertyLine>
                  <PropertyLineLabel>Align</PropertyLineLabel>
                  <CrossAxisAlignmentControl
                    value={crossAxisAlignment!}
                    direction={direction}
                    onValueChange={selectedNode.crossAxisAlignment}
                  />
                </PropertyLine>
                <PropertyLine>
                  <PropertyLineLabel>Gap</PropertyLineLabel>
                  <GapControl
                    value={{
                      mainAxisGap: mainAxisGap!,
                      crossAxisGap: crossAxisGap!,
                    }}
                    onValueChange={selectedNode.gap}
                  />
                </PropertyLine>
              </>
            )}
            {/* <PropertyLine>
              <PropertyLineLabel>Margin</PropertyLineLabel>
              <MarginControl
                value={margin as any}
                onValueChange={selectedNode.margin}
              />
            </PropertyLine> */}
            <PropertyLine>
              <PropertyLineLabel>Padding</PropertyLineLabel>
              <PaddingControl
                value={padding!}
                onValueChange={selectedNode.padding}
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
              onValueChange={selectedNode.opacity}
            />
          </PropertyLine>
          <PropertyLine>
            <PropertyLineLabel>Radius</PropertyLineLabel>
            <CornerRadiusControl
              value={cornerRadius}
              onValueChange={selectedNode.cornerRadius}
            />
          </PropertyLine>
          <PropertyLine>
            <PropertyLineLabel>Border</PropertyLineLabel>
            <BorderControl value={border} onValueChange={selectedNode.border} />
          </PropertyLine>
          {fill && (
            <PropertyLine>
              <PropertyLineLabel>Fill</PropertyLineLabel>
              <FillControl value={fill} onValueChange={selectedNode.fill} />
            </PropertyLine>
          )}
          <PropertyLine>
            <PropertyLineLabel>Shadow</PropertyLineLabel>
            <BoxShadowControl
              value={{ boxShadow }}
              onValueChange={selectedNode.boxShadow}
            />
          </PropertyLine>
          <PropertyLine>
            <PropertyLineLabel>Ratio</PropertyLineLabel>
            <AspectRatioControl
              value={aspectRatio as any}
              onValueChange={selectedNode.aspectRatio}
            />
          </PropertyLine>
          <PropertyLine>
            <PropertyLineLabel>Cursor</PropertyLineLabel>
            <CursorControl value={cursor} onValueChange={selectedNode.cursor} />
          </PropertyLine>
        </SidebarMenuSectionContent>
      </SidebarSection>
      <SidebarSection className="border-b pb-4">
        <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>Developer</SidebarSectionHeaderLabel>
        </SidebarSectionHeaderItem>
        <SidebarMenuSectionContent className="space-y-2">
          <PropertyLine>
            <UserDataControl
              node_id={id}
              value={userdata}
              onValueCommit={selectedNode.userdata}
            />
          </PropertyLine>
        </SidebarMenuSectionContent>
      </SidebarSection>
      <SidebarSection className="border-b pb-4">
        <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>Export</SidebarSectionHeaderLabel>
        </SidebarSectionHeaderItem>
        <SidebarMenuSectionContent className="space-y-2">
          <PropertyLine>
            <ExportNodeWithHtmlToImage node_id={id} name={name} />
          </PropertyLine>
        </SidebarMenuSectionContent>
      </SidebarSection>
    </div>
  );
}

// const i_map = {
//   i_opacity: ["opacity"],
//   i_positioning: ["position", "top", "left"],
//   i_hrefable: ["href", "target"],
//   i_css: ["style"],
//   i_exportable: ["export"],
// };

// const properties_map = {
//   rectangle: ["opacity", "cornerRadius", "fill", "cursor"],
// } as const;

function DebugControls() {
  const { state: document, selectedNode } = useDocument();

  const { selected_node_id } = document;

  const node = useNode(selected_node_id!);
  const {
    id,
    name,
    active,
    component_id,
    style,
    type,
    properties,
    opacity,
    cornerRadius,
    fill,
    position,
    width,
    height,
    left,
    top,
    right,
    bottom,
  } = node;

  const nel = useNodeDomElement(selected_node_id!);

  const clientRect = useMemo(() => {
    return nel?.getBoundingClientRect();
  }, [node]);

  return (
    <SidebarMenuSectionContent>
      <pre className="text-xs font-mono">
        <div>Node {selected_node_id}</div>
        {/* <div>Type {type}</div> */}
        {/* <div>Name {name}</div> */}
        <div>width {width}</div>
        <div>height {height}</div>
        <hr className="my-4" />
        <span className="font-bold">clientRect</span>
        <div>x {clientRect?.x}</div>
        <div>y {clientRect?.y}</div>
        <div>top {clientRect?.top}</div>
        <div>left {clientRect?.left}</div>
        <div>right {clientRect?.right}</div>
        <div>bottom {clientRect?.bottom}</div>
        <div>width {clientRect?.width}</div>
        <div>height {clientRect?.height}</div>
        <hr className="my-4" />
      </pre>
    </SidebarMenuSectionContent>
  );
}
