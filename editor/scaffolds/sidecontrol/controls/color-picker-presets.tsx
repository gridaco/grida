import React from "react";
import kolor from "@grida/color";
import tailwindColorsRGBA from "@grida/tailwindcss-colors/json/rgba.json";
import { css } from "@/grida-canvas-utils/css";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { ScrollArea, ScrollBar } from "@/components/ui/scroll-area";
import {
  NativeSelect,
  NativeSelectOption,
} from "@/components/ui-editor/native-select";
import { Separator } from "@/components/ui/separator";

/**
 * the visual correct order as displayed from https://tailwindcss.com/docs/colors
 * use this order for ui display order
 */
const tailwindcss_colors_visual_order = [
  "red",
  "orange",
  "amber",
  "yellow",
  "lime",
  "green",
  "emerald",
  "teal",
  "cyan",
  "sky",
  "blue",
  "indigo",
  "violet",
  "purple",
  "fuchsia",
  "pink",
  "rose",
  "slate",
  "gray",
  "zinc",
  "neutral",
  "stone",
] as const;

type RGBA32F = kolor.colorformats.RGBA32F;

type ColorCategory = "tailwind" | "css-named";

const colorCategories: Array<{ value: ColorCategory; label: string }> = [
  { value: "tailwind", label: "Standard" },
  { value: "css-named", label: "CSS Colors" },
];

function ColorChip({
  color,
  label,
  onColorChange,
  centered = false,
}: {
  color: RGBA32F;
  label: string;
  onColorChange?: (color: RGBA32F) => void;
  centered?: boolean;
}) {
  const cssColor = kolor.colorformats.RGBA32F.intoCSSRGBA(color);
  return (
    <Tooltip disableHoverableContent>
      <TooltipTrigger asChild>
        <button
          className={`size-4 rounded-xs border border-border/50 cursor-pointer ${
            centered ? "block mx-auto" : ""
          }`}
          style={{ background: cssColor }}
          onClick={() => onColorChange?.(color)}
          aria-label={label}
        />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}

function parseNamedColorToRGBA32F(name: string): RGBA32F {
  const lowerName = name.toLowerCase();
  const rgb =
    lowerName in css.namedcolors
      ? (css.namedcolors as Record<string, [number, number, number]>)[lowerName]
      : undefined;
  if (rgb) {
    const [r, g, b] = rgb;
    return kolor.colorformats.newRGBA32F(r / 255, g / 255, b / 255, 1);
  }
  return kolor.colorformats.RGBA32F.BLACK;
}

/**
 * CSS standard named colors - commonly used CSS named colors
 * @see https://www.w3.org/TR/css-color-4/#named-colors
 */
const css_standard_named_colors: Record<string, RGBA32F> = Object.fromEntries(
  [
    ["red", kolor.names.red],
    ["green", kolor.names.green],
    ["blue", kolor.names.blue],
    ["yellow", kolor.names.yellow],
    ["orange", kolor.names.orange],
    ["purple", kolor.names.purple],
    ["pink", kolor.names.pink],
    ["cyan", kolor.names.cyan],
    ["magenta", kolor.names.magenta],
    ["black", kolor.names.black],
    ["white", kolor.names.white],
    ["gray", kolor.names.gray],
    ["silver", kolor.names.silver],
    ["brown", kolor.names.brown],
    ["olive", kolor.names.olive],
    ["navy", kolor.names.navy],
    ["teal", kolor.names.teal],
    ["maroon", kolor.names.maroon],
    ["gold", kolor.names.gold],
    ["indigo", kolor.names.indigo],
  ].map(([name, rgb]) => {
    const [r, g, b] = rgb as [number, number, number];
    return [name, kolor.colorformats.newRGBA32F(r / 255, g / 255, b / 255, 1)];
  })
);

function ColorPickerPresetsTailwindCSSColors({
  onColorChange,
}: {
  onColorChange?: (color: RGBA32F) => void;
}) {
  // Shade order for table columns
  const shadeOrder = [
    "50",
    "100",
    "200",
    "300",
    "400",
    "500",
    "600",
    "700",
    "800",
    "900",
    "950",
  ] as const;

  // Generate Tailwind color table data in visual order
  const tailwindTableData = React.useMemo(() => {
    const tableData: Array<{
      colorName: string;
      shades: Record<string, { id: string; label: string; color: RGBA32F }>;
    }> = [];

    // Order colors according to visual order
    const orderedColorNames = tailwindcss_colors_visual_order.filter(
      (name) => name in tailwindColorsRGBA
    );

    orderedColorNames.forEach((colorName) => {
      const shades =
        tailwindColorsRGBA[colorName as keyof typeof tailwindColorsRGBA];
      const shadeMap: Record<
        string,
        { id: string; label: string; color: RGBA32F }
      > = {};

      // Process each shade
      Object.entries(shades).forEach(([shade, rgba]) => {
        // rgba.json has RGB as integers (0-255) and alpha as float (0-1)
        // Convert RGB to RGBA32F format (0-1 range)
        const [rInt, gInt, bInt, a] = rgba as [number, number, number, number];
        const r = rInt / 255;
        const g = gInt / 255;
        const b = bInt / 255;
        shadeMap[shade] = {
          id: `tailwind-${colorName}-${shade}`,
          label: `${colorName}-${shade}`,
          color: kolor.colorformats.newRGBA32F(r, g, b, a),
        };
      });

      tableData.push({
        colorName,
        shades: shadeMap,
      });
    });

    return tableData;
  }, []);

  return (
    <table className="border-collapse min-w-full">
      <thead className="sticky top-0 bg-background z-20">
        <tr>
          <th className="text-left text-[10px] text-muted-foreground font-normal pr-2 py-1 sticky left-0 bg-background z-30">
            {/* Empty cell for color name column */}
          </th>
          {shadeOrder.map((shade) => (
            <th
              key={shade}
              className="text-[8px] text-muted-foreground font-normal pb-1 text-center bg-background"
            >
              {shade}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {tailwindTableData.map((row) => (
          <tr key={row.colorName}>
            <td className="text-[10px] text-muted-foreground font-normal pr-2 py-0.5 sticky left-0 bg-background z-10 whitespace-nowrap">
              {row.colorName}
            </td>
            {shadeOrder.map((shade) => {
              const preset = row.shades[shade];
              if (!preset) return <td key={shade} className="py-0.5" />;
              return (
                <td key={shade} className="py-0.5 px-0.5">
                  <ColorChip
                    color={preset.color}
                    label={preset.label}
                    onColorChange={onColorChange}
                    centered
                  />
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function ColorPickerPresetsCSSNamedColors({
  onColorChange,
}: {
  onColorChange?: (color: RGBA32F) => void;
}) {
  // Generate CSS standard named color presets
  const cssStandardNamedPresets = React.useMemo(() => {
    return Object.entries(css_standard_named_colors).map(([name, color]) => ({
      id: `css-standard-${name}`,
      label: name,
      color: color as RGBA32F,
    }));
  }, []);

  // Generate other CSS named color presets
  const otherCssNamedPresets = React.useMemo(() => {
    const presets: Array<{ id: string; label: string; color: RGBA32F }> = [];

    Object.keys(css.namedcolors).forEach((name) => {
      // Include all colors (duplicates are okay as requested)
      presets.push({
        id: `css-${name}`,
        label: name,
        color: parseNamedColorToRGBA32F(name),
      });
    });

    return presets;
  }, []);

  return (
    <div className="space-y-2">
      {/* CSS Standard Named Colors: Grid */}
      <div className="grid grid-cols-10 gap-1.5">
        {cssStandardNamedPresets.map((preset) => (
          <ColorChip
            key={preset.id}
            color={preset.color}
            label={preset.label}
            onColorChange={onColorChange}
          />
        ))}
      </div>

      {/* Divider */}
      <Separator className="my-2" />

      {/* Other CSS Named Colors: Grid */}
      <div className="grid grid-cols-10 gap-1.5">
        {otherCssNamedPresets.map((preset) => (
          <ColorChip
            key={preset.id}
            color={preset.color}
            label={preset.label}
            onColorChange={onColorChange}
          />
        ))}
      </div>
    </div>
  );
}

export function ColorPickerPresets({
  onColorChange,
}: {
  onColorChange?: (color: RGBA32F) => void;
}) {
  const [selectedCategory, setSelectedCategory] =
    React.useState<ColorCategory>("tailwind");

  return (
    <div className="space-y-3">
      {/* Category Selector */}
      <NativeSelect
        value={selectedCategory}
        onChange={(e) => setSelectedCategory(e.target.value as ColorCategory)}
        size="xs"
        className="w-full mx-2"
      >
        {colorCategories.map((cat) => (
          <NativeSelectOption key={cat.value} value={cat.value}>
            {cat.label}
          </NativeSelectOption>
        ))}
      </NativeSelect>

      {/* Color Grid */}
      <div className="h-48 overflow-hidden rounded-md">
        <ScrollArea className="h-full px-2">
          <div className="pb-2">
            {selectedCategory === "tailwind" ? (
              <ColorPickerPresetsTailwindCSSColors
                onColorChange={onColorChange}
              />
            ) : (
              <ColorPickerPresetsCSSNamedColors onColorChange={onColorChange} />
            )}
          </div>
          <ScrollBar orientation="horizontal" />
        </ScrollArea>
      </div>
    </div>
  );
}
