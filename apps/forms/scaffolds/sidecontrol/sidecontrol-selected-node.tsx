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
import { HiddenControl } from "./controls/hidden";
import { OpacityControl } from "./controls/opacity";
import { HrefControl } from "./controls/href";
import { CornerRadiusControl } from "./controls/corner-radius";
import { BorderControl } from "./controls/border";
import { BackgroundControl } from "./controls/background";
import { StringValueControl } from "./controls/string-value";
import { MarginControl } from "./controls/margin";
import { PaddingControl } from "./controls/padding";
import { AspectRatioControl } from "./controls/aspect-ratio";
import { BoxShadowControl } from "./controls/box-shadow";
import { GapControl } from "./controls/gap";
import { AlignItemsControl } from "./controls/align-items";
import { FlexWrapControl } from "./controls/flex-wrap";
import { FlexDirectionControl } from "./controls/flex-direction";
import { JustifyContentControl } from "./controls/justify-content";
import { TemplateControl } from "./controls/template";
import { CursorControl } from "./controls/cursor";
import { PropertyLine, PropertyLineLabel } from "./ui";
import { SrcControl } from "./controls/src";
import { ObjectFitControl } from "./controls/object-fit";
import { PropsControl } from "./controls/props";
import { TargetBlankControl } from "./controls/target";
import { ExportNodeWithHtmlToImage } from "./controls/export";

import { useComputedNode, useDocument, useNode } from "@/builder";
import assert from "assert";
import { grida } from "@/grida";
import { BackgroundColorControl } from "./controls/background-color";
import { FontFamilyControl } from "./controls/font-family";
import { TextColorControl } from "./controls/text-color";
import {
  PositioningConstraintsControl,
  PositioningModeControl,
} from "./controls/positioning";

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

  // const istemplate = type?.startsWith("templates/");
  const is_instance = type === "instance";
  const is_templateinstance = type === "template_instance";
  const is_text = type === "text";
  const is_image = type === "image";
  const is_container = type === "container";
  const is_layout = is_container;
  const is_stylable = type !== "template_instance";

  const {
    fontFamily,
    fontWeight,
    fontSize,
    textAlign,
    textColor,
    //
    backgroundColor,
    //
    boxShadow,
    //
    borderWidth,
    //
    margin,
    padding,
    //
    aspectRatio,
    //
    flexDirection,
    flexWrap,
    justifyContent,
    alignItems,
    gap,
    //
    cursor,
    //
    objectFit,
    //
  } = {
    // ...selected_node_default_style,
    ...(style || {}),
  } satisfies grida.program.css.ExplicitlySupportedCSSProperties;

  const border = {
    borderWidth,
  };

  return (
    <div key={selected_node_id}>
      <SidebarSection
        // hidden
        className="border-b pb-4"
      >
        <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>Debug</SidebarSectionHeaderLabel>
        </SidebarSectionHeaderItem>
        <SidebarMenuSectionContent>
          <pre className="text-xs font-mono">
            <div>Node {selected_node_id}</div>
            <div>Type {type}</div>
            <div>Name {name}</div>
            <div>width {width}</div>
            <div>height {height}</div>
          </pre>
        </SidebarMenuSectionContent>
      </SidebarSection>
      <SidebarSection className="border-b pb-4">
        <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>Layer</SidebarSectionHeaderLabel>
        </SidebarSectionHeaderItem>
        <SidebarMenuSectionContent className="space-y-2">
          <PropertyLine>
            <PropertyLineLabel>Active</PropertyLineLabel>
            <HiddenControl value={active} onValueChange={selectedNode.active} />
          </PropertyLine>
        </SidebarMenuSectionContent>
      </SidebarSection>
      <SidebarSection className="border-b pb-4">
        <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>Positioning</SidebarSectionHeaderLabel>
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
            <PropertyLineLabel>Align</PropertyLineLabel>
            <TextAlignControl
              value={textAlign as any}
              onValueChange={selectedNode.textAlign}
            />
          </PropertyLine>
          {textColor && (
            <PropertyLine>
              <PropertyLineLabel>Color</PropertyLineLabel>
              <TextColorControl
                value={textColor}
                onValueChange={selectedNode.textColor}
              />
            </PropertyLine>
          )}
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
            <ObjectFitControl
              value={objectFit as any}
              onValueChange={selectedNode.objectFit}
            />
          </PropertyLine>
        </SidebarMenuSectionContent>
      </SidebarSection>
      <SidebarSection hidden={!is_layout} className="border-b pb-4">
        <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>Layout</SidebarSectionHeaderLabel>
        </SidebarSectionHeaderItem>
        <SidebarMenuSectionContent className="space-y-2">
          <PropertyLine>
            <PropertyLineLabel>Direction</PropertyLineLabel>
            <FlexDirectionControl
              value={flexDirection as any}
              onValueChange={selectedNode.flexDirection}
            />
          </PropertyLine>
          <PropertyLine>
            <PropertyLineLabel>Wrap</PropertyLineLabel>
            <FlexWrapControl
              value={flexWrap as any}
              onValueChange={selectedNode.flexWrap}
            />
          </PropertyLine>
          <PropertyLine>
            <PropertyLineLabel>Distribute</PropertyLineLabel>
            <JustifyContentControl
              value={justifyContent as any}
              onValueChange={selectedNode.justifyContent}
            />
          </PropertyLine>
          <PropertyLine>
            <PropertyLineLabel>Align</PropertyLineLabel>
            <AlignItemsControl
              value={alignItems as any}
              flexDirection={flexDirection as any}
              onValueChange={selectedNode.alignItems}
            />
          </PropertyLine>
          <PropertyLine>
            <PropertyLineLabel>Gap</PropertyLineLabel>
            <GapControl value={gap as any} onValueChange={selectedNode.gap} />
          </PropertyLine>
        </SidebarMenuSectionContent>
      </SidebarSection>
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
            <BorderControl
              value={border as any}
              onValueChange={selectedNode.border}
            />
          </PropertyLine>
          {backgroundColor && (
            <PropertyLine>
              <PropertyLineLabel>Background Color</PropertyLineLabel>
              <BackgroundColorControl
                value={backgroundColor}
                onValueChange={selectedNode.backgroundColor}
              />
            </PropertyLine>
          )}
          {fill && (
            <PropertyLine>
              <PropertyLineLabel>Fill</PropertyLineLabel>
              <BackgroundControl
                value={fill}
                onValueChange={selectedNode.fill}
              />
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
            <PropertyLineLabel>Margin</PropertyLineLabel>
            <MarginControl
              value={margin as any}
              onValueChange={selectedNode.margin}
            />
          </PropertyLine>
          <PropertyLine>
            <PropertyLineLabel>Padding</PropertyLineLabel>
            <PaddingControl
              value={padding as any}
              onValueChange={selectedNode.padding}
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
