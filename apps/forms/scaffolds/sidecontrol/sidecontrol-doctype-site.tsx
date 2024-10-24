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

import { Tokens } from "@/ast";
import { useEditorState } from "../editor";
import { PropertyLine, PropertyLineLabel } from "./ui";
import { SideControlGlobal } from "./sidecontrol-global";
import assert from "assert";
import { useDocument } from "../editor/use-document";

export function SideControlDoctypeSite() {
  const [state, dispatch] = useEditorState();

  assert(state.documents, "state.documents is required");
  if (state.documents["form/collection"]!.selected_node_id) {
    return <SelectedNodeProperties />;
  } else {
    return <SideControlGlobal />;
  }
}

function SelectedNodeProperties() {
  const [state, dispatch] = useEditorState();

  // - color - variables
  assert(state.documents, "state.documents is required");
  const {
    selected_node_id,
    selected_node_schema,
    selected_node_type,
    selected_node_default_properties,
    selected_node_default_style,
    selected_node_default_text,
  } = state.documents["form/collection"]!;

  const propertyNames = Object.keys(
    // TODO: add typings to schema
    selected_node_schema?.shape?.properties?.shape || {}
  );

  const istemplate = selected_node_type?.startsWith("templates/");
  const istext = selected_node_type === "text";
  const isflex = selected_node_type === "flex";
  const islayout = isflex;

  const {
    // @ts-ignore TODO:
    component_id,
    attributes,
    style,
    // @ts-ignore TODO:
    properties: _properties,
    // @ts-ignore TODO:
    text,
  } = state.documents["form/collection"]!.template.overrides[
    selected_node_id!
  ] || {};

  const { hidden } = attributes || {};

  const properties = {
    ...(selected_node_default_properties || {}),
    ...(_properties || {}),
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

  const { changeSelectedNode, document } = useDocument("form/collection");

  return (
    <div key={selected_node_id}>
      <SidebarSection hidden className="border-b pb-4">
        <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>Debug</SidebarSectionHeaderLabel>
        </SidebarSectionHeaderItem>
        <SidebarMenuSectionContent>
          <div>Node {document.selected_node_id}</div>
        </SidebarMenuSectionContent>
      </SidebarSection>
      <SidebarSection className="border-b pb-4">
        <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>Layer</SidebarSectionHeaderLabel>
        </SidebarSectionHeaderItem>
        <SidebarMenuSectionContent className="space-y-2">
          <PropertyLine>
            <PropertyLineLabel>Hidden</PropertyLineLabel>
            <HiddenControl
              value={hidden}
              onValueChange={changeSelectedNode.hidden}
            />
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
            onValueChange={changeSelectedNode.component}
          />
        </SidebarMenuSectionContent>
      </SidebarSection>
      <SidebarSection hidden={!istemplate} className="border-b pb-4">
        <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>Component</SidebarSectionHeaderLabel>
        </SidebarSectionHeaderItem>
        <SidebarMenuSectionContent className="space-y-2">
          {propertyNames.map((key) => {
            const value = properties?.[key];

            return (
              <PropertyLine key={key}>
                <PropertyLineLabel>{key}</PropertyLineLabel>
                <StringValueControl
                  placeholder={key}
                  value={value}
                  onValueChange={(value) => {
                    changeSelectedNode.value(key, value || undefined);
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
              onValueChange={changeSelectedNode.text}
            />
          </PropertyLine>
          <PropertyLine>
            <PropertyLineLabel>Weight</PropertyLineLabel>
            <FontWeightControl
              value={fontWeight as any}
              onValueChange={changeSelectedNode.fontWeight}
            />
          </PropertyLine>
          <PropertyLine>
            <PropertyLineLabel>Size</PropertyLineLabel>
            <FontSizeControl
              value={fontSize as any}
              onValueChange={changeSelectedNode.fontSize}
            />
          </PropertyLine>
          <PropertyLine>
            <PropertyLineLabel>Align</PropertyLineLabel>
            <TextAlignControl
              value={textAlign as any}
              onValueChange={changeSelectedNode.textAlign}
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
              onValueChange={changeSelectedNode.flexDirection}
            />
          </PropertyLine>
          <PropertyLine>
            <PropertyLineLabel>Wrap</PropertyLineLabel>
            <FlexWrapControl
              value={flexWrap as any}
              onValueChange={changeSelectedNode.flexWrap}
            />
          </PropertyLine>
          <PropertyLine>
            <PropertyLineLabel>Distribute</PropertyLineLabel>
            <JustifyContentControl
              value={justifyContent as any}
              onValueChange={changeSelectedNode.justifyContent}
            />
          </PropertyLine>
          <PropertyLine>
            <PropertyLineLabel>Align</PropertyLineLabel>
            <AlignItemsControl
              value={alignItems as any}
              flexDirection={flexDirection as any}
              onValueChange={changeSelectedNode.alignItems}
            />
          </PropertyLine>
          <PropertyLine>
            <PropertyLineLabel>Gap</PropertyLineLabel>
            <GapControl
              value={gap as any}
              onValueChange={changeSelectedNode.gap}
            />
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
              onValueChange={changeSelectedNode.opacity}
            />
          </PropertyLine>
          <PropertyLine>
            <PropertyLineLabel>Radius</PropertyLineLabel>
            <BorderRadiusControl
              value={borderRadius as any}
              onValueChange={changeSelectedNode.borderRadius}
            />
          </PropertyLine>
          <PropertyLine>
            <PropertyLineLabel>Border</PropertyLineLabel>
            <BorderControl
              value={border as any}
              onValueChange={changeSelectedNode.border}
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
              onValueChange={changeSelectedNode.boxShadow}
            />
          </PropertyLine>
          <PropertyLine>
            <PropertyLineLabel>Margin</PropertyLineLabel>
            <MarginControl
              value={margin as any}
              onValueChange={changeSelectedNode.margin}
            />
          </PropertyLine>
          <PropertyLine>
            <PropertyLineLabel>Padding</PropertyLineLabel>
            <PaddingControl
              value={padding as any}
              onValueChange={changeSelectedNode.padding}
            />
          </PropertyLine>
          <PropertyLine>
            <PropertyLineLabel>Ratio</PropertyLineLabel>
            <AspectRatioControl
              value={aspectRatio as any}
              onValueChange={changeSelectedNode.aspectRatio}
            />
          </PropertyLine>
          <PropertyLine>
            <PropertyLineLabel>Cursor</PropertyLineLabel>
            <CursorControl
              value={cursor}
              onValueChange={changeSelectedNode.cursor}
            />
          </PropertyLine>
        </SidebarMenuSectionContent>
      </SidebarSection>
    </div>
  );
}
