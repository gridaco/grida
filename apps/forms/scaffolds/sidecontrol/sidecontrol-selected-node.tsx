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
import { useCurrentDocument } from "../editor/use-document";
import assert from "assert";
import { SrcControl } from "./controls/src";
import { grida } from "@/grida";

export function SelectedNodeProperties() {
  const { document, selectedNode } = useCurrentDocument();
  assert(selectedNode);

  // - color - variables
  const {
    selected_node_id,
    selected_node_meta: {
      selected_node_schema,
      selected_node_type,
      selected_node_default_properties,
      selected_node_default_style,
      selected_node_default_text,
    } = {},
  } = document;

  const propertyNames = Object.keys(
    // TODO: add typings to schema
    selected_node_schema?.shape?.properties?.shape || {}
  );

  const istemplate = selected_node_type?.startsWith("templates/");
  const istext = selected_node_type === "text";
  const isimage = selected_node_type === "image";
  const isflex = selected_node_type === "flex";
  const islayout = isflex;

  const { id, name, hidden, component_id, style, props, text, src } = (document
    .template.overrides[selected_node_id!] ||
    {}) as grida.program.nodes.AnyNode;

  const finalprops = {
    ...(selected_node_default_properties || {}),
    ...(props || {}),
  };

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
  } = {
    ...selected_node_default_style,
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
            <div>Type {selected_node_type}</div>
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
            <PropertyLineLabel>Hidden</PropertyLineLabel>
            <HiddenControl value={hidden} onValueChange={selectedNode.hidden} />
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
          <SidebarSectionHeaderLabel>Component</SidebarSectionHeaderLabel>
        </SidebarSectionHeaderItem>
        <SidebarMenuSectionContent className="space-y-2">
          {propertyNames.map((key) => {
            const value = finalprops?.[key];

            return (
              <PropertyLine key={key}>
                <PropertyLineLabel>{key}</PropertyLineLabel>
                <StringValueControl
                  placeholder={key}
                  value={value}
                  onValueChange={(value) => {
                    selectedNode.value(key, value || undefined);
                  }}
                />
              </PropertyLine>
            );
          })}
        </SidebarMenuSectionContent>
      </SidebarSection>

      <SidebarSection hidden={!istext} className="border-b pb-4">
        <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>Text</SidebarSectionHeaderLabel>
        </SidebarSectionHeaderItem>
        <SidebarMenuSectionContent className="space-y-2">
          <PropertyLine>
            <PropertyLineLabel>Value</PropertyLineLabel>
            <StringValueControl
              value={text || selected_node_default_text}
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
            <SrcControl value={src} onValueChange={selectedNode.src} />
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
