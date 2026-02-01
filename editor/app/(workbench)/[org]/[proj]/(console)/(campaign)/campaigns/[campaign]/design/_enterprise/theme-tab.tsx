"use client";

import type React from "react";
import Link from "next/link";
import { cn } from "@/components/lib/utils";
import { OpenInNewWindowIcon } from "@radix-ui/react-icons";
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldGroup,
  FieldLabel,
  FieldSeparator,
} from "@/components/ui/field";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PaletteColorChip } from "@/components/design/palette-color-chip";
import { NavbarLogoEditor } from "@/scaffolds/www-theme-config/components/navbar-logo";
import type palettes from "@/theme/palettes";
import * as _palettes from "@/theme/palettes";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Slider } from "@/components/ui/slider";

type ProjectLinkTarget = {
  organization_name: string;
  name: string;
};

const { default: allPalettes, ...paletteVariants } = _palettes;
type PaletteTheme = (typeof allPalettes)[keyof typeof allPalettes];
type PaletteGroups = Record<string, Record<string, PaletteTheme>>;
const paletteGroups = paletteVariants as unknown as PaletteGroups;

type CampaignThemeConfig = {
  palette?: keyof typeof palettes;
  radius?: string;
};

function parseRadiusToPx(value?: string): number | null {
  if (!value) return null;
  const v = value.trim();
  if (v.length === 0) return null;
  if (v.endsWith("px")) {
    const n = Number.parseFloat(v.slice(0, -2));
    return Number.isFinite(n) ? n : null;
  }
  if (v.endsWith("rem")) {
    const n = Number.parseFloat(v.slice(0, -3));
    return Number.isFinite(n) ? n * 16 : null;
  }
  const n = Number.parseFloat(v);
  return Number.isFinite(n) ? n : null;
}

function EnableToggle({
  checked,
  onCheckedChange,
  label = "Enable custom campaign theme",
  description = "Customize the color theme and roundness.",
  className,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label?: string;
  description?: string;
  className?: string;
}) {
  return (
    <Field orientation="horizontal" className={className}>
      <Checkbox
        checked={checked}
        onCheckedChange={(v) => onCheckedChange(!!v)}
      />
      <FieldContent>
        <FieldLabel>{label}</FieldLabel>
        <FieldDescription>{description}</FieldDescription>
      </FieldContent>
    </Field>
  );
}

function RadiusControl({
  value,
  disabled,
  onValueChange,
  className,
  inputClassName,
  sliderClassName,
  min = 0,
  max = 24,
  step = 1,
}: {
  value: string;
  disabled?: boolean;
  onValueChange: (value: string) => void;
  className?: string;
  inputClassName?: string;
  sliderClassName?: string;
  min?: number;
  max?: number;
  step?: number;
}) {
  const radiusPx = parseRadiusToPx(value) ?? 8;

  return (
    <Field className={className}>
      <div className="flex items-end justify-between gap-2">
        <div className="grid gap-1">
          <FieldLabel>Roundness</FieldLabel>
          <FieldDescription>
            Controls corner roundness across the page.
          </FieldDescription>
        </div>
        <div className="w-28">
          <Input
            disabled={disabled}
            value={value}
            className={inputClassName}
            onChange={(e) => onValueChange(e.target.value)}
            placeholder="8px"
          />
        </div>
      </div>
      <Slider
        disabled={disabled}
        min={min}
        max={max}
        step={step}
        className={sliderClassName}
        value={[Math.round(radiusPx)]}
        onValueChange={([v]) => {
          onValueChange(`${v}px`);
        }}
      />
    </Field>
  );
}

function CampaignThemeStylesEditor({
  styles,
  onStylesChange,
  className,
  title = "Styles",
  description = "Customize colors and roundness for this campaign. This won’t affect others.",
  maxWidthClassName = "max-w-3xl",
}: {
  styles?: CampaignThemeConfig | null;
  onStylesChange: (styles: CampaignThemeConfig | undefined) => void;
  className?: string;
  title?: string;
  description?: string;
  /**
   * Limit width of theme editor only (does not affect other sections).
   */
  maxWidthClassName?: string;
}) {
  const defaultPalette = "neutral" satisfies CampaignThemeConfig["palette"];
  const enabled = !!styles?.palette;
  const palette = styles?.palette ?? defaultPalette;

  const paletteobj = palette ? allPalettes[palette] : undefined;
  const defaultRadius = paletteobj?.light["--radius"] ?? "0.5rem";
  const radius = styles?.radius ?? defaultRadius;

  return (
    <div className={cn("mt-10", maxWidthClassName, className)}>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        {/* Left column with label and info */}
        <div className="space-y-2">
          <h2 className="text-xl font-semibold">{title}</h2>
          <p className="text-sm text-muted-foreground">{description}</p>
        </div>

        {/* Right column with controls */}
        <FieldGroup className="md:col-span-2 flex flex-col gap-8">
          <EnableToggle
            checked={enabled}
            onCheckedChange={(v) => {
              if (!v) {
                onStylesChange(undefined);
                return;
              }
              onStylesChange({
                palette: palette ?? defaultPalette,
                radius: styles?.radius,
              });
            }}
          />

          <Field>
            <FieldLabel>Palette</FieldLabel>
            <Select
              value={palette ?? ""}
              disabled={!enabled}
              onValueChange={(v) => {
                const next =
                  v && v in allPalettes
                    ? (v as CampaignThemeConfig["palette"])
                    : undefined;
                onStylesChange({
                  palette: next,
                  radius: styles?.radius,
                });
              }}
            >
              <SelectTrigger
                className={cn("w-full", paletteobj && "!h-16 px-2 py-2")}
              >
                <SelectValue>
                  {paletteobj && palette ? (
                    <div className="flex items-center gap-2">
                      <PaletteColorChip
                        primary={paletteobj.light["--primary"]}
                        secondary={paletteobj.light["--secondary"]}
                        background={paletteobj.light["--background"]}
                        className="min-w-12 size-12 rounded-sm border"
                      />
                      <span className="text-xs text-muted-foreground text-ellipsis overflow-hidden">
                        {palette}
                      </span>
                    </div>
                  ) : (
                    <>Select palette</>
                  )}
                </SelectValue>
              </SelectTrigger>
              <SelectContent>
                {Object.keys(paletteGroups).map((variant) => {
                  const group = paletteGroups[variant];
                  return (
                    <SelectGroup key={variant} className="flex flex-col gap-2">
                      <SelectLabel>{variant}</SelectLabel>
                      {Object.keys(group).map((key) => {
                        const colors = group[key];
                        return (
                          <SelectItem key={key} value={key}>
                            <div className="flex gap-2 items-center">
                              <PaletteColorChip
                                primary={colors.light["--primary"]}
                                secondary={colors.light["--secondary"]}
                                background={colors.light["--background"]}
                                onSelect={() => {
                                  onStylesChange({
                                    palette:
                                      key as CampaignThemeConfig["palette"],
                                    radius: styles?.radius,
                                  });
                                }}
                                selected={key === palette}
                                className="size-10 rounded-sm"
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
          </Field>

          <RadiusControl
            value={radius}
            disabled={!enabled}
            onValueChange={(v) => {
              onStylesChange({
                palette,
                radius: v,
              });
            }}
          />
        </FieldGroup>
      </div>
    </div>
  );
}

export function EnterpriseCampaignThemeTab({
  project,
  logo,
  uploader,
  styles,
  locale,
  onLogoChange,
  onStylesChange,
  onLocaleChange,
}: {
  project: ProjectLinkTarget;
  logo?: React.ComponentProps<typeof NavbarLogoEditor>["logo"];
  uploader: React.ComponentProps<typeof NavbarLogoEditor>["uploader"];
  styles?: CampaignThemeConfig | null;
  locale?: string | null;
  onLogoChange: NonNullable<
    React.ComponentProps<typeof NavbarLogoEditor>["onLogoChange"]
  >;
  onStylesChange: (styles: CampaignThemeConfig | undefined) => void;
  onLocaleChange: (locale: string) => void;
}) {
  return (
    <>
      <div className="grid gap-2">
        <NavbarLogoEditor
          logo={logo}
          uploader={uploader}
          onLogoChange={onLogoChange}
        />
      </div>

      <FieldSeparator className="my-6" />

      <CampaignThemeStylesEditor
        styles={styles}
        onStylesChange={onStylesChange}
      />

      <FieldSeparator className="my-6" />

      <Field>
        <FieldLabel>Locale</FieldLabel>
        <Select value={locale ?? undefined} onValueChange={onLocaleChange}>
          <SelectTrigger>
            <SelectValue placeholder="Select Locale" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ko">Korean</SelectItem>
            <SelectItem value="en">English</SelectItem>
          </SelectContent>
        </Select>
      </Field>

      <FieldSeparator className="my-6" />

      <div>
        <div className="font-medium">General Site Settings</div>
        <div className="mt-2">
          You can{" "}
          <Link
            href={`/${project.organization_name}/${project.name}/www`}
            target="_blank"
            className="underline inline-flex items-center gap-1"
          >
            manage site settings here <OpenInNewWindowIcon />
          </Link>
        </div>
      </div>
    </>
  );
}
