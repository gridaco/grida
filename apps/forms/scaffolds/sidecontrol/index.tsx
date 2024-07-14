"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  SidebarMenuSectionContent,
  SidebarRoot,
  SidebarSection,
  SidebarSectionHeaderItem,
  SidebarSectionHeaderLabel,
} from "@/components/sidebar";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Ag } from "@/components/design/ag";
import { fonts } from "@/theme/font-family";
import { useEditorState } from "../editor";
import { FormStyleSheetV1Schema } from "@/types";
import * as _variants from "@/theme/palettes";
import { PaletteColorChip } from "@/components/design/palette-color-chip";
import { backgrounds } from "@/theme/k";
import { sections } from "@/theme/section";
import { Button } from "@/components/ui/button";
import { OpenInNewWindowIcon, Pencil2Icon } from "@radix-ui/react-icons";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import Link from "next/link";
import { Editor, useMonaco } from "@monaco-editor/react";
import { useTheme } from "next-themes";
import { useMonacoTheme } from "@/components/monaco";
import { customcss_starter_template } from "@/theme/customcss/k";
import { Input } from "@/components/ui/input";
import { TemplateComponents } from "@/builder/template-builder";
import { Label } from "@/components/ui/label";
import { TextAlignControl } from "./controls/text-align";
import { FontSizeControl } from "./controls/font-size";
import { FontWeightControl } from "./controls/font-weight";
import { HiddenControl } from "./controls/hidden";
import { OpacityControl } from "./controls/opacity";
import { HrefControl } from "./controls/href";
import { BorderRadiusControl } from "./controls/border-radius";
import { BorderControl } from "./controls/border";
import { BackgroundControl } from "./controls/background";
import { StringLiteralControl } from "./controls/string-literal";
import { inputVariants } from "./controls/utils/input-variants";
import { MarginControl } from "./controls/margin";
import { PaddingControl } from "./controls/padding";
import { AspectRatioControl } from "./controls/aspect-ratio";
import { BoxShadowControl } from "./controls/box-shadow";
import { GapControl } from "./controls/gap";
import { AlignItemsControl } from "./controls/align-items";
import { FlexWrapControl } from "./controls/flex-wrap";
import { FlexDirectionControl } from "./controls/flex-direction";
import { JustifyContentControl } from "./controls/justify-content";

const { default: _, ...variants } = _variants;

export function SideControl({ mode }: { mode: "blocks" }) {
  return (
    <SidebarRoot side="right">
      <div className="h-5" />
      {mode === "blocks" && <ModeBlocks />}
    </SidebarRoot>
  );
}

function ModeBlocks() {
  const [state, dispatch] = useEditorState();

  if (state.document.selected_node_id) {
    return <SelectedNodeProperties />;
  } else {
    return <GlobalProperties />;
  }
}

function SelectedNodeProperties() {
  const [state, dispatch] = useEditorState();

  // - color - variables

  const { selected_node_id, selected_node_schema, selected_node_type } =
    state.document;

  const propertyNames = Object.keys(
    selected_node_schema?.shape.props.shape || {}
  );

  const istemplate = selected_node_type?.startsWith("templates/");
  const istext = selected_node_type === "text";

  const properties = state.document.templatedata[selected_node_id!];

  const {
    template_id,
    opacity,
    hidden,
    text,
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
  } = properties || {};

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

  const changehidden = (value: boolean) => changeproperty("hidden", value);
  const changeopacity = (value: number) => changeproperty("opacity", value);
  const changetext = (value: string) => changeproperty("text", value);
  const changefontWeight = (value: string) =>
    changeproperty("fontWeight", value);
  const changefontSize = (value?: number) => changeproperty("fontSize", value);
  const changetextAlign = (value: string) => changeproperty("textAlign", value);
  const changeborderRadius = (value?: number) =>
    changeproperty("borderRadius", value);
  const changemargin = (value?: number) => changeproperty("margin", value);
  const changepadding = (value?: number) => changeproperty("padding", value);
  const changeaspectRatio = (value?: number) =>
    changeproperty("aspectRatio", value);
  const changeBorder = (value?: any) => {
    changeproperty("borderWidth", value.borderWidth);
  };
  const changeboxShadow = (value?: any) => {
    changeproperty("boxShadow", value.boxShadow);
  };

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
          <Select value={template_id} onValueChange={changetemplate}>
            <SelectTrigger className={inputVariants({ size: "sm" })}>
              <SelectValue placeholder="None" />
            </SelectTrigger>
            <SelectContent>
              {Object.keys(TemplateComponents.components).map((key) => {
                return (
                  <SelectItem key={key} value={key}>
                    {key}
                  </SelectItem>
                );
              })}
            </SelectContent>
          </Select>
        </SidebarMenuSectionContent>
      </SidebarSection>
      <SidebarSection hidden={!istemplate} className="border-b pb-4">
        <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>Properties</SidebarSectionHeaderLabel>
        </SidebarSectionHeaderItem>
        <SidebarMenuSectionContent className="space-y-2">
          {propertyNames.map((key) => {
            const value = state.document.templatedata[selected_node_id!]?.[key];

            const onValueChange = (value: any) => {
              dispatch({
                type: "editor/document/node/property",
                node_id: selected_node_id!,
                data: {
                  [key]: value,
                },
              });
            };

            return (
              <PropertyLine key={key}>
                <PropertyLineLabel>{key}</PropertyLineLabel>
                <Input
                  placeholder={key}
                  value={value}
                  onChange={(e) => {
                    onValueChange(e.target.value || undefined);
                  }}
                  className={inputVariants({ size: "sm" })}
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
            <StringLiteralControl value={text} onChangeValue={changetext} />
          </PropertyLine>
          <PropertyLine>
            <PropertyLineLabel>Weight</PropertyLineLabel>
            <FontWeightControl
              value={fontWeight}
              onValueChange={changefontWeight}
            />
          </PropertyLine>
          <PropertyLine>
            <PropertyLineLabel>Size</PropertyLineLabel>
            <FontSizeControl value={fontSize} onValueChange={changefontSize} />
          </PropertyLine>
          <PropertyLine>
            <PropertyLineLabel>Align</PropertyLineLabel>
            <TextAlignControl
              value={textAlign}
              onValueChange={changetextAlign}
            />
          </PropertyLine>
        </SidebarMenuSectionContent>
      </SidebarSection>
      <SidebarSection className="border-b pb-4">
        <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>Layout</SidebarSectionHeaderLabel>
        </SidebarSectionHeaderItem>
        <SidebarMenuSectionContent>
          <PropertyLine>
            <PropertyLineLabel>Direction</PropertyLineLabel>
            <FlexDirectionControl
            // value={ } onValueChange={change}
            />
          </PropertyLine>
          <PropertyLine>
            <PropertyLineLabel>Wrap</PropertyLineLabel>
            <FlexWrapControl
            // value={ } onValueChange={change}
            />
          </PropertyLine>
          <PropertyLine>
            <PropertyLineLabel>Distribute</PropertyLineLabel>
            <JustifyContentControl
              // value={ } onValueChange={change}
            />
          </PropertyLine>
          <PropertyLine>
            <PropertyLineLabel>Align</PropertyLineLabel>
            <AlignItemsControl
            // value={ } onValueChange={change}
            />
          </PropertyLine>
          <PropertyLine>
            <PropertyLineLabel>Gap</PropertyLineLabel>
            <GapControl
            // value={ } onValueChange={change}
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
            <OpacityControl value={opacity} onValueChange={changeopacity} />
          </PropertyLine>
          <PropertyLine>
            <PropertyLineLabel>Radius</PropertyLineLabel>
            <BorderRadiusControl
              value={borderRadius}
              onValueChange={changeborderRadius}
            />
          </PropertyLine>
          <PropertyLine>
            <PropertyLineLabel>Border</PropertyLineLabel>
            <BorderControl value={border} onValueChange={changeBorder} />
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
            <MarginControl value={margin} onValueChange={changemargin} />
          </PropertyLine>
          <PropertyLine>
            <PropertyLineLabel>Padding</PropertyLineLabel>
            <PaddingControl value={padding} onValueChange={changepadding} />
          </PropertyLine>
          <PropertyLine>
            <PropertyLineLabel>Ratio</PropertyLineLabel>
            <AspectRatioControl
              value={aspectRatio}
              onValueChange={changeaspectRatio}
            />
          </PropertyLine>
        </SidebarMenuSectionContent>
      </SidebarSection>
    </div>
  );
}

function PropertyLine({ children }: React.PropsWithChildren<{}>) {
  return <div className="flex items-center justify-between">{children}</div>;
}

function PropertyLineLabel({ children }: React.PropsWithChildren<{}>) {
  return (
    <Label className="text-muted-foreground text-xs w-20 me-4 text-ellipsis overflow-hidden">
      {children}
    </Label>
  );
}

function GlobalProperties() {
  return (
    <>
      <SidebarSection className="border-b pb-4">
        <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>Type</SidebarSectionHeaderLabel>
        </SidebarSectionHeaderItem>
        <FontFamily />
      </SidebarSection>
      <SidebarSection className="border-b pb-4">
        <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>Palette</SidebarSectionHeaderLabel>
        </SidebarSectionHeaderItem>
        <SidebarMenuSectionContent>
          <Palette />
        </SidebarMenuSectionContent>
      </SidebarSection>
      <SidebarSection className="border-b pb-4">
        <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>Background</SidebarSectionHeaderLabel>
        </SidebarSectionHeaderItem>
        <SidebarMenuSectionContent>
          <Background />
        </SidebarMenuSectionContent>
      </SidebarSection>
      <SidebarSection className="border-b pb-4">
        <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>Section Style</SidebarSectionHeaderLabel>
        </SidebarSectionHeaderItem>
        <SidebarMenuSectionContent>
          <SectionStyle />
        </SidebarMenuSectionContent>
      </SidebarSection>
      <SidebarSection className="border-b pb-4">
        <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>Custom CSS</SidebarSectionHeaderLabel>
        </SidebarSectionHeaderItem>
        <SidebarMenuSectionContent>
          <CustomCSS />
        </SidebarMenuSectionContent>
      </SidebarSection>
    </>
  );
}

function FontFamily() {
  const [state, dispatch] = useEditorState();

  const onFontChange = useCallback(
    (fontFamily: FormStyleSheetV1Schema["font-family"]) => {
      dispatch({
        type: "editor/theme/font-family",
        fontFamily,
      });
    },
    [dispatch]
  );

  return (
    <ToggleGroup
      type="single"
      value={state.theme.fontFamily}
      onValueChange={(value) => onFontChange(value as any)}
    >
      <ToggleGroupItem value={"inter"} className="h-full w-1/3">
        <div className="flex flex-col items-center justify-center gap-2 p-1">
          <Ag className="text-2xl" fontClassName={fonts.inter.className} />
          <span className="text-xs">Default</span>
        </div>
      </ToggleGroupItem>
      <ToggleGroupItem value={"lora"} className="h-full w-1/3">
        <div className="flex flex-col items-center justify-center gap-2 p-1">
          <Ag className="text-2xl" fontClassName={fonts.lora.className} />
          <span className="text-xs">Serif</span>
        </div>
      </ToggleGroupItem>
      <ToggleGroupItem value={"inconsolata"} className="h-full w-1/3">
        <div className="flex flex-col items-center justify-center gap-2 p-1">
          <Ag
            className="text-2xl"
            fontClassName={fonts.inconsolata.className}
          />
          <span className="text-xs">Mono</span>
        </div>
      </ToggleGroupItem>
    </ToggleGroup>
  );
}

function Palette() {
  const [state, dispatch] = useEditorState();

  const palette = state.theme.palette;

  const onPaletteChange = useCallback(
    (palette: FormStyleSheetV1Schema["palette"]) => {
      dispatch({
        type: "editor/theme/palette",
        palette,
      });
    },
    [dispatch]
  );

  return (
    <div className="flex flex-col gap-4">
      {Object.keys(variants).map((variant) => {
        const palettes = variants[variant as keyof typeof variants];
        return (
          <div key={variant} className="flex flex-col gap-2">
            <h2 className="text-sm font-mono text-muted-foreground">
              {variant}
            </h2>
            <div className="flex flex-wrap gap-1">
              {Object.keys(palettes).map((key) => {
                const colors = palettes[key as keyof typeof palettes];
                const primary: any = colors["light"]["--primary"];
                return (
                  <PaletteColorChip
                    key={key}
                    primary={primary}
                    onClick={() => {
                      onPaletteChange(key as any);
                    }}
                    selected={key === palette}
                  />
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Background() {
  const [state, dispatch] = useEditorState();

  const background = state.theme.background;

  const onBackgroundSrcChange = useCallback(
    (src: string) => {
      dispatch({
        type: "editor/theme/background",
        background: {
          type: "background",
          element: "iframe",
          src,
        },
      });
    },
    [dispatch]
  );

  return (
    <>
      <Select
        name="src"
        value={background?.src}
        onValueChange={onBackgroundSrcChange}
      >
        <SelectTrigger>
          <SelectValue placeholder="None" />
        </SelectTrigger>
        <SelectContent>
          {backgrounds.map((background, i) => (
            <SelectItem key={i} value={background.value}>
              {background.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );
}

function SectionStyle() {
  const [state, dispatch] = useEditorState();

  const css = state.theme.section;

  const onSectionStyleChange = useCallback(
    (css: string) => {
      dispatch({
        type: "editor/theme/section",
        section: css,
      });
    },
    [dispatch]
  );

  return (
    <>
      <Select name="css" value={css} onValueChange={onSectionStyleChange}>
        <SelectTrigger>
          <SelectValue placeholder="Select Section Style" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={""}>None</SelectItem>
          {sections.map((section, i) => (
            <SelectItem key={i} value={section.css}>
              {section.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );
}

function CustomCSS() {
  const [state, dispatch] = useEditorState();
  const monaco = useMonaco();
  const { resolvedTheme } = useTheme();
  useMonacoTheme(monaco, resolvedTheme ?? "light");

  const [css, setCss] = useState<string | undefined>(
    state.theme.customCSS || customcss_starter_template
  );

  const setCustomCss = useCallback(
    (css?: string) => {
      dispatch({
        type: "editor/theme/custom-css",
        custom: css,
      });
    },
    [dispatch]
  );

  const onSaveClick = useCallback(() => {
    setCustomCss(css);
  }, [setCustomCss, css]);

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full">
          <Pencil2Icon className="w-4 h-4 inline me-2 align-middle" />
          Custom CSS
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Custom CSS</DialogTitle>
          <DialogDescription>
            Customize Page CSS (only available through built-in pages).
            <br />
            You can Use{" "}
            <Link className="underline" href="/playground" target="_blank">
              Playground
              <OpenInNewWindowIcon className="w-4 h-4 inline align-middle ms-1" />
            </Link>{" "}
            to test your CSS
          </DialogDescription>
        </DialogHeader>
        <div>
          <Editor
            className="rounded overflow-hidden border"
            width="100%"
            height={500}
            defaultLanguage="scss"
            onChange={setCss}
            defaultValue={css}
            options={{
              // top padding
              padding: {
                top: 10,
              },
              tabSize: 2,
              fontSize: 13,
              minimap: {
                enabled: false,
              },
              glyphMargin: false,
              folding: false,
              scrollBeyondLastLine: false,
              wordWrap: "on",
            }}
          />
        </div>
        <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <DialogClose asChild>
            <Button onClick={onSaveClick}>Save</Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
