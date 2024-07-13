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
import { TemplateComponents } from "@/theme/templates/components";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { TextAlignControl } from "./controls/text-align";
import { FontSizeControl } from "./controls/font-size";
import { FontWeightControl } from "./controls/font-weight";
import { HiddenControl } from "./controls/hidden";
import { OpacityControl } from "./controls/opacity";
import { HrefControl } from "./controls/href";

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
  } = properties || {};

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
  const changefontSize = (value: number) => changeproperty("fontSize", value);
  const changetextAlign = (value: string) => changeproperty("textAlign", value);

  return (
    <div key={selected_node_id}>
      <SidebarSection className="border-b pb-4">
        <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>Debug</SidebarSectionHeaderLabel>
        </SidebarSectionHeaderItem>
        <SidebarMenuSectionContent>
          <div>Node {state.document.selected_node_id}</div>
        </SidebarMenuSectionContent>
      </SidebarSection>
      <SidebarSection className="border-b pb-4">
        <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>Link</SidebarSectionHeaderLabel>
        </SidebarSectionHeaderItem>
        <SidebarMenuSectionContent>
          <HrefControl />
        </SidebarMenuSectionContent>
      </SidebarSection>
      <SidebarSection hidden={!istemplate} className="border-b pb-4">
        <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>Template</SidebarSectionHeaderLabel>
        </SidebarSectionHeaderItem>
        <SidebarMenuSectionContent>
          <Select value={template_id} onValueChange={changetemplate}>
            <SelectTrigger>
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
      <SidebarSection className="border-b pb-4">
        <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>Layer</SidebarSectionHeaderLabel>
        </SidebarSectionHeaderItem>
        <SidebarMenuSectionContent className="space-y-4">
          <div className="grid gap-2">
            <Label>Hidden</Label>
            <HiddenControl value={hidden} onValueChange={changehidden} />
          </div>
          <div className="grid gap-2">
            <Label>Opacity</Label>
            <OpacityControl value={opacity} onValueChange={changeopacity} />
          </div>
        </SidebarMenuSectionContent>
      </SidebarSection>
      <SidebarSection hidden={!istext} className="border-b pb-4">
        <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>Text</SidebarSectionHeaderLabel>
        </SidebarSectionHeaderItem>
        <SidebarMenuSectionContent className="space-y-4">
          <div className="grid gap-2">
            <Label className="text-xs">Value</Label>
            <Input value={text} onChange={(e) => changetext(e.target.value)} />
          </div>
          <div className="grid gap-2">
            <Label className="text-xs">Weight</Label>
            <FontWeightControl
              value={fontWeight}
              onValueChange={changefontWeight}
            />
          </div>
          <div className="grid gap-2">
            <Label className="text-xs">Size</Label>
            <FontSizeControl value={fontSize} onValueChange={changefontSize} />
          </div>
          <div className="grid gap-2">
            <Label className="text-xs">Align</Label>
            <TextAlignControl
              value={textAlign}
              onValueChange={changetextAlign}
            />
          </div>
        </SidebarMenuSectionContent>
      </SidebarSection>
      {istemplate &&
        propertyNames.map((key) => {
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
            <div key={key}>
              <SidebarSection className="border-b pb-4">
                <SidebarSectionHeaderItem>
                  <SidebarSectionHeaderLabel>{key}</SidebarSectionHeaderLabel>
                </SidebarSectionHeaderItem>
                <SidebarMenuSectionContent>
                  <Input
                    placeholder={key}
                    value={value}
                    onChange={(e) => {
                      onValueChange(e.target.value || undefined);
                    }}
                  />
                </SidebarMenuSectionContent>
              </SidebarSection>
            </div>
          );
        })}
    </div>
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
