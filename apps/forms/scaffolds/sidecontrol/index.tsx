"use client";

import React, { useCallback, useState } from "react";
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
            <SelectItem value={section.css}>{section.name}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    </>
  );
}
