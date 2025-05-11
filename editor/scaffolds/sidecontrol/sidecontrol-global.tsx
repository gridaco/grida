"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Image from "next/image";
import {
  SidebarMenuSectionContent,
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
import {
  Appearance,
  FontFamily,
  FormStyleSheetV1Schema,
  FormsPageLanguage,
} from "@/types";
import * as _variants from "@/theme/palettes";
import { PaletteColorChip } from "@/components/design/palette-color-chip";
import { sections } from "@/theme/section";
import { Button } from "@/components/ui/button";
import {
  DesktopIcon,
  GearIcon,
  MoonIcon,
  OpenInNewWindowIcon,
  Pencil2Icon,
  SunIcon,
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
import { useTheme } from "next-themes";
import { ThemedMonacoEditor } from "@/components/monaco";
import { customcss_starter_template } from "@/theme/customcss/k";
import { Label } from "@/components/ui/label";
import { cn } from "@/components/lib/utils";
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
import { BrowseStartPageTemplatesDialog } from "../form-templates/startpage-templates-dialog";
import { useDialogState } from "@/components/hooks/use-dialog-state";
import { FormStartPage } from "@/theme/templates/formstart";
import { PropsControl } from "./controls/props";
import {
  useDocument,
  useNode,
  useTemplateDefinition,
} from "@/grida-react-canvas/provider";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

const { default: all, ...variants } = _variants;

export function SideControlGlobal() {
  const [state, dispatch] = useEditorState();

  const { selected_page_id } = state;

  return (
    <>
      <SidebarSection className="border-b pb-4">
        <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>Type</SidebarSectionHeaderLabel>
        </SidebarSectionHeaderItem>
        <FontFamilyControl />
      </SidebarSection>
      <SidebarSection className="border-b pb-4">
        <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>Palette</SidebarSectionHeaderLabel>
        </SidebarSectionHeaderItem>
        <SidebarMenuSectionContent>
          <Palette />
          <div className="h-4" />
          <AppearanceControl />
        </SidebarMenuSectionContent>
      </SidebarSection>
      {selected_page_id === "form/startpage" && <FormStartPageControl />}
      {selected_page_id === "form" && (
        <SidebarSection className="border-b pb-4">
          <SidebarSectionHeaderItem>
            <SidebarSectionHeaderLabel>Background</SidebarSectionHeaderLabel>
          </SidebarSectionHeaderItem>
          <SidebarMenuSectionContent>
            <Background />
          </SidebarMenuSectionContent>
        </SidebarSection>
      )}
      {selected_page_id === "form" && (
        <SidebarSection className="border-b pb-4">
          <SidebarSectionHeaderItem>
            <SidebarSectionHeaderLabel>Section Style</SidebarSectionHeaderLabel>
          </SidebarSectionHeaderItem>
          <SidebarMenuSectionContent>
            <SectionStyle />
          </SidebarMenuSectionContent>
        </SidebarSection>
      )}
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
          <Settings />
        </SidebarMenuSectionContent>
      </SidebarSection>
    </>
  );
}

function FormStartPageControl() {
  const { changeNodeProps } = useDocument();

  // FIXME: 250303 UNKNOWN
  const { props, template_id, properties } = useNode("page");
  const { default: defaultProps } = useTemplateDefinition(template_id!);

  const shallowProps = useMemo(
    () => Object.assign({}, defaultProps, props),
    [defaultProps, props]
  );

  return (
    <>
      <SidebarSection className="border-b pb-4">
        <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>Template</SidebarSectionHeaderLabel>
        </SidebarSectionHeaderItem>
        <SidebarMenuSectionContent>
          <FormStartPageTemplateControl />
        </SidebarMenuSectionContent>
      </SidebarSection>
      <SidebarSection className="border-b pb-4">
        <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>Template Props</SidebarSectionHeaderLabel>
        </SidebarSectionHeaderItem>
        <SidebarMenuSectionContent className="space-y-2">
          <PropsControl
            properties={properties!}
            props={shallowProps}
            onValueChange={(k, v) => {
              changeNodeProps("page", k, v);
            }}
          />
        </SidebarMenuSectionContent>
      </SidebarSection>
    </>
  );
}

function FormStartPageTemplateControl() {
  const [state, dispatch] = useEditorState();

  const switchTemplateDialog = useDialogState("switch-template-dialog");
  const removeConfirmDialog = useDialogState("remove-confirm-dialog");

  const setupStartPage = useCallback(
    (name: string) => {
      // TODO: exclude .component
      const __template = FormStartPage.getTemplate(name);
      dispatch({
        type: "editor/form/startpage/init",
        template: __template,
      });
    },
    [dispatch]
  );

  const removeStartPage = useCallback(() => {
    dispatch({
      type: "editor/form/startpage/remove",
    });
  }, [dispatch]);

  return (
    <>
      <BrowseStartPageTemplatesDialog
        {...switchTemplateDialog.props}
        defaultValue={state.documents["form/startpage"]?.state?.template_id}
        onValueCommit={setupStartPage}
      />
      <AlertDialog {...removeConfirmDialog.props}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Are you sure you want to remove the cover page?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This action is irreversible.
            </AlertDialogDescription>
            <AlertDialogFooter>
              <AlertDialogCancel>Cancel</AlertDialogCancel>
              <AlertDialogAction asChild>
                <Button variant="destructive" onClick={removeStartPage}>
                  Delete
                </Button>
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogHeader>
        </AlertDialogContent>
      </AlertDialog>
      <div className="w-full flex flex-col gap-2">
        <Button onClick={switchTemplateDialog.openDialog}>
          Switch Template
        </Button>
        <Button variant="destructive" onClick={removeConfirmDialog.openDialog}>
          Remove Cover Page
        </Button>
      </div>
    </>
  );
}

function FontFamilyControl() {
  const [state, dispatch] = useEditorState();

  const onFontChange = useCallback(
    (fontFamily: FontFamily) => {
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

function useThemeColorScheme(appearance: Appearance): "light" | "dark" {
  const { systemTheme } = useTheme();

  const safeSystemTheme =
    // system theme is typed light | dark, but it sometimes gives "system"
    (systemTheme as any) === "system" ? "light" : (systemTheme ?? "light");

  const colorscheme: "light" | "dark" =
    (appearance === "system" ? safeSystemTheme : appearance) ?? "light";

  return colorscheme;
}

function Palette() {
  const [state, dispatch] = useEditorState();

  const { appearance, palette } = state.theme;

  const colorscheme = useThemeColorScheme(appearance);

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
                primary={paletteobj[colorscheme]["--primary"]}
                secondary={paletteobj[colorscheme]["--secondary"]}
                background={paletteobj[colorscheme]["--background"]}
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
                const primary = colors[colorscheme]["--primary"];
                const secondary = colors[colorscheme]["--secondary"];
                const background = colors[colorscheme]["--background"];
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

function AppearanceControl() {
  const [state, dispatch] = useEditorState();

  const { theme } = state;
  const { appearance } = theme;

  const onAppearanceChange = useCallback(
    (appearance: Appearance) => {
      dispatch({
        type: "editor/theme/appearance",
        appearance,
      });
    },
    [dispatch]
  );

  return (
    <Select
      value={appearance}
      onValueChange={(v) => {
        onAppearanceChange(v as Appearance);
      }}
    >
      <SelectTrigger>
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={"light"}>
          <SunIcon className="inline-flex me-2 align-middle" />
          Light
        </SelectItem>
        <SelectItem value={"dark"}>
          <MoonIcon className="inline-flex me-2 align-middle" />
          Dark
        </SelectItem>
        <SelectItem value={"system"}>
          <DesktopIcon className="inline-flex me-2 align-middle" />
          System
        </SelectItem>
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
          <SelectItem value="none">None</SelectItem>
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
          <SelectValue placeholder="None" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="visible">None</SelectItem>
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
          <ThemedMonacoEditor
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

function Settings() {
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
          <DialogTitle>Page Settings</DialogTitle>
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
                  <div className="flex items-center gap-2">
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
                    <div className="mt-10 flex items-center justify-center select-none p-4 border rounded-xs">
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
