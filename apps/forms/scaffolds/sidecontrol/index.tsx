"use client";

import React, { useCallback, useEffect, useState } from "react";
import Image from "next/image";
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
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Ag } from "@/components/design/ag";
import { fonts } from "@/theme/font-family";
import { useEditorState } from "../editor";
import { FormStyleSheetV1Schema, FormsPageLanguage } from "@/types";
import * as _variants from "@/theme/palettes";
import { PaletteColorChip } from "@/components/design/palette-color-chip";
import { sections } from "@/theme/section";
import { Button } from "@/components/ui/button";
import {
  GearIcon,
  OpenInNewWindowIcon,
  Pencil2Icon,
} from "@radix-ui/react-icons";
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
import { Tokens } from "@/ast";
import { CursorControl } from "./controls/cursor";
import { cn } from "@/utils";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  PreferenceBody,
  PreferenceBox,
  PreferenceBoxHeader,
  PreferenceDescription,
} from "@/components/preferences";
import {
  language_label_map,
  supported_form_page_languages,
} from "@/k/supported_languages";
import { Switch } from "@/components/ui/switch";
import { PoweredByGridaWaterMark } from "@/components/powered-by-branding";

const { default: all, ...variants } = _variants;

export function SideControl({ mode }: { mode: "design" }) {
  return (
    <SidebarRoot side="right">
      <div className="h-5" />
      {mode === "design" && <ModeDesign />}
    </SidebarRoot>
  );
}

function ModeDesign() {
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

function PropertyLine({ children }: React.PropsWithChildren<{}>) {
  return (
    <div className="flex items-start justify-between max-w-full">
      {children}
    </div>
  );
}

function PropertyLineLabel({ children }: React.PropsWithChildren<{}>) {
  return (
    <Label className="text-muted-foreground h-8 min-w-20 w-20 flex items-center text-xs me-4 overflow-hidden">
      <span className="text-ellipsis overflow-hidden">{children}</span>
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
      <SidebarSection className="border-b pb-4">
        <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>Settings</SidebarSectionHeaderLabel>
        </SidebarSectionHeaderItem>
        <SidebarMenuSectionContent>
          <FormSettings />
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

  const paletteobj = palette ? all[palette] : undefined;

  return (
    <Select
      value={palette}
      onValueChange={(v) => {
        onPaletteChange(v as any);
      }}
    >
      <SelectTrigger className={cn(paletteobj && "h-16 px-2 py-2")}>
        <SelectValue>
          {paletteobj ? (
            <div className="flex items-center gap-2">
              <PaletteColorChip
                primary={paletteobj["light"]["--primary"]}
                secondary={paletteobj["light"]["--secondary"]}
                background={paletteobj["light"]["--background"]}
                className="min-w-12 w-12 h-12 rounded border"
              />
              <span className="text-xs text-muted-foreground text-ellipsis overflow-hidden">
                {palette}
              </span>
            </div>
          ) : (
            <>None</>
          )}
        </SelectValue>
      </SelectTrigger>
      <SelectContent>
        {Object.keys(variants).map((variant) => {
          const palettes = variants[variant as keyof typeof variants];
          return (
            <SelectGroup key={variant} className="flex flex-col gap-2">
              <SelectLabel>{variant}</SelectLabel>
              {Object.keys(palettes).map((key) => {
                const colors = palettes[key as keyof typeof palettes];
                const primary = colors["light"]["--primary"];
                const secondary = colors["light"]["--secondary"];
                const background = colors["light"]["--background"];
                return (
                  <SelectItem key={key} value={key}>
                    <div className="flex gap-2 items-center">
                      <PaletteColorChip
                        key={key}
                        primary={primary}
                        secondary={secondary}
                        background={background}
                        onSelect={() => {
                          onPaletteChange(key as any);
                        }}
                        selected={key === palette}
                        className="w-10 h-10 rounded"
                      />
                      <span className="text-ellipsis overflow-hidden">
                        {key}
                      </span>
                    </div>
                  </SelectItem>
                );
              })}
            </SelectGroup>
          );
        })}
      </SelectContent>
    </Select>
  );
}

function Background() {
  const [state, dispatch] = useEditorState();

  const {
    theme: { background },
    assets: { backgrounds },
  } = state;

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

  const selected = backgrounds.find((b) => b.embed === background?.src);

  return (
    <>
      <Select
        name="src"
        value={background?.src}
        onValueChange={onBackgroundSrcChange}
      >
        <SelectTrigger className={cn(selected && "h-16 px-2 py-2")}>
          <SelectValue placeholder="None">
            {selected ? (
              <div className="flex items-center gap-2">
                <Image
                  width={48}
                  height={48}
                  src={selected.preview[0]}
                  alt={selected.title}
                  className="rounded border"
                />
                <span className="text-xs text-muted-foreground">
                  {selected.title}
                </span>
              </div>
            ) : (
              <>None</>
            )}
          </SelectValue>
        </SelectTrigger>
        <SelectContent>
          <SelectItem key={"noop"} value={""}>
            None
          </SelectItem>
          {backgrounds.map((background, i) => (
            <SelectItem key={background.embed} value={background.embed}>
              <div>
                <Image
                  width={100}
                  height={100}
                  src={background.preview[0]}
                  alt={background.title}
                  className="rounded border"
                />
                <span className="text-xs text-muted-foreground">
                  {background.title}
                </span>
              </div>
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

function FormSettings() {
  const [state, dispatch] = useEditorState();
  const {
    theme: { lang, is_powered_by_branding_enabled },
  } = state;

  const onLangChange = useCallback(
    (lang: FormsPageLanguage) => {
      dispatch({
        type: "editor/theme/lang",
        lang,
      });
    },
    [dispatch]
  );

  const onPoweredByBrandingEnabledChange = useCallback(
    (enabled: boolean) => {
      dispatch({
        type: "editor/theme/powered_by_branding",
        enabled,
      });
    },
    [dispatch]
  );

  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline" className="w-full">
          <GearIcon className="w-4 h-4 inline me-2 align-middle" />
          Settings
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Form Settings</DialogTitle>
        </DialogHeader>
        <div>
          <Tabs>
            <TabsList>
              <TabsTrigger value="lang">Language</TabsTrigger>
              <TabsTrigger value="branding">Branding</TabsTrigger>
            </TabsList>
            <TabsContent value="lang">
              <PreferenceBox>
                <PreferenceBoxHeader
                  heading={<>Page Language</>}
                  description={
                    <>Choose the language that your customers will be seeing.</>
                  }
                />
                <PreferenceBody>
                  <div className="flex flex-col gap-8">
                    <section>
                      <div className="mt-4 flex flex-col gap-1">
                        <Select
                          name="lang"
                          value={lang}
                          onValueChange={(value) => {
                            onLangChange(value as any);
                          }}
                        >
                          <SelectTrigger>
                            <SelectValue placeholder="None" />
                          </SelectTrigger>
                          <SelectContent>
                            {supported_form_page_languages.map((lang) => (
                              <SelectItem key={lang} value={lang}>
                                {language_label_map[lang]}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <PreferenceDescription>
                          The form page will be displayed in{" "}
                          <span className="font-bold font-mono">
                            {language_label_map[lang]}
                          </span>
                        </PreferenceDescription>
                      </div>
                    </section>
                  </div>
                </PreferenceBody>
              </PreferenceBox>
            </TabsContent>
            <TabsContent value="branding">
              <PreferenceBox>
                <PreferenceBoxHeader
                  heading={<>{`"Powered by Grida" Branding`}</>}
                />
                <PreferenceBody>
                  <div className="flex items-center space-x-2">
                    <Switch
                      id="is_powered_by_branding_enabled"
                      name="is_powered_by_branding_enabled"
                      checked={is_powered_by_branding_enabled}
                      onCheckedChange={onPoweredByBrandingEnabledChange}
                    />
                    <Label htmlFor="is_powered_by_branding_enabled">
                      {is_powered_by_branding_enabled ? "Enabled" : "Disabled"}
                    </Label>
                  </div>
                  {is_powered_by_branding_enabled && (
                    <div className="mt-10 flex items-center justify-center select-none p-4 border rounded-sm">
                      <PoweredByGridaWaterMark />
                    </div>
                  )}
                </PreferenceBody>
              </PreferenceBox>
            </TabsContent>
          </Tabs>
        </div>
        {/* <DialogFooter>
          <DialogClose asChild>
            <Button variant="secondary">Cancel</Button>
          </DialogClose>
          <DialogClose asChild>
            <Button onClick={() => {}}>Save</Button>
          </DialogClose>
        </DialogFooter> */}
      </DialogContent>
    </Dialog>
  );
}
