import { saveAs } from "file-saver";
import { Button } from "@/components/ui-editor/button";
import { toast } from "sonner";
import React from "react";
import { io } from "@grida/io";
import { Input } from "@/components/ui/input";
import InputPropertyNumber from "../ui/number";
import { WorkbenchUI } from "@/components/workbench";
import { cn } from "@/components/lib/utils";
import { Spinner } from "@/components/ui/spinner";
import {
  Select,
  SelectContent,
  SelectItem,
} from "@/components/ui-editor/select";
import * as SelectPrimitive from "@radix-ui/react-select";
import { useCurrentEditor, useNodeMetadata } from "@/grida-canvas-react";
import { editor as editorTypes } from "@/grida-canvas";
import {
  PlusIcon,
  MinusIcon,
  DotsVerticalIcon,
  ChevronDownIcon,
} from "@radix-ui/react-icons";
import type grida from "@grida/schema";
import {
  PropertySection,
  PropertySectionContent,
  PropertySectionHeaderItem,
  PropertySectionHeaderLabel,
  PropertySectionHeaderActions,
  PropertyRows,
  PropertyRow,
  PropertyEnum,
} from "../ui";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Field, FieldGroup, FieldLabel } from "@/components/ui/field";

/**
 * Available scale presets for auto-assignment when adding new export configs
 */
const AUTO_SCALE_PRESETS = [1, 2, 3] as const;

/**
 * Generates auto suffix for a given scale (e.g., "@2x" for scale 2).
 * Returns undefined for scale 1 (no suffix needed).
 */
function getAutoSuffix(scale: number): string | undefined {
  if (scale === 1) {
    return undefined;
  }
  return `@${scale}x`;
}

/**
 * Checks if a suffix matches the auto-generated pattern for a given scale.
 * This is used to determine if the suffix should be updated when scale changes.
 */
function isAutoSuffix(suffix: string | undefined, scale: number): boolean {
  if (!suffix) {
    return scale === 1;
  }
  return suffix === getAutoSuffix(scale);
}

/**
 * Helper to convert NodeExportSettings to ExportConfigOf
 * Used by export handlers to transform stored metadata into runtime export config
 */
function buildExportConfig(
  settings: grida.program.document.NodeExportSettings
): editorTypes.api.ExportConfigOf<
  grida.program.document.NodeExportSettings["format"]
> {
  const format = settings.format;

  // Vector formats (PDF, SVG) - no constraints
  if (format === "PDF" || format === "SVG") {
    return { format } as editorTypes.api.ExportConfigOf<typeof format>;
  }

  // Image formats - require constraints
  const imageSettings =
    settings as grida.program.document.NodeExportSettings_Image;
  const constraints =
    imageSettings.constraints &&
    (imageSettings.constraints.type === "scale" ||
      imageSettings.constraints.type === "scale-to-fit-width" ||
      imageSettings.constraints.type === "scale-to-fit-height")
      ? {
          type: imageSettings.constraints.type,
          value: imageSettings.constraints.value,
        }
      : { type: "scale" as const, value: 1 };

  if (format === "PNG" || format === "BMP") {
    return {
      format,
      constraints,
    } as editorTypes.api.ExportConfigOf<typeof format>;
  }

  // JPEG and WEBP support quality
  return {
    format,
    constraints,
    quality: imageSettings.quality,
  } as editorTypes.api.ExportConfigOf<typeof format>;
}

/**
 * Finds the next available scale from presets [1, 2, 3] that isn't already in use.
 * If all presets are used, cycles back to 1.
 */
function getNextAvailableScale(
  existingConfigs: grida.program.document.NodeExportSettings[]
): number {
  // Extract scales from existing configs
  const usedScales = new Set<number>();
  for (const config of existingConfigs) {
    // Only image configs have constraints
    if (
      config.format === "PNG" ||
      config.format === "JPEG" ||
      config.format === "WEBP" ||
      config.format === "BMP"
    ) {
      if (
        config.constraints?.type === "scale" &&
        config.constraints.value !== undefined
      ) {
        usedScales.add(config.constraints.value);
      }
    }
  }

  // Find first unused scale from presets
  for (const preset of AUTO_SCALE_PRESETS) {
    if (!usedScales.has(preset)) {
      return preset;
    }
  }

  // All presets are used, cycle back to first
  return AUTO_SCALE_PRESETS[0];
}

export function ExportSection({
  node_id,
  name,
}: {
  node_id: string;
  name: string;
}) {
  const editor = useCurrentEditor();

  // Subscribe to export_settings from metadata
  const nodeMetadata = useNodeMetadata(node_id, "export_settings");

  // Get export configs - this will update when metadata changes
  const exportConfigs = React.useMemo(() => {
    return editor.getExportConfigs(node_id);
  }, [editor, node_id, nodeMetadata]);

  const hasConfigs = exportConfigs.length > 0;

  const onAddConfig = () => {
    const nextScale = getNextAvailableScale(exportConfigs);
    const autoSuffix = getAutoSuffix(nextScale);
    const newConfig: grida.program.document.NodeExportSettings_Image = {
      format: "PNG",
      constraints: { type: "scale", value: nextScale },
      ...(autoSuffix !== undefined && { suffix: autoSuffix }),
    };
    editor.addExportConfig(node_id, newConfig);
  };

  return (
    <PropertySection
      data-empty={!hasConfigs}
      className="border-b [&[data-empty='true']]:pb-0"
    >
      <PropertySectionHeaderItem onClick={onAddConfig}>
        <PropertySectionHeaderLabel>Export</PropertySectionHeaderLabel>
        <PropertySectionHeaderActions>
          <Button variant="ghost" size="icon">
            <PlusIcon className="size-3" />
          </Button>
        </PropertySectionHeaderActions>
      </PropertySectionHeaderItem>
      {hasConfigs && (
        <PropertySectionContent>
          <ExportNodeControl node_id={node_id} name={name} />
        </PropertySectionContent>
      )}
    </PropertySection>
  );
}

function ExportNodeControl({
  node_id,
  name,
  disabled,
}: {
  node_id: string;
  name: string;
  disabled?: boolean;
}) {
  const editor = useCurrentEditor();
  const [isExporting, setIsExporting] = React.useState(false);

  // Subscribe to export_settings from metadata
  const nodeMetadata = useNodeMetadata(node_id, "export_settings");

  // Get export configs - this will update when metadata changes
  const exportConfigs = React.useMemo(() => {
    return editor.getExportConfigs(node_id);
  }, [editor, node_id, nodeMetadata]);

  const onExportAll = async () => {
    // Show spinner immediately
    setIsExporting(true);

    // Small delay to show spinner before starting expensive export
    await new Promise((resolve) => setTimeout(resolve, 50));

    try {
      if (exportConfigs.length === 1) {
        // Single file: download as-is
        const config = exportConfigs[0];
        if (!config?.format) return;

        const format = config.format;
        if (
          !editorTypes.internal.export_settings.ALL_FORMATS.includes(format)
        ) {
          return;
        }

        // Build export config from stored settings
        const exportConfig = buildExportConfig(config);
        const editorApi: editorTypes.api.IDocumentExportPluginActions = editor;
        const data = await editorApi.exportNodeAs(
          node_id,
          format,
          exportConfig
        );

        const blob = new Blob(
          [typeof data === "string" ? data : (data as BlobPart)],
          { type: editorTypes.internal.export_settings.getMimeType(format) }
        );
        const suffix = config.suffix ? `-${config.suffix}` : "";
        saveAs(
          blob,
          `${name}${suffix}.${editorTypes.internal.export_settings.getFileExtension(format)}`
        );
        return;
      }

      // Multiple files: create zip
      const files: Record<string, Uint8Array> = {};

      const tasks = exportConfigs.map(async (config, index) => {
        if (!config?.format) return null;

        const format = config.format;
        if (
          !editorTypes.internal.export_settings.ALL_FORMATS.includes(format)
        ) {
          return null;
        }

        // Build export config from stored settings
        const exportConfig = buildExportConfig(config);
        const editorApi: editorTypes.api.IDocumentExportPluginActions = editor;
        const data = await editorApi.exportNodeAs(
          node_id,
          format,
          exportConfig
        );

        const suffix = config.suffix ? `-${config.suffix}` : "";
        const filename = `${name}${suffix}.${editorTypes.internal.export_settings.getFileExtension(format)}`;

        // Convert to Uint8Array for zip
        const bytes = io.zip.ensureUint8Array(data);

        files[filename] = bytes;
        return { filename, data };
      });

      await toast.promise(
        Promise.all(tasks).then(() => {
          // Create zip file
          const zipData = io.zip.create(files);
          const zipBlob = new Blob([zipData as BlobPart], {
            type: "application/zip",
          });
          saveAs(zipBlob, `${name}.zip`);
        }),
        {
          loading: `Exporting ${exportConfigs.length} file(s)...`,
          success: `Exported ${exportConfigs.length} file(s) as ZIP`,
          error: "Failed to export some files",
        }
      );
    } finally {
      setIsExporting(false);
    }
  };

  const onRemoveConfig = (index: number) => {
    editor.removeExportConfig(node_id, index);
  };

  const onUpdateConfig = (
    index: number,
    updates: Partial<grida.program.document.NodeExportSettings>
  ) => {
    const current = exportConfigs[index];
    if (!current) return;

    editor.updateExportConfig(node_id, index, {
      ...current,
      ...updates,
    });
  };

  return (
    <>
      <PropertyRows>
        {exportConfigs.map((config, index) => (
          <ExportConfigRow
            key={index}
            config={config}
            onRemove={() => onRemoveConfig(index)}
            onUpdate={(updates) => onUpdateConfig(index, updates)}
            disabled={disabled}
          />
        ))}
      </PropertyRows>
      {exportConfigs.length >= 1 && (
        <PropertyRow>
          <Button
            variant="outline"
            size="xs"
            className="w-full overflow-hidden font-normal"
            onClick={onExportAll}
            disabled={disabled || isExporting}
          >
            {isExporting ? (
              <>
                <Spinner className="size-3 mr-2 flex-shrink-0" />
                <span className="truncate">Exporting...</span>
              </>
            ) : (
              <span className="truncate">
                Export <span className="font-mono">{name}</span>
              </span>
            )}
          </Button>
        </PropertyRow>
      )}
    </>
  );
}

function ExportConfigRow({
  config,
  onRemove,
  onUpdate,
  disabled,
}: {
  config: grida.program.document.NodeExportSettings;
  onRemove: () => void;
  onUpdate: (
    updates: Partial<grida.program.document.NodeExportSettings>
  ) => void;
  disabled?: boolean;
}) {
  const format: editorTypes.internal.export_settings.Format = (config.format ||
    "PNG") as editorTypes.internal.export_settings.Format;

  // Extract scale value - only image configs have constraints
  const scaleValue =
    (config.format === "PNG" ||
      config.format === "JPEG" ||
      config.format === "WEBP" ||
      config.format === "BMP") &&
    (config as grida.program.document.NodeExportSettings_Image).constraints
      ?.type === "scale"
      ? (config as grida.program.document.NodeExportSettings_Image).constraints!
          .value
      : 1;

  // Scale is not supported for vector formats (SVG) and PDF
  const scaleSupported =
    editorTypes.internal.export_settings.supportsScale(format);

  const handleFormatChange = (newFormat: string) => {
    const validFormat = editorTypes.internal.export_settings.ALL_FORMATS.find(
      (f) => f === newFormat
    );
    if (validFormat) {
      onUpdate({ format: validFormat });
    }
  };

  const handleScaleChange = (newScale: string) => {
    const oldScale = scaleValue;
    const scale = parseFloat(newScale) || 1;

    // If suffix matches the auto pattern for old scale, update it for new scale
    const currentSuffix = config.suffix;
    const shouldUpdateSuffix = isAutoSuffix(currentSuffix, oldScale);

    // Only image configs can have constraints
    if (
      config.format === "PNG" ||
      config.format === "JPEG" ||
      config.format === "WEBP" ||
      config.format === "BMP"
    ) {
      const updates: {
        constraints: { type: "scale"; value: number };
        suffix?: string;
      } = {
        constraints: { type: "scale", value: scale },
      };

      if (shouldUpdateSuffix) {
        const newSuffix = getAutoSuffix(scale);
        if (newSuffix !== undefined) {
          updates.suffix = newSuffix;
        }
        // If scale is 1, we omit suffix (don't set it to undefined)
      }

      onUpdate(updates as Partial<grida.program.document.NodeExportSettings>);
    }
  };

  const scalePresets = [0.5, 0.75, 1, 1.5, 2, 3, 4];
  const hasPreset = scalePresets.includes(scaleValue);
  const isDisabled = disabled || !scaleSupported;

  return (
    <Popover modal={false}>
      <PropertyRow>
        <div className="flex items-center w-full gap-2">
          <div
            aria-disabled={isDisabled}
            className={cn(
              "relative w-20",
              "aria-disabled:opacity-50 aria-disabled:pointer-events-none"
            )}
          >
            <InputPropertyNumber
              mode="fixed"
              disabled={isDisabled}
              type="number"
              value={scaleValue}
              placeholder="1"
              suffix="x"
              min={0.1}
              max={10}
              step={0.05}
              className={cn(
                WorkbenchUI.inputVariants({ size: "xs" }),
                "overflow-hidden",
                "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
              )}
              onValueCommit={(v) => {
                if (v !== undefined) {
                  handleScaleChange(v.toString());
                }
              }}
              aria-label="Export scale"
            />
            <div className="absolute right-0 top-0 bottom-0 z-10 flex items-center justify-center border-l">
              <Select
                value={hasPreset ? scaleValue.toString() + "x" : undefined}
                onValueChange={(v) => {
                  const scale = parseFloat(v.replace("x", "")) || 1;
                  handleScaleChange(scale.toString());
                }}
                disabled={isDisabled}
              >
                <SelectPrimitive.SelectTrigger asChild>
                  <button className="w-full text-muted-foreground flex items-center justify-center size-6 p-1 opacity-50">
                    <ChevronDownIcon />
                  </button>
                </SelectPrimitive.SelectTrigger>
                <SelectContent align="end">
                  {scalePresets.map((preset) => (
                    <SelectItem key={preset} value={preset.toString() + "x"}>
                      {preset}x
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <PropertyEnum
            value={format}
            onValueChange={handleFormatChange}
            disabled={disabled}
            // BMP is not supported for export yet.
            enum={editorTypes.internal.export_settings.ALL_FORMATS.filter(
              (f) => f !== "BMP"
            )}
            className="flex-1"
          />
          <PopoverTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="size-4 p-0"
              disabled={disabled}
            >
              <DotsVerticalIcon className="size-3" />
            </Button>
          </PopoverTrigger>
          <Button
            variant="ghost"
            size="icon"
            onPointerDown={(event) => {
              event.stopPropagation();
            }}
            onClick={(event) => {
              event.stopPropagation();
              onRemove();
            }}
            className="cursor-pointer size-4 p-0"
            tabIndex={-1}
            disabled={disabled}
          >
            <MinusIcon className="size-3.5" />
          </Button>
        </div>
        <ExportConfigPopoverContent
          config={config}
          onUpdate={onUpdate}
          disabled={disabled}
        />
      </PropertyRow>
    </Popover>
  );
}

function ExportConfigPopoverContent({
  config,
  onUpdate,
  disabled,
}: {
  config: grida.program.document.NodeExportSettings;
  onUpdate: (
    updates: Partial<grida.program.document.NodeExportSettings>
  ) => void;
  disabled?: boolean;
}) {
  const format = config.format || "PNG";
  const isImageFormat =
    format === "PNG" ||
    format === "JPEG" ||
    format === "WEBP" ||
    format === "BMP";
  const imageConfig = isImageFormat
    ? (config as grida.program.document.NodeExportSettings_Image)
    : null;

  const [suffix, setSuffix] = React.useState<string>(config.suffix || "");
  const [constraintType, setConstraintType] = React.useState<
    grida.program.document.NodeExportSettingsConstraints["type"]
  >(imageConfig?.constraints?.type || "scale");
  const [constraintValue, setConstraintValue] = React.useState<string>(
    imageConfig?.constraints?.value?.toString() || "1"
  );
  const [quality, setQuality] = React.useState<number | undefined>(
    imageConfig?.quality
  );

  React.useEffect(() => {
    setSuffix(config.suffix || "");
    if (imageConfig) {
      setConstraintType(imageConfig.constraints?.type || "scale");
      setConstraintValue(imageConfig.constraints?.value?.toString() || "1");
      setQuality(imageConfig.quality);
    }
  }, [config, imageConfig]);

  const handleSuffixChange = (value: string) => {
    setSuffix(value);
    onUpdate({ suffix: value || undefined });
  };

  const handleConstraintChange = (
    type: grida.program.document.NodeExportSettingsConstraints["type"],
    value?: number
  ) => {
    setConstraintType(type);
    if (value !== undefined) {
      setConstraintValue(value.toString());
    }
    // Only image configs can have constraints
    if (isImageFormat) {
      // Note: According to the type, NONE still requires a value
      const constraintValueNum = value || parseFloat(constraintValue) || 1;
      onUpdate({
        constraints: { type, value: constraintValueNum },
      } as Partial<grida.program.document.NodeExportSettings_Image>);
    }
  };

  const handleQualityChange = (value: string) => {
    const qualityMap: Record<string, number> = {
      High: 90,
      Medium: 75,
      Low: 50,
    };
    const qualityValue = qualityMap[value];
    if (qualityValue !== undefined && isImageFormat) {
      setQuality(qualityValue);
      onUpdate({
        quality: qualityValue,
      } as Partial<grida.program.document.NodeExportSettings_Image>);
    }
  };

  const getQualityLabel = (q: number | undefined): string | undefined => {
    if (q === undefined) return undefined;
    if (q === 90) return "High";
    if (q === 75) return "Medium";
    if (q === 50) return "Low";
    return undefined;
  };

  return (
    <PopoverContent align="end" side="left" className="w-64">
      <FieldGroup className="gap-4">
        <Field>
          <FieldLabel>Suffix</FieldLabel>
          <Input
            placeholder="e.g., @2x, -dark"
            value={suffix}
            onChange={(e) => handleSuffixChange(e.target.value)}
            disabled={disabled}
            className={WorkbenchUI.inputVariants({ size: "xs" })}
          />
        </Field>
        {editorTypes.internal.export_settings.supportsQuality(format) && (
          <Field>
            <FieldLabel>Quality</FieldLabel>
            <PropertyEnum
              value={getQualityLabel(quality)}
              onValueChange={handleQualityChange}
              disabled={disabled}
              placeholder="High"
              enum={["High", "Medium", "Low"]}
            />
          </Field>
        )}
        <Field>
          <FieldLabel>Constraint</FieldLabel>
          <PropertyEnum<
            grida.program.document.NodeExportSettingsConstraints["type"]
          >
            value={constraintType}
            onValueChange={(v) =>
              handleConstraintChange(
                v as grida.program.document.NodeExportSettingsConstraints["type"],
                parseFloat(constraintValue)
              )
            }
            disabled={disabled}
            enum={[
              "none",
              "scale",
              "scale-to-fit-width",
              "scale-to-fit-height",
            ]}
          />
          {constraintType !== "none" && (
            <InputPropertyNumber
              mode="fixed"
              type="number"
              step={0.1}
              min={0.1}
              max={10}
              value={parseFloat(constraintValue) || 1}
              onValueCommit={(v) => {
                if (v !== undefined) {
                  setConstraintValue(v.toString());
                  handleConstraintChange(constraintType, v);
                }
              }}
              placeholder="1.0"
              disabled={disabled}
              className={WorkbenchUI.inputVariants({ size: "xs" })}
            />
          )}
        </Field>
      </FieldGroup>
    </PopoverContent>
  );
}

/**
 * Minimal export component for multiple node selection
 * Shows a single button to export all selected layers
 */
export function ExportMultipleLayers({
  node_ids,
  disabled,
}: {
  node_ids: string[];
  disabled?: boolean;
}) {
  const editor = useCurrentEditor();
  const [isExporting, setIsExporting] = React.useState(false);
  const count = node_ids.length;

  const onExportAll = async () => {
    if (node_ids.length === 0) return;

    // Show spinner immediately
    setIsExporting(true);

    // Small delay to show spinner before starting expensive export
    await new Promise((resolve) => setTimeout(resolve, 50));

    try {
      // Filter nodes that have export_settings configured
      const nodesWithConfigs = node_ids.filter((node_id) => {
        const configs = editor.getExportConfigs(node_id);
        return configs.length > 0;
      });

      if (nodesWithConfigs.length === 0) {
        toast.error("No export configurations found for selected layers");
        return;
      }

      // Get node names only when exporting
      const nodeNames = nodesWithConfigs.reduce(
        (acc, id, index) => {
          const node = editor.doc.state.document.nodes[id];
          acc[id] = node?.name || `layer-${index + 1}`;
          return acc;
        },
        {} as Record<string, string>
      );

      const files: Record<string, Uint8Array> = {};

      const tasks = nodesWithConfigs.flatMap((node_id) => {
        const configs = editor.getExportConfigs(node_id);
        return configs.map(async (config, configIndex) => {
          if (!config?.format) return null;

          const format = config.format;
          if (
            !editorTypes.internal.export_settings.ALL_FORMATS.includes(format)
          ) {
            return null;
          }

          const exportConfig = buildExportConfig(config);
          const editorApi: editorTypes.api.IDocumentExportPluginActions =
            editor;
          const data = await editorApi.exportNodeAs(
            node_id,
            format,
            exportConfig
          );

          const nodeName =
            nodeNames[node_id] ||
            `layer-${nodesWithConfigs.indexOf(node_id) + 1}`;
          const suffix = config.suffix ? `-${config.suffix}` : "";
          const filename = `${nodeName}${suffix}.${editorTypes.internal.export_settings.getFileExtension(format)}`;

          // Convert to Uint8Array for zip
          const bytes = io.zip.ensureUint8Array(data);

          files[filename] = bytes;
          return { filename, data };
        });
      });

      const results = await Promise.all(tasks);
      const exportedCount = results.filter((r) => r !== null).length;

      if (exportedCount === 0) {
        toast.error("No files were exported");
        return;
      }

      await toast.promise(
        Promise.resolve().then(() => {
          // Create zip file
          const zipData = io.zip.create(files);
          const zipBlob = new Blob([zipData as BlobPart], {
            type: "application/zip",
          });
          saveAs(zipBlob, `export-${exportedCount}-files.zip`);
        }),
        {
          loading: `Exporting ${exportedCount} file(s)...`,
          success: `Exported ${exportedCount} file(s) as ZIP`,
          error: "Failed to export some files",
        }
      );
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <PropertySection className="border-b">
      <PropertySectionHeaderItem>
        <PropertySectionHeaderLabel>Export</PropertySectionHeaderLabel>
      </PropertySectionHeaderItem>
      <PropertySectionContent className="space-y-2">
        <PropertyRow>
          <Button
            variant="outline"
            size="xs"
            className="w-full overflow-hidden font-normal"
            onClick={onExportAll}
            disabled={disabled || isExporting}
          >
            {isExporting ? (
              <>
                <Spinner className="size-3 mr-2 flex-shrink-0" />
                <span className="truncate">Exporting...</span>
              </>
            ) : (
              <span className="truncate">
                Export {count} layer{count !== 1 ? "s" : ""}
              </span>
            )}
          </Button>
        </PropertyRow>
      </PropertySectionContent>
    </PropertySection>
  );
}
