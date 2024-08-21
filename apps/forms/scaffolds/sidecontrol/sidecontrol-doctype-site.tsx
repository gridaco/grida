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

export function SideControlDoctypeSite() {
  const [state, dispatch] = useEditorState();

  if (state.document.selected_node_id) {
    return <SelectedNodeProperties />;
  } else {
    return <SideControlGlobal />;
  }
}

function SelectedNodeProperties() {
  const [state, dispatch] = useEditorState();

  // - color - variables

  const {
    selected_node_id,
    selected_node_schema,
    selected_node_type,
    selected_node_default_properties,
    selected_node_default_style,
    selected_node_default_text,
  } = state.document;

  const propertyNames = Object.keys(
    // TODO: add typings to schema
    selected_node_schema?.shape?.properties?.shape || {}
  );

  const istemplate = selected_node_type?.startsWith("templates/");
  const istext = selected_node_type === "text";
  const isflex = selected_node_type === "flex";
  const islayout = isflex;

  const {
    template_id,
    attributes,
    style,
    properties: _properties,
    text,
  } = state.document.templatedata[selected_node_id!] || {};

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
  };

  const border = {
    borderWidth,
  };

  const changetemplate = useCallback(
    (template_id: string) => {
      dispatch({
        type: "editor/document/node/template",
        node_id: selected_node_id!,
        template_id,
      });
    },
    [dispatch, selected_node_id]
  );

  const changetext = useCallback(
    (text?: Tokens.StringValueExpression) => {
      dispatch({
        type: "editor/document/node/text",
        node_id: selected_node_id!,
        text,
      });
    },
    [dispatch, selected_node_id]
  );

  const changeattribute = useCallback(
    (key: string, value: any) => {
      dispatch({
        type: "editor/document/node/attribute",
        node_id: selected_node_id!,
        data: {
          [key]: value,
        },
      });
    },
    [dispatch, selected_node_id]
  );

  const changestyle = useCallback(
    (key: string, value: any) => {
      dispatch({
        type: "editor/document/node/style",
        node_id: selected_node_id!,
        data: {
          [key]: value,
        },
      });
    },
    [dispatch, selected_node_id]
  );

  const changeproperty = useCallback(
    (key: string, value: any) => {
      dispatch({
        type: "editor/document/node/property",
        node_id: selected_node_id!,
        data: {
          [key]: value,
        },
      });
    },
    [dispatch, selected_node_id]
  );

  // attributes
  const changehidden = (value: boolean) => changeattribute("hidden", value);

  // style
  const changeopacity = (value: number) => changestyle("opacity", value);
  const changefontWeight = (value: number) => changestyle("fontWeight", value);
  const changefontSize = (value?: number) => changestyle("fontSize", value);
  const changetextAlign = (value: string) => changestyle("textAlign", value);
  const changeborderRadius = (value?: number) =>
    changestyle("borderRadius", value);
  const changemargin = (value?: number) => changestyle("margin", value);
  const changepadding = (value?: number) => changestyle("padding", value);
  const changeaspectRatio = (value?: number) =>
    changestyle("aspectRatio", value);
  const changeBorder = (value?: any) => {
    changestyle("borderWidth", value.borderWidth);
  };
  const changeboxShadow = (value?: any) => {
    changestyle("boxShadow", value.boxShadow);
  };
  const changegap = (value?: number) => changestyle("gap", value);
  const changeflexDirection = (value?: string) =>
    changestyle("flexDirection", value);
  const changeflexWrap = (value?: string) => changestyle("flexWrap", value);
  const changejustifyContent = (value?: string) =>
    changestyle("justifyContent", value);
  const changealignItems = (value?: string) => changestyle("alignItems", value);
  const changecursor = (value?: string) => changestyle("cursor", value);

  return (
    <div key={selected_node_id}>
      <SidebarSection hidden className="border-b pb-4">
        <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>Debug</SidebarSectionHeaderLabel>
        </SidebarSectionHeaderItem>
        <SidebarMenuSectionContent>
          <div>Node {state.document.selected_node_id}</div>
        </SidebarMenuSectionContent>
      </SidebarSection>
      <SidebarSection className="border-b pb-4">
        <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>Layer</SidebarSectionHeaderLabel>
        </SidebarSectionHeaderItem>
        <SidebarMenuSectionContent className="space-y-2">
          <PropertyLine>
            <PropertyLineLabel>Hidden</PropertyLineLabel>
            <HiddenControl value={hidden} onValueChange={changehidden} />
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
          <TemplateControl value={template_id} onValueChange={changetemplate} />
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
                    changeproperty(key, value || undefined);
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
              onValueChange={changetext}
            />
          </PropertyLine>
          <PropertyLine>
            <PropertyLineLabel>Weight</PropertyLineLabel>
            <FontWeightControl
              value={fontWeight as any}
              onValueChange={changefontWeight}
            />
          </PropertyLine>
          <PropertyLine>
            <PropertyLineLabel>Size</PropertyLineLabel>
            <FontSizeControl
              value={fontSize as any}
              onValueChange={changefontSize}
            />
          </PropertyLine>
          <PropertyLine>
            <PropertyLineLabel>Align</PropertyLineLabel>
            <TextAlignControl
              value={textAlign as any}
              onValueChange={changetextAlign}
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
              onValueChange={changeflexDirection}
            />
          </PropertyLine>
          <PropertyLine>
            <PropertyLineLabel>Wrap</PropertyLineLabel>
            <FlexWrapControl
              value={flexWrap as any}
              onValueChange={changeflexWrap}
            />
          </PropertyLine>
          <PropertyLine>
            <PropertyLineLabel>Distribute</PropertyLineLabel>
            <JustifyContentControl
              value={justifyContent as any}
              onValueChange={changejustifyContent}
            />
          </PropertyLine>
          <PropertyLine>
            <PropertyLineLabel>Align</PropertyLineLabel>
            <AlignItemsControl
              value={alignItems as any}
              flexDirection={flexDirection as any}
              onValueChange={changealignItems}
            />
          </PropertyLine>
          <PropertyLine>
            <PropertyLineLabel>Gap</PropertyLineLabel>
            <GapControl value={gap as any} onValueChange={changegap} />
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
              onValueChange={changeopacity}
            />
          </PropertyLine>
          <PropertyLine>
            <PropertyLineLabel>Radius</PropertyLineLabel>
            <BorderRadiusControl
              value={borderRadius as any}
              onValueChange={changeborderRadius}
            />
          </PropertyLine>
          <PropertyLine>
            <PropertyLineLabel>Border</PropertyLineLabel>
            <BorderControl value={border as any} onValueChange={changeBorder} />
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
              onValueChange={changeboxShadow}
            />
          </PropertyLine>
          <PropertyLine>
            <PropertyLineLabel>Margin</PropertyLineLabel>
            <MarginControl value={margin as any} onValueChange={changemargin} />
          </PropertyLine>
          <PropertyLine>
            <PropertyLineLabel>Padding</PropertyLineLabel>
            <PaddingControl
              value={padding as any}
              onValueChange={changepadding}
            />
          </PropertyLine>
          <PropertyLine>
            <PropertyLineLabel>Ratio</PropertyLineLabel>
            <AspectRatioControl
              value={aspectRatio as any}
              onValueChange={changeaspectRatio}
            />
          </PropertyLine>
          <PropertyLine>
            <PropertyLineLabel>Cursor</PropertyLineLabel>
            <CursorControl value={cursor} onValueChange={changecursor} />
          </PropertyLine>
        </SidebarMenuSectionContent>
      </SidebarSection>
    </div>
  );
}
