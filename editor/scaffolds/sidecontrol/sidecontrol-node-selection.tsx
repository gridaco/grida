"use client";

import React, { useCallback, useMemo, useState, useEffect } from "react";
import {
  SidebarMenuSectionContent,
  SidebarSection,
  SidebarSectionHeaderActions,
  SidebarSectionHeaderItem,
  SidebarSectionHeaderLabel,
} from "@/components/sidebar";
import { TextAlignControl } from "./controls/text-align";
import { FontSizeControl } from "./controls/font-size";
import { FontStyleControl } from "./controls/font-style";
import { OpacityControl } from "./controls/opacity";
import { HrefControl } from "./controls/href";
import {
  CornerRadius4Control,
  CornerRadiusControl,
} from "./controls/corner-radius";
import { BorderControl } from "./controls/border";
import { PaddingControl } from "./controls/padding";
import { GapControl } from "./controls/gap";
import { FlexAlignControl } from "./controls/flex-align";
import { FlexWrapControl } from "./controls/flex-wrap";
import { TemplateControl } from "./controls/template";
import { CursorControl } from "./controls/cursor";
import { PropertyLine, PropertyLineLabel } from "./ui";
import { SrcControl } from "./controls/src";
import { BoxFitControl } from "./controls/box-fit";
import { PropsControl } from "./controls/props";
import { TargetBlankControl } from "./controls/target";
import { ExportNodeControl } from "./controls/export";
import { FontFamilyControl } from "./controls/font-family";
import {
  PositioningConstraintsControl,
  PositioningModeControl,
} from "./controls/positioning";
import { RotateControl } from "./controls/rotate";
import { TextAlignVerticalControl } from "./controls/text-align-vertical";
import { LetterSpacingControl } from "./controls/letter-spacing";
import { LineHeightControl } from "./controls/line-height";
import { NameControl } from "./controls/name";
import { UserDataControl } from "./controls/x-userdata";
import { LengthPercentageControl } from "./controls/length-percentage";
import { WidthHeightControl } from "./controls/width-height";
import { LayoutControl } from "./controls/layout";
import { MaxlengthControl } from "./controls/maxlength";
import { BlendModeDropdown } from "./controls/blend-mode";
import {
  useComputedNode,
  useCurrentEditor,
  useEditorState,
} from "@/grida-canvas-react";
import {
  Crosshair2Icon,
  DotsVerticalIcon,
  LockClosedIcon,
  LockOpen1Icon,
  MixerVerticalIcon,
  PlusIcon,
  TrashIcon,
} from "@radix-ui/react-icons";
import { supports } from "@/grida-canvas/utils/supports";
import { StrokeWidthControl } from "./controls/stroke-width";
import { PaintControl } from "./controls/paint";
import { StrokeCapControl } from "./controls/stroke-cap";
import grida from "@grida/schema";
import {
  useCurrentSceneState,
  useEditorFlagsState,
  useNodeActions,
  useNodeState,
  useSelectionState,
  useBackendState,
  useContentEditModeMinimalState,
  useToolState,
} from "@/grida-canvas-react/provider";
import { Checkbox } from "@/components/ui/checkbox";
import { Toggle } from "@/components/ui/toggle";
import { AlignControl as _AlignControl } from "./controls/ext-align";
import { Button } from "@/components/ui-editor/button";
import { ZoomControl } from "./controls/ext-zoom";
import { SchemaProvider, useSchema } from "./schema";
import { BoltIcon } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PropertyAccessExpressionControl } from "./controls/props-property-access-expression";
import { dq } from "@/grida-canvas/query";
import { TextDetails } from "./controls/widgets/text-details";
import cg from "@grida/cg";
import { FeControl } from "./controls/fe";
import InputPropertyNumber from "./ui/number";
import { ArcPropertiesControl } from "./controls/arc-properties";
import { ModeVectorEditModeProperties } from "./chunks/mode-vector";
import { ScaleToolSection } from "./chunks/scale-tool";
import { SectionFills } from "./chunks/section-fills";
import { SectionStrokes } from "./chunks/section-strokes";
import { OpsControl } from "./controls/ext-ops";
import { MaskControl } from "./controls/ext-mask";
import {
  useMixedProperties,
  useMixedPaints,
  MixedPropertiesEditor,
} from "@/grida-canvas-react/use-mixed-properties";
import { editor } from "@/grida-canvas";
import {
  CurrentFontProvider,
  useCurrentFontFamily,
} from "./controls/context/font";
import { PropertyLineLabelWithNumberGesture } from "./ui/label-with-number-gesture";
import { MaskTypeControl } from "./controls/mask-type";
import { Editor } from "@/grida-canvas/editor";

function FontStyleControlScaffold({ selection }: { selection: string[] }) {
  const editor = useCurrentEditor();
  const f = useCurrentFontFamily();

  const handleChange = React.useCallback(
    (key: editor.font_spec.FontStyleKey) => {
      selection.forEach((id) => {
        editor.changeTextNodeFontStyle(id, {
          fontStyleKey: key,
        });
      });
    },
    []
  );

  return <FontStyleControl onValueChange={handleChange} />;
}

function Align({ disabled }: { disabled?: boolean }) {
  const editor = useCurrentEditor();
  const { selection } = useSelectionState();
  const has_selection = selection.length >= 1;

  return (
    <_AlignControl
      disabled={!has_selection || disabled}
      onAlign={(alignment) => {
        editor.commands.align("selection", alignment);
      }}
      onDistributeEvenly={(axis) => {
        editor.commands.distributeEvenly("selection", axis);
      }}
      className="justify-between"
    />
  );
}

function Header() {
  const editor = useCurrentEditor();
  const { selection } = useSelectionState();
  const backend = useBackendState();
  const has_selection = selection.length >= 1;
  const is_single = selection.length === 1;
  const supports_masking = backend === "canvas";
  const supports_boolean = backend === "canvas";

  // TODO: this won't change immediately since useSelectionState only checks the selection itself, not the mask property for the node.
  // we'll fix this when reliable, performant selector based query is ready
  const is_mask = is_single && editor.isMask(selection[0]);

  return (
    <>
      <div className="p-2 w-full flex items-center justify-end gap-2">
        <MaskControl
          disabled={!has_selection || !supports_masking}
          active={Boolean(is_mask)}
          onClick={() => {
            editor.toggleMask(selection);
          }}
        />
        <OpsControl
          disabled={!has_selection || !supports_boolean}
          onOp={(op) => {
            editor.commands.op(selection, op);
          }}
          className="flex justify-center"
        />
      </div>
      <hr />
    </>
  );
}

export const Zoom = ZoomControl;

export function Selection({
  empty,
  config,
}: {
  empty?: React.ReactNode;
  config?: ControlsConfig;
}) {
  const instance = useCurrentEditor();
  const selection = useEditorState(instance, (state) => state.selection);
  const documentProperties = useEditorState(
    instance,
    (state) => state.document.properties
  );
  const cem = useContentEditModeMinimalState();
  const tool = useToolState();

  const is_vector_edit_mode = cem?.type === "vector";
  const is_scale_tool = tool.type === "scale";
  const selection_length = selection.length;
  const is_empty = selection_length === 0 && !is_vector_edit_mode;

  if (is_empty) {
    return empty;
  }

  return (
    <SchemaProvider
      schema={{
        properties: documentProperties,
      }}
    >
      {is_scale_tool ? (
        <ScaleToolSection
          visible={true}
          selection={selection}
          editor={instance}
        />
      ) : (
        <>
          {is_vector_edit_mode ? (
            <ModeVectorEditModeProperties node_id={cem.node_id} />
          ) : (
            <>
              <Header />
              {selection_length === 0 && empty && empty}
              {selection_length === 1 && (
                <ModeNodeProperties config={config} node_id={selection[0]} />
              )}
              {selection_length > 1 && (
                <ModeMixedNodeProperties ids={selection} config={config} />
              )}
            </>
          )}
        </>
      )}
    </SchemaProvider>
  );
}

export interface ControlsConfig {
  base?: "on" | "off";
  position?: "on" | "off";
  size?: "on" | "off";
  template?: "on" | "off";
  link?: "on" | "off";
  developer?: "on" | "off";
  export?: "on" | "off";
  props?: "on" | "off";
  text?: "on" | "off";
  image?: "on" | "off";
  layout?: "on" | "off";
}

const __default_controls_config: ControlsConfig = {
  base: "on",
  position: "on",
  size: "on",
  template: "on",
  link: "on",
  developer: "on",
  export: "on",
  props: "on",
  text: "on",
  image: "on",
};

function ModeMixedNodeProperties({
  ids,
  config = __default_controls_config,
}: {
  ids: string[];
  config?: ControlsConfig;
}) {
  const backend = useBackendState();
  const mp = useMixedProperties(ids);
  const { nodes, properties, actions: change } = mp;
  const {
    name,
    active,
    locked,
    opacity,
    corner_radius,
    rectangular_corner_radius_top_left,
    rectangular_corner_radius_top_right,
    rectangular_corner_radius_bottom_right,
    rectangular_corner_radius_bottom_left,
    fill,
    stroke,
    stroke_width,
    stroke_cap,
    width,
    height,
    fit,
    font_family,
    font_weight,
    font_style_italic,
    font_postscript_name,
    font_optical_sizing,
    font_variations,
    font_size,
    line_height,
    letter_spacing,
    text_align,
    text_align_vertical,

    //
    layout,
    direction,
    main_axis_alignment,
    cross_axis_alignment,
    //
    cursor,

    // component_id,
    // style,
    // type,
    // properties,
    // position,
    // rotation,
    // left,
    // top,
    // right,
    // bottom,
    // maxLength,
    // border,
    // padding,
    // mainAxisGap,
    // crossAxisGap,
    // userdata,
  } = properties;

  const sid = ids.join(",");
  // const is_root = ids.length === 0 && scene.children.includes(ids[0]); // assuming when root is selected, only root is selected
  const types = new Set(nodes.map((n) => n.type));
  const _types = Array.from(types);

  const supports_corner_radius = _types.some((t) =>
    supports.cornerRadius(t, { backend })
  );
  const supports_stroke = _types.some((t) => supports.stroke(t, { backend }));
  const supports_stroke_cap = _types.some((t) =>
    supports.strokeCap(t, { backend })
  );
  const has_container = types.has("container");
  const has_flex_container =
    has_container && nodes.some((n) => "layout" in n && n.layout === "flex");

  return (
    <div key={sid} className="mt-4 mb-10">
      <SidebarSection hidden={config.base === "off"} className="border-b pb-4">
        <SidebarMenuSectionContent className="space-y-2">
          <PropertyLine className="items-center gap-1">
            <Checkbox
              checked={active.mixed ? false : active.value}
              disabled={active.mixed}
              onCheckedChange={change.active}
              className="me-1"
            />
            <NameControl
              value={name.mixed ? `${ids.length} selections` : name.value}
              disabled={name.mixed}
              onValueChange={change.name}
            />
            <Toggle
              variant="outline"
              size="sm"
              disabled={locked.mixed}
              pressed={locked.mixed ? true : locked.value}
              onPressedChange={change.locked}
              className="size-6 p-0.5 aspect-square"
            >
              {locked ? (
                <LockClosedIcon className="size-3" />
              ) : (
                <LockOpen1Icon className="size-3" />
              )}
            </Toggle>
            {/* <small className="ms-2 font-mono">{id}</small> */}
          </PropertyLine>
        </SidebarMenuSectionContent>
      </SidebarSection>
      {config.position !== "off" && <SectionMixedPosition mp={mp} />}
      <SidebarSection
        hidden={config.layout === "off"}
        className="border-b pb-4"
      >
        <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>Layout</SidebarSectionHeaderLabel>
        </SidebarSectionHeaderItem>
        <SidebarMenuSectionContent className="space-y-2">
          <PropertyLine hidden={config.size === "off"}>
            <PropertyLineLabel>Width</PropertyLineLabel>
            <LengthPercentageControl
              value={width?.value}
              onValueCommit={change.width}
            />
          </PropertyLine>
          <PropertyLine hidden={config.size === "off"}>
            <PropertyLineLabel>Height</PropertyLineLabel>
            <LengthPercentageControl
              value={height?.value}
              onValueCommit={change.height}
            />
          </PropertyLine>
          {types.has("container") && (
            <PropertyLine>
              <PropertyLineLabel>Flow</PropertyLineLabel>
              <LayoutControl
                value={
                  layout?.value === grida.mixed ||
                  direction?.value === grida.mixed ||
                  layout?.value === undefined ||
                  (layout?.value === "flex" && direction?.value === undefined)
                    ? undefined
                    : {
                        layoutMode: layout?.value ?? "flow",
                        direction:
                          layout?.value === "flex"
                            ? direction?.value
                            : undefined,
                      }
                }
                onValueChange={(value) => {
                  change.layout(value.layoutMode);
                  if (value.direction) {
                    change.direction(value.direction);
                  }
                }}
              />
            </PropertyLine>
          )}
          <PropertyLine hidden={!has_flex_container}>
            <PropertyLineLabel>Alignment</PropertyLineLabel>
            <FlexAlignControl
              className="w-full"
              direction={
                direction?.value === grida.mixed
                  ? "horizontal"
                  : (direction?.value ?? "horizontal")
              }
              value={
                main_axis_alignment?.value === grida.mixed ||
                cross_axis_alignment?.value === grida.mixed ||
                main_axis_alignment?.value === undefined ||
                cross_axis_alignment?.value === undefined
                  ? undefined
                  : {
                      mainAxisAlignment: main_axis_alignment.value,
                      crossAxisAlignment: cross_axis_alignment.value,
                    }
              }
              onValueChange={(value) => {
                change.main_axis_alignment(value.mainAxisAlignment);
                change.cross_axis_alignment(value.crossAxisAlignment);
              }}
            />
          </PropertyLine>
          {/* <PropertyLine hidden={!has_flex_container}>
              <PropertyLineLabel>Gap</PropertyLineLabel>
              <GapControl
                value={{
                  mainAxisGap: mainAxisGap!,
                  crossAxisGap: crossAxisGap!,
                }}
                onValueChange={actions.gap}
              />
            </PropertyLine> */}
          {/* <PropertyLine hidden={!has_flex_container}>
              <PropertyLineLabel>Padding</PropertyLineLabel>
              <PaddingControl
                value={padding!}
                onValueChange={actions.padding}
              />
            </PropertyLine> */}
        </SidebarMenuSectionContent>
      </SidebarSection>
      <SidebarSection className="border-b pb-4">
        <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>Appearance</SidebarSectionHeaderLabel>
        </SidebarSectionHeaderItem>
        <SidebarMenuSectionContent className="space-y-2">
          <PropertyLine>
            <PropertyLineLabel>Opacity</PropertyLineLabel>
            <OpacityControl
              value={opacity?.value}
              // onValueChange={change.opacity}
              onValueCommit={change.opacity}
            />
          </PropertyLine>
          {supports_corner_radius && (
            <PropertyLine>
              <PropertyLineLabel>Radius</PropertyLineLabel>
              {corner_radius?.mixed ? (
                <CornerRadius4Control onValueCommit={change.corner_radius} />
              ) : (
                <CornerRadius4Control
                  value={{
                    rectangular_corner_radius_top_left:
                      typeof rectangular_corner_radius_top_left?.value ===
                      "number"
                        ? rectangular_corner_radius_top_left?.value
                        : undefined,
                    rectangular_corner_radius_top_right:
                      typeof rectangular_corner_radius_top_right?.value ===
                      "number"
                        ? rectangular_corner_radius_top_right?.value
                        : undefined,
                    rectangular_corner_radius_bottom_right:
                      typeof rectangular_corner_radius_bottom_right?.value ===
                      "number"
                        ? rectangular_corner_radius_bottom_right?.value
                        : undefined,
                    rectangular_corner_radius_bottom_left:
                      typeof rectangular_corner_radius_bottom_left?.value ===
                      "number"
                        ? rectangular_corner_radius_bottom_left?.value
                        : undefined,
                  }}
                  onValueCommit={change.corner_radius}
                />
              )}
            </PropertyLine>
          )}
          {/* {supports.border(node.type) && (
              <PropertyLine>
                <PropertyLineLabel>Border</PropertyLineLabel>
                <BorderControl value={border} onValueChange={actions.border} />
              </PropertyLine>
            )} */}

          {/* <PropertyLine>
              <PropertyLineLabel>Shadow</PropertyLineLabel>
              <BoxShadowControl
                value={{ boxShadow }}
                onValueChange={actions.boxShadow}
              />
            </PropertyLine> */}
        </SidebarMenuSectionContent>
      </SidebarSection>

      {/* TODO: */}
      {/* <SidebarSection hidden={!is_templateinstance} className="border-b pb-4">
          <SidebarSectionHeaderItem>
            <SidebarSectionHeaderLabel>Template</SidebarSectionHeaderLabel>
          </SidebarSectionHeaderItem>
          <SidebarMenuSectionContent>
            <TemplateControl
              value={component_id}
              onValueChange={actions.component}
            />
          </SidebarMenuSectionContent>
        </SidebarSection> */}
      {/* <SidebarSection hidden={!is_templateinstance} className="border-b pb-4">
          <SidebarSectionHeaderItem>
            <SidebarSectionHeaderLabel>Props</SidebarSectionHeaderLabel>
          </SidebarSectionHeaderItem>

          {properties && (
            <SidebarMenuSectionContent className="space-y-2">
              <PropsControl
                properties={properties}
                props={computed.props || {}}
                onValueChange={actions.value}
              />
            </SidebarMenuSectionContent>
          )}
        </SidebarSection> */}
      {config.text !== "off" && types.has("text") && (
        <CurrentFontProvider
          description={{
            fontFamily:
              typeof font_family?.value === "string" ? font_family.value : "",
            fontPostscriptName:
              typeof font_postscript_name?.value === "string"
                ? font_postscript_name.value
                : undefined,
            fontWeight:
              typeof font_weight?.value === "number"
                ? font_weight.value
                : undefined,
            fontStyleItalic:
              typeof font_style_italic?.value === "boolean"
                ? font_style_italic.value
                : undefined,
            fontVariations:
              typeof font_variations?.value === "object"
                ? (font_variations.value as Record<string, number>)
                : undefined,
          }}
        >
          <SidebarSection className="border-b pb-4">
            <SidebarSectionHeaderItem>
              <SidebarSectionHeaderLabel>Text</SidebarSectionHeaderLabel>
            </SidebarSectionHeaderItem>
            <SidebarMenuSectionContent className="space-y-2">
              <PropertyLine>
                <PropertyLineLabel>Font</PropertyLineLabel>
                <div className="flex-1">
                  <FontFamilyControl
                    value={font_family?.value}
                    onValueChange={change.font_family}
                  />
                </div>
              </PropertyLine>
              <PropertyLine>
                <PropertyLineLabel>Style</PropertyLineLabel>
                <FontStyleControlScaffold selection={ids} />
              </PropertyLine>
              <PropertyLine>
                <PropertyLineLabel>Size</PropertyLineLabel>
                <FontSizeControl
                  value={font_size?.value}
                  onValueCommit={change.font_size}
                />
              </PropertyLine>
              <PropertyLine>
                <PropertyLineLabel>Line</PropertyLineLabel>
                <LineHeightControl
                  value={line_height?.value}
                  onValueCommit={change.line_height}
                />
              </PropertyLine>
              <PropertyLine>
                <PropertyLineLabel>Letter</PropertyLineLabel>
                <LetterSpacingControl
                  value={letter_spacing?.value}
                  onValueCommit={change.letter_spacing}
                />
              </PropertyLine>
              <PropertyLine>
                <PropertyLineLabel>Align</PropertyLineLabel>
                <TextAlignControl
                  value={text_align?.value}
                  onValueChange={change.text_align}
                />
              </PropertyLine>
              <PropertyLine>
                <PropertyLineLabel></PropertyLineLabel>
                <TextAlignVerticalControl
                  value={text_align_vertical?.value}
                  onValueChange={change.text_align_vertical}
                />
              </PropertyLine>
              <PropertyLine>
                <PropertyLineLabel>Max Length</PropertyLineLabel>
                <MaxlengthControl disabled placeholder={"multiple"} />
              </PropertyLine>
            </SidebarMenuSectionContent>
          </SidebarSection>
        </CurrentFontProvider>
      )}
      <SidebarSection
        hidden={config.image === "off" || !types.has("image")}
        className="border-b pb-4"
      >
        <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>Image</SidebarSectionHeaderLabel>
        </SidebarSectionHeaderItem>
        <SidebarMenuSectionContent className="space-y-2">
          {/* <PropertyLine>
              <PropertyLineLabel>Source</PropertyLineLabel>
              <SrcControl value={node.src} onValueChange={actions.src} />
            </PropertyLine> */}
          <PropertyLine>
            <PropertyLineLabel>Fit</PropertyLineLabel>
            <BoxFitControl value={fit?.value} onValueChange={change.fit} />
          </PropertyLine>
        </SidebarMenuSectionContent>
      </SidebarSection>
      <SidebarSection
        hidden={config.layout === "off"}
        className="border-b pb-4"
      >
        <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>Layout</SidebarSectionHeaderLabel>
        </SidebarSectionHeaderItem>
        <SidebarMenuSectionContent className="space-y-2">
          <PropertyLine hidden={config.size === "off"}>
            <PropertyLineLabel>Width</PropertyLineLabel>
            <LengthPercentageControl
              value={width?.value}
              onValueCommit={change.width}
            />
          </PropertyLine>
          <PropertyLine hidden={config.size === "off"}>
            <PropertyLineLabel>Height</PropertyLineLabel>
            <LengthPercentageControl
              value={height?.value}
              onValueCommit={change.height}
            />
          </PropertyLine>
          {types.has("container") && (
            <PropertyLine>
              <PropertyLineLabel>Flow</PropertyLineLabel>
              <LayoutControl
                value={
                  layout?.value === grida.mixed ||
                  direction?.value === grida.mixed ||
                  layout?.value === undefined ||
                  (layout?.value === "flex" && direction?.value === undefined)
                    ? undefined
                    : {
                        layoutMode: layout?.value ?? "flow",
                        direction:
                          layout?.value === "flex"
                            ? direction?.value
                            : undefined,
                      }
                }
                onValueChange={(value) => {
                  change.layout(value.layoutMode);
                  if (value.direction) {
                    change.direction(value.direction);
                  }
                }}
              />
            </PropertyLine>
          )}
          <PropertyLine hidden={!has_flex_container}>
            <PropertyLineLabel>Alignment</PropertyLineLabel>
            <FlexAlignControl
              className="w-full"
              direction={
                direction?.value === grida.mixed
                  ? "horizontal"
                  : (direction?.value ?? "horizontal")
              }
              value={
                main_axis_alignment?.value === grida.mixed ||
                cross_axis_alignment?.value === grida.mixed ||
                main_axis_alignment?.value === undefined ||
                cross_axis_alignment?.value === undefined
                  ? undefined
                  : {
                      mainAxisAlignment: main_axis_alignment.value,
                      crossAxisAlignment: cross_axis_alignment.value,
                    }
              }
              onValueChange={(value) => {
                change.main_axis_alignment(value.mainAxisAlignment);
                change.cross_axis_alignment(value.crossAxisAlignment);
              }}
            />
          </PropertyLine>
        </SidebarMenuSectionContent>
      </SidebarSection>

      <SidebarSection className="border-b pb-4">
        <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>Fills</SidebarSectionHeaderLabel>
        </SidebarSectionHeaderItem>
        <SidebarMenuSectionContent className="space-y-2">
          <PropertyLine>
            <PropertyLineLabel>Fill</PropertyLineLabel>
            {fill?.mixed || fill?.partial ? (
              <PaintControl value={undefined} onValueChange={change.fill} />
            ) : (
              <PaintControl value={fill?.value} onValueChange={change.fill} />
            )}
          </PropertyLine>
        </SidebarMenuSectionContent>
      </SidebarSection>
      {supports_stroke && (
        <SidebarSection className="border-b pb-4">
          <SidebarSectionHeaderItem>
            <SidebarSectionHeaderLabel>Strokes</SidebarSectionHeaderLabel>
          </SidebarSectionHeaderItem>
          <SidebarMenuSectionContent className="space-y-2">
            <PropertyLine>
              <PropertyLineLabel>Color</PropertyLineLabel>
              {stroke?.mixed || stroke?.partial ? (
                <PaintControl
                  value={undefined}
                  onValueChange={change.stroke}
                  onValueAdd={(value) => {
                    change.stroke(value);
                    if (!stroke_width?.value || stroke_width?.value === 0) {
                      change.stroke_width({ type: "set", value: 1 });
                    }
                  }}
                />
              ) : (
                <PaintControl
                  value={stroke?.value}
                  onValueChange={change.stroke}
                  onValueAdd={(value) => {
                    change.stroke(value);
                    if (!stroke_width?.value || stroke_width?.value === 0) {
                      change.stroke_width({ type: "set", value: 1 });
                    }
                  }}
                />
              )}
            </PropertyLine>
            <PropertyLine hidden={!stroke?.value}>
              <PropertyLineLabel>Width</PropertyLineLabel>
              <StrokeWidthControl
                value={stroke_width?.value}
                onValueCommit={change.stroke_width}
              />
            </PropertyLine>
            <PropertyLine hidden={!supports_stroke_cap}>
              <PropertyLineLabel>Cap</PropertyLineLabel>
              <StrokeCapControl
                value={stroke_cap?.value}
                onValueChange={change.stroke_cap}
              />
            </PropertyLine>
          </SidebarMenuSectionContent>
        </SidebarSection>
      )}
      {backend === "dom" && (
        <SidebarSection className="border-b pb-4">
          <SidebarSectionHeaderItem>
            <SidebarSectionHeaderLabel>Actions</SidebarSectionHeaderLabel>
          </SidebarSectionHeaderItem>
          <SidebarMenuSectionContent className="space-y-2">
            {/* <PropertyLine>
                <PropertyLineLabel>Link To</PropertyLineLabel>
                <HrefControl value={node.href} onValueChange={actions.href} />
              </PropertyLine>
              {node.href && (
                <PropertyLine>
                  <PropertyLineLabel>New Tab</PropertyLineLabel>
                  <TargetBlankControl
                    value={node.target}
                    onValueChange={actions.target}
                  />
                </PropertyLine>
              )} */}
            <PropertyLine>
              <PropertyLineLabel>Cursor</PropertyLineLabel>
              <CursorControl
                value={cursor?.value}
                onValueChange={change.cursor}
              />
            </PropertyLine>
          </SidebarMenuSectionContent>
        </SidebarSection>
      )}
      {/* #region selection colors */}
      <SelectionColors />
      {/* #endregion selection colors */}
      <SidebarSection
        hidden={config.export === "off"}
        className="border-b pb-4"
      >
        <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>Export</SidebarSectionHeaderLabel>
        </SidebarSectionHeaderItem>
        <SidebarMenuSectionContent className="space-y-2">
          <PropertyLine>
            <ExportNodeControl disabled node_id={""} name={""} />
          </PropertyLine>
        </SidebarMenuSectionContent>
      </SidebarSection>
      <SidebarSection hidden={config.developer === "off"} className="pb-4">
        <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>Developer</SidebarSectionHeaderLabel>
        </SidebarSectionHeaderItem>
        <SidebarMenuSectionContent className="space-y-2">
          <PropertyLine>
            <UserDataControl disabled node_id={""} value={undefined} />
          </PropertyLine>
        </SidebarMenuSectionContent>
      </SidebarSection>
    </div>
  );
}

function ModeNodeProperties({
  node_id,
  config = __default_controls_config,
}: {
  node_id: string;
  config?: ControlsConfig;
}) {
  const instance = useCurrentEditor();
  const { debug } = useEditorFlagsState();
  const backend = useBackendState();

  const actions = useNodeActions(node_id)!;

  // TODO: chunk by usage, so the controls won't re-render when not needed
  const node = useNodeState(node_id, (node) => ({
    id: node.id,
    name: node.name,
    active: node.active,
    locked: node.locked,
    component_id: node.component_id,
    src: node.src,
    type: node.type,
    blend_mode: node.blend_mode,
    corner_radius: node.corner_radius,
    rectangular_corner_radius_top_left: node.rectangular_corner_radius_top_left,
    rectangular_corner_radius_top_right:
      node.rectangular_corner_radius_top_right,
    rectangular_corner_radius_bottom_right:
      node.rectangular_corner_radius_bottom_right,
    rectangular_corner_radius_bottom_left:
      node.rectangular_corner_radius_bottom_left,
    point_count: node.point_count,
    inner_radius: node.inner_radius,
    angle: node.angle,
    angle_offset: node.angle_offset,

    fit: node.fit,

    //
    border: node.border,
    //
    layout: node.layout,
    direction: node.direction,
    main_axis_alignment: node.main_axis_alignment,
    cross_axis_alignment: node.cross_axis_alignment,
    main_axis_gap: node.main_axis_gap,
    cross_axis_gap: node.cross_axis_gap,
    layout_wrap: node.layout_wrap,

    //
    href: node.href,
    target: node.target,
    cursor: node.cursor,

    // x
    userdata: node.userdata,
  }));

  const {
    id,
    name,
    active,
    locked,
    component_id,
    type,
    blend_mode,
    corner_radius,
    rectangular_corner_radius_top_left,
    rectangular_corner_radius_top_right,
    rectangular_corner_radius_bottom_right,
    rectangular_corner_radius_bottom_left,
    point_count,
    inner_radius,
    angle,
    angle_offset,

    fit,

    //
    border,
    //
    layout,
    direction,
    main_axis_alignment,
    cross_axis_alignment,
    main_axis_gap,
    cross_axis_gap,
    layout_wrap,

    //
    href,
    target,
    cursor,

    // x
    userdata,
  } = node;

  // const istemplate = type?.startsWith("templates/");
  const is_templateinstance = type === "template_instance";
  const is_text = type === "text";
  const is_image = type === "image";
  const is_container = type === "container";
  const is_flex_container = is_container && layout === "flex";
  const is_stylable = type !== "template_instance";

  return (
    <div key={node_id} className="mt-4 mb-10">
      <SidebarSection hidden={config.base === "off"} className="border-b pb-4">
        <SidebarMenuSectionContent className="space-y-2">
          <PropertyLine className="items-center gap-1">
            <ConfigurableProperty propertyName="active" propertyType="boolean">
              <Checkbox
                className="me-1"
                checked={active}
                onCheckedChange={actions.active}
              />
            </ConfigurableProperty>

            <NameControl value={name} onValueChange={actions.name} />
            <Toggle
              variant="outline"
              size="sm"
              pressed={locked}
              onPressedChange={actions.locked}
              className="size-6 p-0.5 aspect-square"
            >
              {locked ? (
                <LockClosedIcon className="size-3" />
              ) : (
                <LockOpen1Icon className="size-3" />
              )}
            </Toggle>
          </PropertyLine>

          {debug && (
            <PropertyLine className="items-center gap-1">
              <PropertyLineLabel>id</PropertyLineLabel>
              <small className="ms-2 font-mono">{id}</small>
            </PropertyLine>
          )}
        </SidebarMenuSectionContent>
      </SidebarSection>
      {config.position !== "off" && <SectionPosition node_id={node_id} />}

      <SidebarSection
        hidden={config.template === "off" || !is_templateinstance}
        className="border-b pb-4"
      >
        <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>Template</SidebarSectionHeaderLabel>
        </SidebarSectionHeaderItem>
        <SidebarMenuSectionContent>
          <TemplateControl
            value={component_id}
            onValueChange={actions.component}
          />
        </SidebarMenuSectionContent>
      </SidebarSection>
      {config.props !== "off" && is_templateinstance && (
        <SectionProps node_id={node_id} />
      )}

      <SectionMask node_id={node_id} editor={instance} />

      <SidebarSection
        hidden={config.layout === "off"}
        className="border-b pb-4"
      >
        <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>Layout</SidebarSectionHeaderLabel>
        </SidebarSectionHeaderItem>
        <SidebarMenuSectionContent className="space-y-2">
          {is_container && (
            <PropertyLine>
              <PropertyLineLabel>Flow</PropertyLineLabel>
              <LayoutControl
                value={{
                  layoutMode: layout ?? "flow",
                  direction: layout === "flex" ? direction : undefined,
                }}
                onValueChange={(value) => {
                  instance.commands.reLayout(node_id, value.key);
                  // actions.layout(value.layoutMode);
                  // if (value.direction) {
                  //   actions.direction(value.direction);
                  // }
                }}
              />
            </PropertyLine>
          )}
          {config.size !== "off" && <SectionDimension node_id={node_id} />}
          <PropertyLine hidden={!is_flex_container}>
            <PropertyLineLabel>Alignment</PropertyLineLabel>
            <FlexAlignControl
              className="w-full"
              direction={direction ?? "horizontal"}
              value={
                main_axis_alignment !== undefined &&
                cross_axis_alignment !== undefined
                  ? {
                      mainAxisAlignment: main_axis_alignment,
                      crossAxisAlignment: cross_axis_alignment,
                    }
                  : undefined
              }
              onValueChange={(value) => {
                actions.mainAxisAlignment(value.mainAxisAlignment);
                actions.crossAxisAlignment(value.crossAxisAlignment);
              }}
            />
          </PropertyLine>
          <PropertyLine hidden={!is_flex_container}>
            <PropertyLineLabel>Wrap</PropertyLineLabel>
            <FlexWrapControl
              value={layout_wrap}
              onValueChange={actions.layoutWrap}
            />
          </PropertyLine>
          <PropertyLine hidden={!is_flex_container}>
            <PropertyLineLabel>Gap</PropertyLineLabel>
            <GapControl
              mode={layout_wrap === "wrap" ? "multiple" : "single"}
              value={{
                main_axis_gap: main_axis_gap!,
                cross_axis_gap: cross_axis_gap,
              }}
              onValueCommit={actions.gap}
            />
          </PropertyLine>
          <PropertyPaddingLine node_id={node_id} />
        </SidebarMenuSectionContent>
      </SidebarSection>

      <SidebarSection hidden={!is_stylable} className="border-b pb-4">
        <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>Appearance</SidebarSectionHeaderLabel>
          <SidebarSectionHeaderActions>
            <BlendModeDropdown
              type="layer"
              value={blend_mode}
              onValueChange={actions.blend_mode}
            />
          </SidebarSectionHeaderActions>
        </SidebarSectionHeaderItem>
        <SidebarMenuSectionContent className="space-y-2">
          <PropertyLineOpacity node_id={node_id} />
          {supports.border(node.type, { backend }) && (
            <PropertyLine>
              <PropertyLineLabel>Border</PropertyLineLabel>
              <BorderControl value={border} onValueChange={actions.border} />
            </PropertyLine>
          )}
          {supports.cornerRadius(node.type, { backend }) && (
            <>
              {supports.cornerRadius4(node.type, { backend }) ? (
                <PropertyLine>
                  <PropertyLineLabelWithNumberGesture
                    step={1}
                    sensitivity={0.1}
                    onValueChange={(c) => actions.cornerRadiusDelta(c.value)}
                  >
                    Radius
                  </PropertyLineLabelWithNumberGesture>
                  <CornerRadius4Control
                    value={{
                      rectangular_corner_radius_top_left,
                      rectangular_corner_radius_top_right,
                      rectangular_corner_radius_bottom_right,
                      rectangular_corner_radius_bottom_left,
                    }}
                    onValueCommit={actions.corner_radius}
                  />
                </PropertyLine>
              ) : (
                <PropertyLine>
                  <PropertyLineLabelWithNumberGesture
                    step={1}
                    sensitivity={0.1}
                    onValueChange={(c) => actions.cornerRadiusDelta(c.value)}
                  >
                    Radius
                  </PropertyLineLabelWithNumberGesture>
                  <CornerRadiusControl
                    value={corner_radius}
                    onValueCommit={actions.corner_radius}
                  />
                </PropertyLine>
              )}
            </>
          )}
          {(point_count != null || inner_radius != null) && (
            <>
              {point_count != null &&
                supports.pointCount(node.type, { backend }) && (
                  <PropertyLine>
                    <PropertyLineLabel>Count</PropertyLineLabel>
                    <InputPropertyNumber
                      mode="fixed"
                      min={3}
                      max={60}
                      value={point_count}
                      onValueCommit={actions.pointCount}
                    />
                  </PropertyLine>
                )}
              {inner_radius != null && type !== "ellipse" && (
                <PropertyLine>
                  <PropertyLineLabel>Ratio</PropertyLineLabel>
                  <InputPropertyNumber
                    mode="fixed"
                    min={0}
                    max={1}
                    step={0.01}
                    value={inner_radius}
                    onValueCommit={actions.innerRadius}
                  />
                </PropertyLine>
              )}
            </>
          )}
          {supports.arcData(node.type, { backend }) && (
            <PropertyLine>
              <PropertyLineLabel>Arc</PropertyLineLabel>
              <ArcPropertiesControl
                value={{
                  angle: angle ?? 360,
                  angle_offset: angle_offset ?? 0,
                  inner_radius: inner_radius ?? 0,
                }}
                onValueChange={(v) => {
                  actions.arcData(v);
                }}
              />
            </PropertyLine>
          )}
        </SidebarMenuSectionContent>
      </SidebarSection>

      {config.text === "on" && is_text && <SectionText node_id={node_id} />}
      <SidebarSection
        hidden={config.image === "off" || !is_image}
        className="border-b pb-4"
      >
        <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>Image</SidebarSectionHeaderLabel>
        </SidebarSectionHeaderItem>
        <SidebarMenuSectionContent className="space-y-2">
          <PropertyLine>
            <PropertyLineLabel>Source</PropertyLineLabel>
            <SrcControl value={node.src} onValueChange={actions.src} />
          </PropertyLine>
          <PropertyLine>
            <PropertyLineLabel>Fit</PropertyLineLabel>
            <BoxFitControl value={fit} onValueChange={actions.fit} />
          </PropertyLine>
        </SidebarMenuSectionContent>
      </SidebarSection>

      <SectionFills node_id={node_id} />
      {supports.stroke(node.type, { backend }) && (
        <SectionStrokes
          node_id={node_id}
          config={{
            stroke_join: "on",
            stroke_cap: !supports.strokeCap(node.type, { backend })
              ? "off"
              : "on",
          }}
        />
      )}
      <SectionEffects node_id={node_id} />
      {backend === "dom" && (
        <SidebarSection
          hidden={config.link === "off"}
          className="border-b pb-4"
        >
          <SidebarSectionHeaderItem>
            <SidebarSectionHeaderLabel>Actions</SidebarSectionHeaderLabel>
          </SidebarSectionHeaderItem>
          <SidebarMenuSectionContent className="space-y-2">
            <PropertyLine>
              <PropertyLineLabel>Link To</PropertyLineLabel>
              <HrefControl value={href} onValueChange={actions.href} />
            </PropertyLine>
            {href && (
              <PropertyLine>
                <PropertyLineLabel>New Tab</PropertyLineLabel>
                <TargetBlankControl
                  value={target}
                  onValueChange={actions.target}
                />
              </PropertyLine>
            )}
            <PropertyLine>
              <PropertyLineLabel>Cursor</PropertyLineLabel>
              <CursorControl value={cursor} onValueChange={actions.cursor} />
            </PropertyLine>
          </SidebarMenuSectionContent>
        </SidebarSection>
      )}
      {/* #region selection colors */}
      <SelectionColors />
      {/* #endregion selection colors */}
      <SidebarSection
        hidden={config.export === "off"}
        className="border-b pb-4"
      >
        <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>Export</SidebarSectionHeaderLabel>
        </SidebarSectionHeaderItem>
        <SidebarMenuSectionContent className="space-y-2">
          <PropertyLine>
            <ExportNodeControl node_id={id} name={name} />
          </PropertyLine>
        </SidebarMenuSectionContent>
      </SidebarSection>
      <SidebarSection hidden={config.developer === "off"} className="pb-4">
        <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>Developer</SidebarSectionHeaderLabel>
        </SidebarSectionHeaderItem>
        <SidebarMenuSectionContent className="space-y-2">
          <PropertyLine>
            <UserDataControl
              node_id={id}
              value={userdata}
              onValueCommit={actions.userdata}
            />
          </PropertyLine>
        </SidebarMenuSectionContent>
      </SidebarSection>
    </div>
  );
}

function PropertyLineOpacity({ node_id }: { node_id: string }) {
  const actions = useNodeActions(node_id)!;
  const opacity = useNodeState(node_id, (node) => node.opacity);

  return (
    <PropertyLine>
      <PropertyLineLabelWithNumberGesture
        step={0.01}
        min={0}
        max={1}
        onValueChange={actions.opacity}
      >
        Opacity
      </PropertyLineLabelWithNumberGesture>
      <OpacityControl value={opacity as any} onValueCommit={actions.opacity} />
    </PropertyLine>
  );
}

function SectionPosition({ node_id }: { node_id: string }) {
  const instance = useCurrentEditor();
  const document_ctx = useEditorState(instance, (state) => state.document_ctx);
  const scene = useCurrentSceneState();
  const scene_id = scene.id;
  const top_scene_node_id = dq.getTopIdWithinScene(
    document_ctx,
    node_id,
    scene_id
  );
  const is_root = node_id === (top_scene_node_id ?? scene_id);
  const is_single_mode_root =
    scene.constraints.children === "single" && is_root;

  const actions = useNodeActions(node_id)!;

  const { position, rotation, top, left, right, bottom } = useNodeState(
    node_id,
    (node) => ({
      position: node.position,
      rotation: node.rotation,
      top: node.top,
      left: node.left,
      right: node.right,
      bottom: node.bottom,
    })
  );

  return (
    <SidebarSection hidden={is_single_mode_root} className="border-b pb-4">
      <SidebarSectionHeaderItem>
        <SidebarSectionHeaderLabel>Position</SidebarSectionHeaderLabel>
      </SidebarSectionHeaderItem>
      <SidebarMenuSectionContent className="space-y-2">
        <div className="pb-2 border-b">
          <Align disabled={is_root} />
        </div>
        <PropertyLine>
          <PositioningConstraintsControl
            value={{
              position: position!,
              top,
              left,
              right,
              bottom,
            }}
            disabled={{
              right: is_root,
              bottom: is_root,
            }}
            onValueCommit={actions.positioning}
          />
        </PropertyLine>
        <PropertyLine hidden={is_root}>
          <PropertyLineLabel>Mode</PropertyLineLabel>
          <PositioningModeControl
            value={position}
            onValueChange={actions.positioningMode}
          />
        </PropertyLine>
        <PropertyLine>
          <PropertyLineLabelWithNumberGesture
            step={1}
            sensitivity={1}
            onValueChange={actions.rotation}
          >
            Rotate
          </PropertyLineLabelWithNumberGesture>
          <RotateControl value={rotation} onValueCommit={actions.rotation} />
        </PropertyLine>
      </SidebarMenuSectionContent>
    </SidebarSection>
  );
}

function SectionMixedPosition({ mp }: { mp: MixedPropertiesEditor }) {
  return (
    <SidebarSection className="border-b pb-4">
      <SidebarSectionHeaderItem>
        <SidebarSectionHeaderLabel>Position</SidebarSectionHeaderLabel>
      </SidebarSectionHeaderItem>
      <SidebarMenuSectionContent className="space-y-2">
        <div className="pb-2 border-b">
          <Align />
        </div>
        <PropertyLine>
          <PositioningConstraintsControl
            // TODO:
            value={{
              position: "relative",
              top: undefined,
              left: undefined,
              right: undefined,
              bottom: undefined,
            }}
            // onValueChange={actions.positioning}
          />
        </PropertyLine>
        <PropertyLine>
          <PropertyLineLabel>Mode</PropertyLineLabel>
          <PositioningModeControl
            value={mp.properties.position!.value}
            onValueChange={mp.actions.positioningMode}
          />
        </PropertyLine>
        <PropertyLine>
          <PropertyLineLabel>Rotate</PropertyLineLabel>
          <RotateControl
            value={mp.properties.rotation?.value}
            onValueCommit={mp.actions.rotation}
          />
        </PropertyLine>
      </SidebarMenuSectionContent>
    </SidebarSection>
  );
}

function SectionText({ node_id }: { node_id: string }) {
  const actions = useNodeActions(node_id)!;
  const {
    text,
    font_family,
    font_weight,
    font_style_italic,
    font_size,
    line_height,
    letter_spacing,
    word_spacing,
    text_align,
    text_align_vertical,
    text_decoration_line,
    text_decoration_style,
    text_decoration_color,
    text_decoration_skip_ink,
    text_decoration_thickness,
    text_transform,
    max_lines,
    max_length,
    font_postscript_name,
    font_variations,
    font_features,
    font_optical_sizing,
    font_kerning,
    font_width,
  } = useNodeState(node_id, (_node) => {
    const node = _node as grida.program.nodes.TextNode;
    return {
      text: node.text,
      font_family: node.font_family,
      font_weight: node.font_weight,
      font_style_italic: node.font_style_italic,
      font_size: node.font_size,
      line_height: node.line_height,
      letter_spacing: node.letter_spacing,
      word_spacing: node.word_spacing,
      text_align: node.text_align,
      text_align_vertical: node.text_align_vertical,
      text_decoration_line: node.text_decoration_line,
      text_decoration_style: node.text_decoration_style,
      text_decoration_color: node.text_decoration_color,
      text_decoration_skip_ink: node.text_decoration_skip_ink,
      text_decoration_thickness: node.text_decoration_thickness,
      text_transform: node.text_transform,
      max_lines: node.max_lines,
      max_length: node.max_length,
      font_postscript_name: node.font_postscript_name,
      font_variations: node.font_variations,
      font_features: node.font_features,
      font_optical_sizing: node.font_optical_sizing,
      font_kerning: node.font_kerning,
      font_width: node.font_width,
    };
  });

  return (
    <CurrentFontProvider
      description={{
        fontFamily: font_family ?? "",
        fontInstancePostscriptName: font_postscript_name,
        fontWeight: font_weight,
        fontStyleItalic: font_style_italic,
        fontVariations: font_variations,
      }}
    >
      <SidebarSection className="border-b pb-4">
        <SidebarSectionHeaderItem>
          <SidebarSectionHeaderLabel>Text</SidebarSectionHeaderLabel>
          <SidebarSectionHeaderActions>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="xs">
                  <MixerVerticalIcon />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="p-0 w-64 h-[500px]">
                <TextDetails
                  textAlign={text_align}
                  textDecorationLine={text_decoration_line}
                  textDecorationStyle={text_decoration_style ?? undefined}
                  textDecorationThickness={
                    text_decoration_thickness ?? undefined
                  }
                  textDecorationColor={text_decoration_color ?? undefined}
                  textDecorationSkipInk={text_decoration_skip_ink ?? undefined}
                  textTransform={text_transform}
                  maxLines={max_lines}
                  maxLength={max_length}
                  fontVariations={font_variations}
                  fontOpticalSizing={font_optical_sizing}
                  fontWeight={font_weight}
                  fontKerning={font_kerning}
                  fontWidth={font_width}
                  fontSize={font_size}
                  fontFamily={font_family}
                  fontFeatures={font_features}
                  wordSpacing={word_spacing}
                  onTextTransformChange={actions.textTransform}
                  onTextAlignChange={actions.textAlign}
                  onTextDecorationLineChange={actions.textDecorationLine}
                  onTextDecorationStyleChange={actions.textDecorationStyle}
                  onTextDecorationThicknessChange={
                    actions.textDecorationThickness
                  }
                  onTextDecorationColorChange={actions.textDecorationColor}
                  onTextDecorationSkipInkChange={actions.textDecorationSkipInk}
                  onMaxLinesChange={actions.maxLines}
                  onMaxLengthChange={actions.maxLength}
                  onFontWeightChange={(value) =>
                    actions.fontWeight(value as cg.NFontWeight)
                  }
                  onFontVariationChange={(key, value) => {
                    actions.fontVariation(key, value);
                  }}
                  onFontOpticalSizingChange={actions.fontOpticalSizing}
                  onFontKerningChange={actions.fontKerning}
                  onFontWidthChange={actions.fontWidth}
                  onFontFeatureChange={(key, value) => {
                    actions.fontFeature(key, value);
                  }}
                  onWordSpacingChange={actions.wordSpacing}
                />
              </DropdownMenuContent>
            </DropdownMenu>
          </SidebarSectionHeaderActions>
        </SidebarSectionHeaderItem>
        <SidebarMenuSectionContent className="space-y-2">
          <PropertyLine>
            <PropertyLineLabel>Font</PropertyLineLabel>
            <div className="flex-1">
              <FontFamilyControl
                value={font_family}
                onValueChange={actions.fontFamily}
              />
            </div>
          </PropertyLine>
          <PropertyLine>
            <PropertyLineLabel>Style</PropertyLineLabel>
            <FontStyleControlScaffold selection={[node_id]} />
          </PropertyLine>
          <PropertyLine>
            <PropertyLineLabel>Size</PropertyLineLabel>
            <FontSizeControl
              value={font_size}
              onValueCommit={actions.fontSize}
            />
          </PropertyLine>
          <PropertyLine>
            <PropertyLineLabelWithNumberGesture
              step={0.1}
              min={0}
              onValueChange={actions.lineHeight}
            >
              Line
            </PropertyLineLabelWithNumberGesture>
            <LineHeightControl
              value={line_height}
              onValueCommit={actions.lineHeight}
            />
          </PropertyLine>
          <PropertyLine>
            <PropertyLineLabelWithNumberGesture
              step={0.01}
              onValueChange={actions.letterSpacing}
            >
              Letter
            </PropertyLineLabelWithNumberGesture>
            <LetterSpacingControl
              value={letter_spacing}
              onValueCommit={actions.letterSpacing}
            />
          </PropertyLine>
          <PropertyLine>
            <PropertyLineLabel>Align</PropertyLineLabel>
            <TextAlignControl
              value={text_align}
              onValueChange={actions.textAlign}
            />
          </PropertyLine>
          <PropertyLine>
            <PropertyLineLabel></PropertyLineLabel>
            <TextAlignVerticalControl
              value={text_align_vertical}
              onValueChange={actions.textAlignVertical}
            />
          </PropertyLine>
        </SidebarMenuSectionContent>
      </SidebarSection>
    </CurrentFontProvider>
  );
}

function PropertyPaddingLine({ node_id }: { node_id: string }) {
  const actions = useNodeActions(node_id)!;
  const {
    padding_top,
    padding_right,
    padding_bottom,
    padding_left,
    type,
    layout,
  } = useNodeState(node_id, (node) => ({
    padding_top: node.padding_top ?? 0,
    padding_right: node.padding_right ?? 0,
    padding_bottom: node.padding_bottom ?? 0,
    padding_left: node.padding_left ?? 0,
    type: node.type,
    layout: node.layout,
  }));

  const is_flex_container = type === "container" && layout === "flex";

  return (
    <PropertyLine hidden={!is_flex_container}>
      <PropertyLineLabel>Padding</PropertyLineLabel>
      <PaddingControl
        value={{
          padding_top,
          padding_right,
          padding_bottom,
          padding_left,
        }}
        onValueCommit={actions.padding}
      />
    </PropertyLine>
  );
}

function SectionDimension({ node_id }: { node_id: string }) {
  const instance = useCurrentEditor();
  const { width, height, layout_target_aspect_ratio } = useNodeState(
    node_id,
    (node) => ({
      width: node.width,
      height: node.height,
      layout_target_aspect_ratio: (node as any).layout_target_aspect_ratio as
        | [number, number]
        | undefined,
    })
  );

  const actions = useNodeActions(node_id)!;
  const locked = Boolean(layout_target_aspect_ratio);

  return (
    <WidthHeightControl
      width={width}
      height={height}
      locked={locked}
      onWidthChange={actions.width}
      onHeightChange={actions.height}
      onLockChange={(pressed) => {
        if (pressed) {
          instance.commands.lockAspectRatio(node_id);
        } else {
          instance.commands.unlockAspectRatio(node_id);
        }
      }}
    />
  );
}

function SectionProps({ node_id }: { node_id: string }) {
  const actions = useNodeActions(node_id)!;
  const { properties } = useNodeState(node_id, (node) => ({
    properties: node.properties,
  }));
  const computed = useComputedNode(node_id);

  return (
    <SidebarSection className="border-b pb-4">
      <SidebarSectionHeaderItem>
        <SidebarSectionHeaderLabel>Props</SidebarSectionHeaderLabel>
      </SidebarSectionHeaderItem>
      {properties && Object.keys(properties).length ? (
        <SidebarMenuSectionContent className="space-y-2">
          <PropsControl
            properties={properties}
            props={computed.props || {}}
            onValueChange={actions.value}
          />
        </SidebarMenuSectionContent>
      ) : (
        <SidebarMenuSectionContent className="space-y-2">
          <p className="text-xs text-muted-foreground">No properties defined</p>
        </SidebarMenuSectionContent>
      )}
    </SidebarSection>
  );
}

function SectionMask({ node_id, editor }: { node_id: string; editor: Editor }) {
  const actions = useNodeActions(node_id)!;
  const { mask } = useNodeState(node_id, (node) => ({
    mask: node.mask,
  }));

  if (!mask) return null;

  return (
    <SidebarSection className="border-b pb-4">
      <SidebarSectionHeaderItem>
        <SidebarSectionHeaderLabel>Mask</SidebarSectionHeaderLabel>
        <SidebarSectionHeaderActions>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => {
              editor.removeMask(node_id);
            }}
          >
            <TrashIcon className="size-3" />
          </Button>
        </SidebarSectionHeaderActions>
      </SidebarSectionHeaderItem>
      <SidebarMenuSectionContent className="space-y-2">
        <MaskTypeControl value={mask} onValueChange={actions.maskType} />
      </SidebarMenuSectionContent>
    </SidebarSection>
  );
}

// TODO: need to validate feX supported effect types, only allow them, currently we are only relying on feDropShadow to validate if effects are supported.
function SectionEffects({ node_id }: { node_id: string }) {
  const backend = useBackendState();
  const instance = useCurrentEditor();
  const {
    type,
    fe_shadows,
    fe_blur,
    fe_backdrop_blur,
    fe_liquid_glass,
    fe_noises,
  } = useNodeState(node_id, (node) => ({
    type: node.type,
    fe_shadows: node.fe_shadows,
    fe_blur: node.fe_blur,
    fe_backdrop_blur: node.fe_backdrop_blur,
    fe_liquid_glass: node.fe_liquid_glass,
    fe_noises: node.fe_noises,
  }));

  const effects = useMemo(() => {
    const effects: cg.FilterEffect[] = [];
    if (fe_shadows) {
      effects.push(...fe_shadows);
    }
    if (fe_blur) {
      effects.push(fe_blur);
    }
    if (fe_backdrop_blur) {
      effects.push(fe_backdrop_blur);
    }
    if (fe_liquid_glass) {
      effects.push(fe_liquid_glass);
    }
    if (fe_noises) {
      effects.push(...fe_noises);
    }
    return effects;
  }, [fe_shadows, fe_blur, fe_backdrop_blur, fe_liquid_glass, fe_noises]);

  const onAddEffect = useCallback(() => {
    instance.commands.changeNodeFilterEffects(node_id, [
      ...effects,
      {
        type: "shadow",
        ...editor.config.DEFAULT_FE_SHADOW,
      },
    ]);
  }, [effects, instance, node_id]);

  const empty = effects.length === 0;

  return (
    <SidebarSection
      hidden={!supports.feDropShadow(type, { backend })}
      data-empty={empty}
      className="border-b pb-4 [&[data-empty='true']]:pb-0"
    >
      <SidebarSectionHeaderItem onClick={onAddEffect}>
        <SidebarSectionHeaderLabel>Effects</SidebarSectionHeaderLabel>
        <SidebarSectionHeaderActions>
          <Button variant="ghost" size="xs">
            <PlusIcon className="size-3" />
          </Button>
        </SidebarSectionHeaderActions>
      </SidebarSectionHeaderItem>
      {!empty && (
        <SidebarMenuSectionContent className="space-y-2">
          {effects.map((effect, index) => (
            <PropertyLine key={index}>
              <FeControl
                value={effect}
                onValueChange={(value) => {
                  instance.commands.changeNodeFilterEffects(node_id, [
                    ...effects.slice(0, index),
                    value,
                    ...effects.slice(index + 1),
                  ]);
                }}
                onRemove={() => {
                  instance.commands.changeNodeFilterEffects(node_id, [
                    ...effects.slice(0, index),
                    ...effects.slice(index + 1),
                  ]);
                }}
              />
            </PropertyLine>
          ))}
        </SidebarMenuSectionContent>
      )}
    </SidebarSection>
  );
}

function SelectionColors() {
  const editor = useCurrentEditor();
  const { ids, paints, setPaint } = useMixedPaints();
  const [showAllColors, setShowAllColors] = useState(false);

  // Reset showAllColors when selection changes (ids change)
  useEffect(() => {
    setShowAllColors(false);
  }, [ids]);

  // this should show when,
  // 1. paints are more than 1
  // 2. paints is 1 but ids are more than 1
  // (to be more accurate, it should be, paints is 1 and that paint is not from the root selection)
  const should_display = ids.length > 1 || paints.length > 1;

  if (!should_display) {
    return null;
  }

  const k = 10; // Maximum number of colors to show initially
  const shouldShowButton = paints.length > k && !showAllColors;
  const displayedPaints = showAllColors ? paints : paints.slice(0, k);

  return (
    <SidebarSection className="border-b pb-4">
      <SidebarSectionHeaderItem>
        <SidebarSectionHeaderLabel>Selection colors</SidebarSectionHeaderLabel>
      </SidebarSectionHeaderItem>
      <SidebarMenuSectionContent className="space-y-2">
        {displayedPaints.map(({ value, ids }, index) => (
          <PropertyLine key={index} className="group/color-item">
            <PaintControl
              value={value}
              onValueChange={(value) => {
                // Since we slice from the start, the index matches the original array
                setPaint(index, value);
              }}
            />
            <div className="ms-1">
              <Button
                variant="ghost"
                size="xs"
                className="opacity-0 group-hover/color-item:opacity-100"
                onClick={() => {
                  editor.commands.select(ids);
                }}
              >
                <Crosshair2Icon className="size-3" />
              </Button>
            </div>
          </PropertyLine>
        ))}
        {shouldShowButton && (
          <Button
            variant="ghost"
            size="xs"
            className="w-full mt-2 text-muted-foreground text-[10px] font-normal"
            onClick={() => {
              setShowAllColors(true);
            }}
          >
            <DotsVerticalIcon className="size-3" />
            See all {paints.length} colors
          </Button>
        )}
      </SidebarMenuSectionContent>
    </SidebarSection>
  );
}

function ConfigurableProperty({
  propertyName,
  propertyType,
  children,
}: React.PropsWithChildren<{
  propertyName?: string;
  propertyType?: grida.program.schema.PropertyDefinitionType;
}>) {
  const schema = useSchema();

  const [open, setOpen] = React.useState(false);
  return (
    <DropdownMenu open={open} onOpenChange={setOpen} modal>
      <Tooltip delayDuration={50}>
        <DropdownMenuTrigger
          onContextMenu={(e) => {
            e.preventDefault();
            setOpen(true);
          }}
          asChild
        >
          <TooltipTrigger asChild>{children}</TooltipTrigger>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuItem>Configure</DropdownMenuItem>
          {schema && (
            <PropertyAccessExpressionControl
              schema={schema}
              propertyType={propertyType}
            />
          )}
        </DropdownMenuContent>
        <TooltipContent>
          <div className="flex items-center gap-1">
            <span>{propertyName}</span>
            <BoltIcon
              onClick={() => {
                setOpen(true);
              }}
              className="size-3"
            />
          </div>
        </TooltipContent>
      </Tooltip>
    </DropdownMenu>
  );
}
