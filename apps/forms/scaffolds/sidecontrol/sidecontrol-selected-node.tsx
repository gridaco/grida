"use client";

import React, { useCallback } from "react";

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
import { BorderRadiusControl } from "./controls/border-radius";
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
import { useComputedNode, useDocument, useNode } from "@/builder/provider";
import assert from "assert";

export function SelectedNodeProperties() {
  const { document, selectedNode } = useDocument();
  assert(selectedNode);

  // - color - variables
  const { selected_node_id } = document;

  const node = useNode(selected_node_id!);
  const computed = useComputedNode(selected_node_id!);
  const { id, name, active, component_id, style, type, properties } = node;

  const istemplate = type?.startsWith("templates/");
  const istext = type === "text";
  const isimage = type === "image";
  const iscontainer = type === "container";
  const islayout = iscontainer;

  // const { id, name, active, component_id, style, props, text, src } = (document
  //   .template.overrides[selected_node_id!] ||
  //   {}) as grida.program.nodes.AnyNode;

  const {
    opacity,
    fontWeight,
    fontSize,
    textAlign,
    //
    boxShadow,
    //
    borderRadius,
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
  } satisfies React.CSSProperties;

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
          <SidebarSectionHeaderLabel>Link</SidebarSectionHeaderLabel>
        </SidebarSectionHeaderItem>
        <SidebarMenuSectionContent>
          <PropertyLine>
            <PropertyLineLabel>Link To</PropertyLineLabel>
            <HrefControl />
          </PropertyLine>
        </SidebarMenuSectionContent>
      </SidebarSection>
      <SidebarSection hidden={!istemplate} className="border-b pb-4">
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
      <SidebarSection hidden={!istemplate} className="border-b pb-4">
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

      <SidebarSection hidden={!istext} className="border-b pb-4">
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
        </SidebarMenuSectionContent>
      </SidebarSection>
      <SidebarSection hidden={!isimage} className="border-b pb-4">
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
      <SidebarSection hidden={!islayout} className="border-b pb-4">
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
      <SidebarSection className="border-b pb-4">
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
            <BorderRadiusControl
              value={borderRadius as any}
              onValueChange={selectedNode.borderRadius}
            />
          </PropertyLine>
          <PropertyLine>
            <PropertyLineLabel>Border</PropertyLineLabel>
            <BorderControl
              value={border as any}
              onValueChange={selectedNode.border}
            />
          </PropertyLine>
          <PropertyLine>
            <PropertyLineLabel>Background</PropertyLineLabel>
            <BackgroundControl
            // value={}
            // onValueChange={}
            />
          </PropertyLine>
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
    </div>
  );
}
