"use client";

import React, { useCallback, useMemo, useState, useEffect } from "react";
import {
  PropertySection,
  PropertySectionContent,
  PropertySectionHeaderItem,
  PropertySectionHeaderLabel,
  PropertySectionHeaderActions,
  PropertyRow,
  PropertyLineLabel,
} from "./ui";
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
import { SrcControl } from "./controls/src";
import { BoxFitControl } from "./controls/box-fit";
import { PropsControl } from "./controls/props";
import { TargetBlankControl } from "./controls/target";
import { ExportSection, ExportMultipleLayers } from "./controls/export";
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
import { StrokeAlignControl } from "./controls/stroke-align";
import { StrokeJoinControl } from "./controls/stroke-join";
import { StrokeMiterLimitControl } from "./controls/stroke-miter-limit";
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
import { TextDetails } from "./controls/widgets/text-details";
import { FeControl } from "./controls/fe";
import InputPropertyNumber from "./ui/number";
import { ArcPropertiesControl } from "./controls/arc-properties";
import { ModeVectorEditModeProperties } from "./chunks/mode-vector";
import { ScaleToolSection } from "./chunks/scale-tool";
import { SectionFills, SectionFillsMixed } from "./chunks/section-fills";
import { SectionStrokes, SectionStrokesMixed } from "./chunks/section-strokes";
import { OpsControl } from "./controls/ext-ops";
import { MaskControl } from "./controls/ext-mask";
import {
  useMixedProperties,
  useMixedPaints,
} from "@/grida-canvas-react/use-mixed-properties";
import { editor } from "@/grida-canvas";
import {
  CurrentFontProvider,
  useCurrentFontFamily,
} from "./controls/context/font";
import { PropertyLineLabelWithNumberGesture } from "./ui/label-with-number-gesture";
import { MaskTypeControl } from "./controls/mask-type";
import { dq } from "@/grida-canvas/query";
import { Editor } from "@/grida-canvas/editor";
import grida from "@grida/schema";
import cg from "@grida/cg";

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
  const instance = useCurrentEditor();

  // Minimal "base" selector for mixed selection (not performance sensitive, but avoids deprecated hook).
  const mp = useMixedProperties(ids, (node) => ({
    type: node.type,
    name: node.name,
    active: node.active,
    locked: node.locked,
    fit: node.fit,
    cursor: node.cursor,
    blend_mode: node.blend_mode,
  }));

  const { name, active, locked, fit, cursor, blend_mode } = mp;

  const sid = ids.join(",");
  // const is_root = ids.length === 0 && scene.children.includes(ids[0]); // assuming when root is selected, only root is selected
  const types = new Set((mp.type?.values ?? []).map((v) => v.value));
  const _types = Array.from(types);

  const supports_corner_radius = _types.some((t) =>
    supports.cornerRadius(t, { backend })
  );
  const supports_corner_radius4 = _types.some((t) =>
    supports.cornerRadius4(t, { backend })
  );
  const supports_stroke = _types.some((t) => supports.stroke(t, { backend }));
  const supports_stroke_cap = _types.some((t) =>
    supports.strokeCap(t, { backend })
  );
  const has_stylable = (mp.type?.values ?? []).some(
    (v) => v.value !== "template_instance"
  );

  return (
    <div key={sid} className="mt-4 mb-10">
      <PropertySection hidden={config.base === "off"} className="border-b">
        <PropertySectionContent>
          <PropertyRow className="items-center gap-1">
            <Checkbox
              checked={active.mixed ? false : active.value}
              disabled={active.mixed}
              onCheckedChange={(value) => {
                const target = active?.ids ?? ids;
                target.forEach((id) => {
                  instance.doc.getNodeById(id).active = Boolean(value);
                });
              }}
              className="me-1"
            />
            <NameControl
              value={name.mixed ? `${ids.length} selections` : name.value}
              disabled={name.mixed}
              onValueChange={(value) => {
                const target = name?.ids ?? ids;
                target.forEach((id) => {
                  instance.doc.getNodeById(id).name = value;
                });
              }}
            />
            <Toggle
              variant="outline"
              size="sm"
              disabled={locked.mixed}
              pressed={locked.mixed ? true : locked.value}
              onPressedChange={(value) => {
                const target = locked?.ids ?? ids;
                target.forEach((id) => {
                  instance.doc.getNodeById(id).locked = Boolean(value);
                });
              }}
              className="size-6 p-0.5 aspect-square"
            >
              {locked.mixed ? (
                <LockClosedIcon className="size-3" />
              ) : locked.value ? (
                <LockClosedIcon className="size-3" />
              ) : (
                <LockOpen1Icon className="size-3" />
              )}
            </Toggle>
            {/* <small className="ms-2 font-mono">{id}</small> */}
          </PropertyRow>
        </PropertySectionContent>
      </PropertySection>
      {config.position !== "off" && <SectionMixedPosition ids={ids} />}
      <SectionLayoutMixed ids={ids} config={config} />
      <PropertySection hidden={!has_stylable} className="border-b">
        <PropertySectionHeaderItem>
          <PropertySectionHeaderLabel>Appearance</PropertySectionHeaderLabel>
          <PropertySectionHeaderActions>
            <BlendModeDropdown
              type="layer"
              value={blend_mode?.value}
              onValueChange={(value) => {
                const target = blend_mode?.ids ?? ids;
                target.forEach((id) => {
                  instance.doc.getNodeById(id).blend_mode = value;
                });
              }}
            />
          </PropertySectionHeaderActions>
        </PropertySectionHeaderItem>
        <PropertySectionContent>
          <PropertyRow>
            <PropertyOpacityRowMixed ids={ids} />
          </PropertyRow>
          <PropertyCornerRadiusRowMixed
            ids={ids}
            supported={supports_corner_radius}
            supports_corner_radius4={supports_corner_radius4}
          />
        </PropertySectionContent>
      </PropertySection>

      {/* TODO: */}
      {/* <PropertySection hidden={!is_templateinstance} className="border-b">
          <PropertySectionHeaderItem>
            <PropertySectionHeaderLabel>Template</PropertySectionHeaderLabel>
          </PropertySectionHeaderItem>
          <PropertySectionContent>
            <TemplateControl
              value={component_id}
              onValueChange={actions.component}
            />
          </PropertySectionContent>
        </PropertySection> */}
      {/* <PropertySection hidden={!is_templateinstance} className="border-b">
          <PropertySectionHeaderItem>
            <PropertySectionHeaderLabel>Props</PropertySectionHeaderLabel>
          </PropertySectionHeaderItem>

          {properties && (
            <PropertySectionContent>
              <PropsControl
                properties={properties}
                props={computed.props || {}}
                onValueChange={actions.value}
              />
            </PropertySectionContent>
          )}
        </PropertySection> */}
      {config.text !== "off" && types.has("text") && (
        <SectionMixedText ids={ids} />
      )}
      <PropertySection
        hidden={config.image === "off" || !types.has("image")}
        className="border-b"
      >
        <PropertySectionHeaderItem>
          <PropertySectionHeaderLabel>Image</PropertySectionHeaderLabel>
        </PropertySectionHeaderItem>
        <PropertySectionContent>
          {/* <PropertyRow>
              <PropertyLineLabel>Source</PropertyLineLabel>
              <SrcControl value={node.src} onValueChange={actions.src} />
            </PropertyRow> */}
          <PropertyRow>
            <PropertyLineLabel>Fit</PropertyLineLabel>
            <BoxFitControl
              value={fit?.value}
              onValueChange={(value) => {
                const target = fit?.ids ?? ids;
                target.forEach((id) => {
                  instance.commands.changeNodePropertyFit(id, value);
                });
              }}
            />
          </PropertyRow>
        </PropertySectionContent>
      </PropertySection>

      <SectionFillsMixed ids={ids} />

      {supports_stroke && (
        <SectionStrokesMixed
          ids={ids}
          supports_stroke_cap={supports_stroke_cap}
        />
      )}
      {backend === "dom" && (
        <PropertySection className="border-b">
          <PropertySectionHeaderItem>
            <PropertySectionHeaderLabel>Actions</PropertySectionHeaderLabel>
          </PropertySectionHeaderItem>
          <PropertySectionContent>
            {/* <PropertyRow>
                <PropertyLineLabel>Link To</PropertyLineLabel>
                <HrefControl value={node.href} onValueChange={actions.href} />
              </PropertyRow>
              {node.href && (
                <PropertyRow>
                  <PropertyLineLabel>New Tab</PropertyLineLabel>
                  <TargetBlankControl
                    value={node.target}
                    onValueChange={actions.target}
                  />
                </PropertyRow>
              )} */}
            <PropertyRow>
              <PropertyLineLabel>Cursor</PropertyLineLabel>
              <CursorControl
                value={cursor?.value}
                onValueChange={(value) => {
                  const target = cursor?.ids ?? ids;
                  target.forEach((id) => {
                    instance.commands.changeNodePropertyMouseCursor(id, value);
                  });
                }}
              />
            </PropertyRow>
          </PropertySectionContent>
        </PropertySection>
      )}
      {/* #region selection colors */}
      <SelectionColors />
      {/* #endregion selection colors */}
      {config.export !== "off" && <ExportMultipleLayers node_ids={ids} />}
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
    point_count: node.point_count,
    inner_radius: node.inner_radius,
    angle: node.angle,
    angle_offset: node.angle_offset,

    fit: node.fit,

    //
    border: node.border,

    //
    href: node.href,
    target: node.target,
    cursor: node.cursor,
  }));

  const {
    id,
    name,
    active,
    locked,
    component_id,
    type,
    blend_mode,
    point_count,
    inner_radius,
    angle,
    angle_offset,

    fit,

    //
    border,

    //
    href,
    target,
    cursor,
  } = node;

  // const istemplate = type?.startsWith("templates/");
  const is_templateinstance = type === "template_instance";
  const is_text = type === "text";
  const is_image = type === "image";
  const is_container = type === "container";
  const is_stylable = type !== "template_instance";

  return (
    <div key={node_id} className="mt-4 mb-10">
      <PropertySection hidden={config.base === "off"} className="border-b">
        <PropertySectionContent>
          <PropertyRow className="items-center gap-1">
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
          </PropertyRow>

          {debug && (
            <PropertyRow className="items-center gap-1">
              <PropertyLineLabel>id</PropertyLineLabel>
              <small className="ms-2 font-mono">{id}</small>
            </PropertyRow>
          )}
        </PropertySectionContent>
      </PropertySection>
      {config.position !== "off" && <SectionPosition node_id={node_id} />}

      <PropertySection
        hidden={config.template === "off" || !is_templateinstance}
        className="border-b"
      >
        <PropertySectionHeaderItem>
          <PropertySectionHeaderLabel>Template</PropertySectionHeaderLabel>
        </PropertySectionHeaderItem>
        <PropertySectionContent>
          <TemplateControl
            value={component_id}
            onValueChange={actions.component}
          />
        </PropertySectionContent>
      </PropertySection>
      {config.props !== "off" && is_templateinstance && (
        <SectionProps node_id={node_id} />
      )}

      <SectionMask node_id={node_id} editor={instance} />

      <SectionLayout node_id={node_id} config={config} />

      <PropertySection hidden={!is_stylable} className="border-b">
        <PropertySectionHeaderItem>
          <PropertySectionHeaderLabel>Appearance</PropertySectionHeaderLabel>
          <PropertySectionHeaderActions>
            <BlendModeDropdown
              type="layer"
              value={blend_mode}
              onValueChange={actions.blend_mode}
            />
          </PropertySectionHeaderActions>
        </PropertySectionHeaderItem>
        <PropertySectionContent>
          <PropertyOpacityRow node_id={node_id} />
          {supports.border(node.type, { backend }) && (
            <PropertyRow>
              <PropertyLineLabel>Border</PropertyLineLabel>
              <BorderControl value={border} onValueChange={actions.border} />
            </PropertyRow>
          )}
          <PropertyCornerRadiusRow node_id={node_id} />
          {(point_count != null || inner_radius != null) && (
            <>
              {point_count != null &&
                supports.pointCount(node.type, { backend }) && (
                  <PropertyRow>
                    <PropertyLineLabel>Count</PropertyLineLabel>
                    <InputPropertyNumber
                      mode="fixed"
                      min={3}
                      max={60}
                      value={point_count}
                      onValueCommit={actions.pointCount}
                    />
                  </PropertyRow>
                )}
              {inner_radius != null && type !== "ellipse" && (
                <PropertyRow>
                  <PropertyLineLabel>Ratio</PropertyLineLabel>
                  <InputPropertyNumber
                    mode="fixed"
                    min={0}
                    max={1}
                    step={0.01}
                    value={inner_radius}
                    onValueCommit={actions.innerRadius}
                  />
                </PropertyRow>
              )}
            </>
          )}
          {supports.arcData(node.type, { backend }) && (
            <PropertyRow>
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
            </PropertyRow>
          )}
        </PropertySectionContent>
      </PropertySection>

      {config.text === "on" && is_text && <SectionText node_id={node_id} />}
      <PropertySection
        hidden={config.image === "off" || !is_image}
        className="border-b"
      >
        <PropertySectionHeaderItem>
          <PropertySectionHeaderLabel>Image</PropertySectionHeaderLabel>
        </PropertySectionHeaderItem>
        <PropertySectionContent>
          <PropertyRow>
            <PropertyLineLabel>Source</PropertyLineLabel>
            <SrcControl value={node.src} onValueChange={actions.src} />
          </PropertyRow>
          <PropertyRow>
            <PropertyLineLabel>Fit</PropertyLineLabel>
            <BoxFitControl value={fit} onValueChange={actions.fit} />
          </PropertyRow>
        </PropertySectionContent>
      </PropertySection>

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
        <PropertySection hidden={config.link === "off"} className="border-b">
          <PropertySectionHeaderItem>
            <PropertySectionHeaderLabel>Actions</PropertySectionHeaderLabel>
          </PropertySectionHeaderItem>
          <PropertySectionContent>
            <PropertyRow>
              <PropertyLineLabel>Link To</PropertyLineLabel>
              <HrefControl value={href} onValueChange={actions.href} />
            </PropertyRow>
            {href && (
              <PropertyRow>
                <PropertyLineLabel>New Tab</PropertyLineLabel>
                <TargetBlankControl
                  value={target}
                  onValueChange={actions.target}
                />
              </PropertyRow>
            )}
            <PropertyRow>
              <PropertyLineLabel>Cursor</PropertyLineLabel>
              <CursorControl value={cursor} onValueChange={actions.cursor} />
            </PropertyRow>
          </PropertySectionContent>
        </PropertySection>
      )}
      <SelectionColors />
      {config.export !== "off" && <ExportSection node_id={id} name={name} />}
      <PropertySection hidden={config.developer === "off"} className="pb-4">
        <PropertySectionHeaderItem>
          <PropertySectionHeaderLabel>Developer</PropertySectionHeaderLabel>
        </PropertySectionHeaderItem>
        <PropertySectionContent>
          <PropertyRow>
            <UserDataControl node_id={id} />
          </PropertyRow>
        </PropertySectionContent>
      </PropertySection>
    </div>
  );
}

function PropertyOpacityRow({ node_id }: { node_id: string }) {
  const actions = useNodeActions(node_id)!;
  const opacity = useNodeState(node_id, (node) => node.opacity);

  return (
    <PropertyRow>
      <PropertyLineLabelWithNumberGesture
        step={0.01}
        min={0}
        max={1}
        onValueChange={actions.opacity}
      >
        Opacity
      </PropertyLineLabelWithNumberGesture>
      <OpacityControl value={opacity} onValueCommit={actions.opacity} />
    </PropertyRow>
  );
}

function PropertyOpacityRowMixed({ ids }: { ids: string[] }) {
  const instance = useCurrentEditor();
  const mp = useMixedProperties(ids, (node) => ({
    opacity: node.opacity,
  }));

  return (
    <>
      <PropertyLineLabel>Opacity</PropertyLineLabel>
      <OpacityControl
        value={mp.opacity?.value}
        onValueCommit={(change) => {
          const target = mp.opacity?.ids ?? ids;
          target.forEach((id) => {
            instance.doc.getNodeById(id)?.changeOpacity(change);
          });
        }}
      />
    </>
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
    <PropertySection hidden={is_single_mode_root} className="border-b">
      <PropertySectionHeaderItem>
        <PropertySectionHeaderLabel>Position</PropertySectionHeaderLabel>
      </PropertySectionHeaderItem>
      <PropertySectionContent>
        <div className="pb-2 border-b px-4">
          <Align disabled={is_root} />
        </div>
        <div className="py-4 px-4">
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
        </div>
        <PropertyRow hidden={is_root}>
          <PropertyLineLabel>Mode</PropertyLineLabel>
          <PositioningModeControl
            value={position}
            onValueChange={actions.positioningMode}
          />
        </PropertyRow>
        <PropertyRow>
          <PropertyLineLabelWithNumberGesture
            step={1}
            sensitivity={1}
            onValueChange={actions.rotation}
          >
            Rotate
          </PropertyLineLabelWithNumberGesture>
          <RotateControl value={rotation} onValueCommit={actions.rotation} />
        </PropertyRow>
      </PropertySectionContent>
    </PropertySection>
  );
}

function SectionMixedPosition({ ids }: { ids: string[] }) {
  const instance = useCurrentEditor();
  const mp = useMixedProperties(ids, (node) => {
    return {
      position: node.position,
      top: node.top,
      left: node.left,
      right: node.right,
      bottom: node.bottom,
      rotation: node.rotation,
    };
  });

  const position =
    mp.position?.value === grida.mixed || mp.position?.value === undefined
      ? "relative"
      : mp.position.value;

  const constraints_value: grida.program.nodes.i.IPositioning = {
    position,
    top: typeof mp.top?.value === "number" ? mp.top.value : undefined,
    left: typeof mp.left?.value === "number" ? mp.left.value : undefined,
    right: typeof mp.right?.value === "number" ? mp.right.value : undefined,
    bottom: typeof mp.bottom?.value === "number" ? mp.bottom.value : undefined,
  };

  return (
    <PropertySection className="border-b">
      <PropertySectionHeaderItem>
        <PropertySectionHeaderLabel>Position</PropertySectionHeaderLabel>
      </PropertySectionHeaderItem>
      <PropertySectionContent>
        <div className="pb-2 border-b px-4">
          <Align />
        </div>
        <div className="py-4 px-4">
          <PositioningConstraintsControl
            value={constraints_value}
            onValueCommit={(value) => {
              // Apply full constraint set to all selected nodes for consistency.
              ids.forEach((id) => {
                instance.commands.changeNodePropertyPositioning(id, value);
              });
            }}
          />
        </div>
        <PropertyRow>
          <PropertyLineLabel>Mode</PropertyLineLabel>
          <PositioningModeControl
            value={mp.position?.value}
            onValueChange={(value) => {
              ids.forEach((id) => {
                instance.commands.changeNodePropertyPositioningMode(id, value);
              });
            }}
          />
        </PropertyRow>
        <PropertyRow>
          <PropertyLineLabel>Rotate</PropertyLineLabel>
          <RotateControl
            value={mp.rotation?.value}
            onValueCommit={(change) => {
              const target = mp.rotation?.ids ?? ids;
              target.forEach((id) => {
                instance.doc.getNodeById(id)?.changeRotation(change);
              });
            }}
          />
        </PropertyRow>
      </PropertySectionContent>
    </PropertySection>
  );
}

function SectionLayout({
  node_id,
  config,
}: {
  node_id: string;
  config: ControlsConfig;
}) {
  const instance = useCurrentEditor();
  const actions = useNodeActions(node_id)!;
  const {
    type,
    layout,
    direction,
    main_axis_alignment,
    cross_axis_alignment,
    main_axis_gap,
    cross_axis_gap,
    layout_wrap,
  } = useNodeState(node_id, (node) => ({
    type: node.type,
    layout: node.layout,
    direction: node.direction,
    main_axis_alignment: node.main_axis_alignment,
    cross_axis_alignment: node.cross_axis_alignment,
    main_axis_gap: node.main_axis_gap,
    cross_axis_gap: node.cross_axis_gap,
    layout_wrap: node.layout_wrap,
  }));

  const is_container = type === "container";
  const is_flex_container = is_container && layout === "flex";

  return (
    <PropertySection hidden={config.layout === "off"} className="border-b">
      <PropertySectionHeaderItem>
        <PropertySectionHeaderLabel>Layout</PropertySectionHeaderLabel>
      </PropertySectionHeaderItem>
      <PropertySectionContent>
        {is_container && (
          <PropertyRow>
            <PropertyLineLabel>Flow</PropertyLineLabel>
            <LayoutControl
              value={{
                layoutMode: layout ?? "flow",
                direction: layout === "flex" ? direction : undefined,
              }}
              onValueChange={(value) => {
                instance.commands.reLayout(node_id, value.key);
              }}
            />
          </PropertyRow>
        )}
        {config.size !== "off" && <SectionDimension node_id={node_id} />}
        <PropertyRow hidden={!is_flex_container}>
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
        </PropertyRow>
        <PropertyRow hidden={!is_flex_container}>
          <PropertyLineLabel>Wrap</PropertyLineLabel>
          <FlexWrapControl
            value={layout_wrap}
            onValueChange={actions.layoutWrap}
          />
        </PropertyRow>
        <PropertyRow hidden={!is_flex_container}>
          <PropertyLineLabel>Gap</PropertyLineLabel>
          <GapControl
            mode={layout_wrap === "wrap" ? "multiple" : "single"}
            value={{
              main_axis_gap: main_axis_gap!,
              cross_axis_gap: cross_axis_gap,
            }}
            onValueCommit={actions.gap}
          />
        </PropertyRow>
        <PropertyPaddingRow node_id={node_id} />
      </PropertySectionContent>
    </PropertySection>
  );
}

function SectionLayoutMixed({
  ids,
  config,
}: {
  ids: string[];
  config: ControlsConfig;
}) {
  const instance = useCurrentEditor();

  const mp = useMixedProperties(ids, (node) => ({
    type: node.type,
    width: node.width,
    height: node.height,
    layout: node.layout,
    direction: node.direction,
    main_axis_alignment: node.main_axis_alignment,
    cross_axis_alignment: node.cross_axis_alignment,
    main_axis_gap: node.main_axis_gap,
    cross_axis_gap: node.cross_axis_gap,
    layout_wrap: node.layout_wrap,
  }));

  const containerIds =
    mp.type?.values?.find((v) => v.value === "container")?.ids ?? [];
  const has_container = containerIds.length > 0;

  const flexIds = new Set(
    mp.layout?.values?.find((v) => v.value === "flex")?.ids ?? []
  );
  const containerFlexIds = containerIds.filter((id) => flexIds.has(id));
  const has_flex_container = containerFlexIds.length > 0;

  return (
    <PropertySection hidden={config.layout === "off"} className="border-b">
      <PropertySectionHeaderItem>
        <PropertySectionHeaderLabel>Layout</PropertySectionHeaderLabel>
      </PropertySectionHeaderItem>
      <PropertySectionContent>
        <PropertyRow hidden={config.size === "off"}>
          <PropertyLineLabel>Width</PropertyLineLabel>
          <LengthPercentageControl
            value={mp.width?.value}
            onValueCommit={(value) => {
              const target = mp.width?.ids ?? ids;
              target.forEach((id) => {
                instance.commands.changeNodeSize(id, "width", value);
              });
            }}
          />
        </PropertyRow>
        <PropertyRow hidden={config.size === "off"}>
          <PropertyLineLabel>Height</PropertyLineLabel>
          <LengthPercentageControl
            value={mp.height?.value}
            onValueCommit={(value) => {
              const target = mp.height?.ids ?? ids;
              target.forEach((id) => {
                instance.commands.changeNodeSize(id, "height", value);
              });
            }}
          />
        </PropertyRow>

        {has_container && (
          <PropertyRow>
            <PropertyLineLabel>Flow</PropertyLineLabel>
            <LayoutControl
              value={
                mp.layout?.value === grida.mixed ||
                mp.direction?.value === grida.mixed ||
                mp.layout?.value === undefined ||
                (mp.layout?.value === "flex" &&
                  mp.direction?.value === undefined)
                  ? undefined
                  : {
                      layoutMode: mp.layout?.value ?? "flow",
                      direction:
                        mp.layout?.value === "flex"
                          ? mp.direction?.value
                          : undefined,
                    }
              }
              onValueChange={(value) => {
                containerIds.forEach((id) => {
                  instance.commands.changeContainerNodeLayout(
                    id,
                    value.layoutMode
                  );
                  if (value.direction) {
                    instance.commands.changeFlexContainerNodeDirection(
                      id,
                      value.direction
                    );
                  }
                });
              }}
            />
          </PropertyRow>
        )}

        <PropertyRow hidden={!has_flex_container}>
          <PropertyLineLabel>Alignment</PropertyLineLabel>
          <FlexAlignControl
            className="w-full"
            direction={
              mp.direction?.value === grida.mixed
                ? "horizontal"
                : (mp.direction?.value ?? "horizontal")
            }
            value={
              mp.main_axis_alignment?.value === grida.mixed ||
              mp.cross_axis_alignment?.value === grida.mixed ||
              mp.main_axis_alignment?.value === undefined ||
              mp.cross_axis_alignment?.value === undefined
                ? undefined
                : {
                    mainAxisAlignment: mp.main_axis_alignment.value,
                    crossAxisAlignment: mp.cross_axis_alignment.value,
                  }
            }
            onValueChange={(value) => {
              containerFlexIds.forEach((id) => {
                instance.commands.changeFlexContainerNodeMainAxisAlignment(
                  id,
                  value.mainAxisAlignment
                );
                instance.commands.changeFlexContainerNodeCrossAxisAlignment(
                  id,
                  value.crossAxisAlignment
                );
              });
            }}
          />
        </PropertyRow>

        <PropertyRow hidden={!has_flex_container}>
          <PropertyLineLabel>Gap</PropertyLineLabel>
          <GapControl
            mode={mp.layout_wrap?.value === "wrap" ? "multiple" : "single"}
            value={{
              main_axis_gap:
                mp.main_axis_gap?.mixed || mp.main_axis_gap?.value === undefined
                  ? grida.mixed
                  : (mp.main_axis_gap.value ?? 0),
              cross_axis_gap: mp.cross_axis_gap?.mixed
                ? grida.mixed
                : mp.cross_axis_gap?.value,
            }}
            onValueCommit={(value) => {
              containerFlexIds.forEach((id) => {
                instance.commands.changeFlexContainerNodeGap(id, value);
              });
            }}
          />
        </PropertyRow>

        <PropertyPaddingRowMixed ids={ids} />
      </PropertySectionContent>
    </PropertySection>
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
    const node = _node as grida.program.nodes.TextSpanNode;
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
      <PropertySection className="border-b">
        <PropertySectionHeaderItem>
          <PropertySectionHeaderLabel>Text</PropertySectionHeaderLabel>
          <PropertySectionHeaderActions>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon">
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
          </PropertySectionHeaderActions>
        </PropertySectionHeaderItem>
        <PropertySectionContent>
          <PropertyRow>
            <PropertyLineLabel>Font</PropertyLineLabel>
            <div className="flex-1">
              <FontFamilyControl
                value={font_family}
                onValueChange={actions.fontFamily}
              />
            </div>
          </PropertyRow>
          <PropertyRow>
            <PropertyLineLabel>Style</PropertyLineLabel>
            <FontStyleControlScaffold selection={[node_id]} />
          </PropertyRow>
          <PropertyRow>
            <PropertyLineLabel>Size</PropertyLineLabel>
            <FontSizeControl
              value={font_size}
              onValueCommit={actions.fontSize}
            />
          </PropertyRow>
          <PropertyRow>
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
          </PropertyRow>
          <PropertyRow>
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
          </PropertyRow>
          <PropertyRow>
            <PropertyLineLabel>Align</PropertyLineLabel>
            <TextAlignControl
              value={text_align}
              onValueChange={actions.textAlign}
            />
          </PropertyRow>
          <PropertyRow>
            <PropertyLineLabel></PropertyLineLabel>
            <TextAlignVerticalControl
              value={text_align_vertical}
              onValueChange={actions.textAlignVertical}
            />
          </PropertyRow>
        </PropertySectionContent>
      </PropertySection>
    </CurrentFontProvider>
  );
}

function SectionMixedText({ ids }: { ids: string[] }) {
  const instance = useCurrentEditor();
  const mp = useMixedProperties(ids, (node) => {
    const t = node as grida.program.nodes.TextSpanNode;
    return {
      font_family: t.font_family,
      font_postscript_name: t.font_postscript_name,
      font_weight: t.font_weight,
      font_style_italic: t.font_style_italic,
      font_variations: t.font_variations,
      font_optical_sizing: t.font_optical_sizing,
      font_size: t.font_size,
      line_height: t.line_height,
      letter_spacing: t.letter_spacing,
      text_align: t.text_align,
      text_align_vertical: t.text_align_vertical,
      // max_length: t.max_length,
    };
  });

  const {
    font_family,
    font_postscript_name,
    font_weight,
    font_style_italic,
    font_variations,
    font_optical_sizing,
    font_size,
    line_height,
    letter_spacing,
    text_align,
    text_align_vertical,
    // max_length,
  } = mp;

  return (
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
      <PropertySection className="border-b">
        <PropertySectionHeaderItem>
          <PropertySectionHeaderLabel>Text</PropertySectionHeaderLabel>
        </PropertySectionHeaderItem>
        <PropertySectionContent>
          <PropertyRow>
            <PropertyLineLabel>Font</PropertyLineLabel>
            <div className="flex-1">
              <FontFamilyControl
                value={font_family?.value}
                onValueChange={(value: string) => {
                  const target = font_family?.ids ?? ids;
                  target.forEach((id) => {
                    instance.changeTextNodeFontFamilySync(id, value);
                  });
                }}
              />
            </div>
          </PropertyRow>
          <PropertyRow>
            <PropertyLineLabel>Style</PropertyLineLabel>
            <FontStyleControlScaffold selection={ids} />
          </PropertyRow>
          <PropertyRow>
            <PropertyLineLabel>Size</PropertyLineLabel>
            <FontSizeControl
              value={font_size?.value}
              onValueCommit={(change) => {
                const target = font_size?.ids ?? ids;
                target.forEach((id) => {
                  instance.commands.changeTextNodeFontSize(id, change);
                });
              }}
            />
          </PropertyRow>
          <PropertyRow>
            <PropertyLineLabel>Line</PropertyLineLabel>
            <LineHeightControl
              value={line_height?.value}
              onValueCommit={(change) => {
                const target = line_height?.ids ?? ids;
                target.forEach((id) => {
                  instance.commands.changeTextNodeLineHeight(id, change);
                });
              }}
            />
          </PropertyRow>
          <PropertyRow>
            <PropertyLineLabel>Letter</PropertyLineLabel>
            <LetterSpacingControl
              value={letter_spacing?.value}
              onValueCommit={(change) => {
                const target = letter_spacing?.ids ?? ids;
                target.forEach((id) => {
                  instance.commands.changeTextNodeLetterSpacing(id, change);
                });
              }}
            />
          </PropertyRow>
          <PropertyRow>
            <PropertyLineLabel>Align</PropertyLineLabel>
            <TextAlignControl
              value={text_align?.value}
              onValueChange={(value) => {
                const target = text_align?.ids ?? ids;
                target.forEach((id) => {
                  instance.commands.changeTextNodeTextAlign(id, value);
                });
              }}
            />
          </PropertyRow>
          <PropertyRow>
            <PropertyLineLabel></PropertyLineLabel>
            <TextAlignVerticalControl
              value={text_align_vertical?.value}
              onValueChange={(value) => {
                const target = text_align_vertical?.ids ?? ids;
                target.forEach((id) => {
                  instance.commands.changeTextNodeTextAlignVertical(id, value);
                });
              }}
            />
          </PropertyRow>
          <PropertyRow>
            <PropertyLineLabel>Max Length</PropertyLineLabel>
            <MaxlengthControl disabled placeholder={"multiple"} />
          </PropertyRow>
        </PropertySectionContent>
      </PropertySection>
    </CurrentFontProvider>
  );
}

function PropertyCornerRadiusRow({ node_id }: { node_id: string }) {
  const backend = useBackendState();
  const actions = useNodeActions(node_id)!;
  const {
    type,
    corner_radius,
    rectangular_corner_radius_top_left,
    rectangular_corner_radius_top_right,
    rectangular_corner_radius_bottom_right,
    rectangular_corner_radius_bottom_left,
  } = useNodeState(node_id, (node) => ({
    type: node.type,
    corner_radius: node.corner_radius,
    rectangular_corner_radius_top_left: node.rectangular_corner_radius_top_left,
    rectangular_corner_radius_top_right:
      node.rectangular_corner_radius_top_right,
    rectangular_corner_radius_bottom_right:
      node.rectangular_corner_radius_bottom_right,
    rectangular_corner_radius_bottom_left:
      node.rectangular_corner_radius_bottom_left,
  }));

  if (!supports.cornerRadius(type, { backend })) return null;

  return supports.cornerRadius4(type, { backend }) ? (
    <PropertyRow>
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
    </PropertyRow>
  ) : (
    <PropertyRow>
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
    </PropertyRow>
  );
}

function PropertyCornerRadiusRowMixed({
  ids,
  supported,
  supports_corner_radius4,
}: {
  ids: string[];
  supported: boolean;
  supports_corner_radius4: boolean;
}) {
  const instance = useCurrentEditor();

  const mp = useMixedProperties(ids, (node) => ({
    corner_radius: node.corner_radius,
    rectangular_corner_radius_top_left: node.rectangular_corner_radius_top_left,
    rectangular_corner_radius_top_right:
      node.rectangular_corner_radius_top_right,
    rectangular_corner_radius_bottom_right:
      node.rectangular_corner_radius_bottom_right,
    rectangular_corner_radius_bottom_left:
      node.rectangular_corner_radius_bottom_left,
  }));

  if (!supported) return null;

  if (supports_corner_radius4) {
    const tl = mp.rectangular_corner_radius_top_left;
    const tr = mp.rectangular_corner_radius_top_right;
    const br = mp.rectangular_corner_radius_bottom_right;
    const bl = mp.rectangular_corner_radius_bottom_left;

    const corners_value =
      typeof tl?.value === "number" &&
      !tl.mixed &&
      typeof tr?.value === "number" &&
      !tr.mixed &&
      typeof br?.value === "number" &&
      !br.mixed &&
      typeof bl?.value === "number" &&
      !bl.mixed
        ? {
            rectangular_corner_radius_top_left: tl.value,
            rectangular_corner_radius_top_right: tr.value,
            rectangular_corner_radius_bottom_right: br.value,
            rectangular_corner_radius_bottom_left: bl.value,
          }
        : undefined;

    return (
      <PropertyRow>
        <PropertyLineLabel>Radius</PropertyLineLabel>
        <CornerRadius4Control
          value={corners_value}
          onValueCommit={(value) => {
            const target = mp.corner_radius?.ids ?? ids;
            target.forEach((id) => {
              instance.commands.changeNodePropertyCornerRadius(id, value);
            });
          }}
        />
      </PropertyRow>
    );
  }

  return (
    <PropertyRow>
      <PropertyLineLabel>Radius</PropertyLineLabel>
      <CornerRadiusControl
        value={
          typeof mp.corner_radius?.value === "number"
            ? mp.corner_radius.value
            : 0
        }
        disabled={mp.corner_radius?.mixed}
        onValueCommit={(value) => {
          const target = mp.corner_radius?.ids ?? ids;
          target.forEach((id) => {
            instance.commands.changeNodePropertyCornerRadius(id, value);
          });
        }}
      />
    </PropertyRow>
  );
}

function PropertyPaddingRow({ node_id }: { node_id: string }) {
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
    <PropertyRow hidden={!is_flex_container}>
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
    </PropertyRow>
  );
}

function PropertyPaddingRowMixed({ ids }: { ids: string[] }) {
  const instance = useCurrentEditor();
  const mp = useMixedProperties(ids, (node) => {
    return {
      type: node.type,
      padding_top: node.padding_top,
      padding_right: node.padding_right,
      padding_bottom: node.padding_bottom,
      padding_left: node.padding_left,
    };
  });

  const containerIds =
    mp.type?.values?.find((v) => v.value === "container")?.ids ?? [];
  const has_container = containerIds.length > 0;

  return (
    <PropertyRow hidden={!has_container}>
      <PropertyLineLabel>Padding</PropertyLineLabel>
      <PaddingControl
        value={{
          padding_top:
            mp.padding_top?.mixed || mp.padding_top?.value === undefined
              ? grida.mixed
              : (mp.padding_top.value ?? 0),
          padding_right:
            mp.padding_right?.mixed || mp.padding_right?.value === undefined
              ? grida.mixed
              : (mp.padding_right.value ?? 0),
          padding_bottom:
            mp.padding_bottom?.mixed || mp.padding_bottom?.value === undefined
              ? grida.mixed
              : (mp.padding_bottom.value ?? 0),
          padding_left:
            mp.padding_left?.mixed || mp.padding_left?.value === undefined
              ? grida.mixed
              : (mp.padding_left.value ?? 0),
        }}
        onValueCommit={(value) => {
          containerIds.forEach((id) => {
            instance.commands.changeContainerNodePadding(id, value);
          });
        }}
      />
    </PropertyRow>
  );
}

function SectionDimension({ node_id }: { node_id: string }) {
  const instance = useCurrentEditor();
  const { width, height, layout_target_aspect_ratio } = useNodeState(
    node_id,
    (node) => ({
      width: node.width,
      height: node.height,
      layout_target_aspect_ratio: node.layout_target_aspect_ratio,
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
    <PropertySection className="border-b">
      <PropertySectionHeaderItem>
        <PropertySectionHeaderLabel>Props</PropertySectionHeaderLabel>
      </PropertySectionHeaderItem>
      {properties && Object.keys(properties).length ? (
        <PropertySectionContent>
          <PropsControl
            properties={properties}
            props={computed.props || {}}
            onValueChange={actions.value}
          />
        </PropertySectionContent>
      ) : (
        <PropertySectionContent>
          <p className="text-xs text-muted-foreground">No properties defined</p>
        </PropertySectionContent>
      )}
    </PropertySection>
  );
}

function SectionMask({ node_id, editor }: { node_id: string; editor: Editor }) {
  const actions = useNodeActions(node_id)!;
  const { mask } = useNodeState(node_id, (node) => ({
    mask: node.mask,
  }));

  if (!mask) return null;

  return (
    <PropertySection className="border-b">
      <PropertySectionHeaderItem>
        <PropertySectionHeaderLabel>Mask</PropertySectionHeaderLabel>
        <PropertySectionHeaderActions>
          <Button
            variant="ghost"
            size="xs"
            onClick={() => {
              editor.removeMask(node_id);
            }}
          >
            <TrashIcon className="size-3" />
          </Button>
        </PropertySectionHeaderActions>
      </PropertySectionHeaderItem>
      <PropertySectionContent>
        <MaskTypeControl value={mask} onValueChange={actions.maskType} />
      </PropertySectionContent>
    </PropertySection>
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
    <PropertySection
      hidden={!supports.feDropShadow(type, { backend })}
      data-empty={empty}
      className="border-b [&[data-empty='true']]:pb-0"
    >
      <PropertySectionHeaderItem onClick={onAddEffect}>
        <PropertySectionHeaderLabel>Effects</PropertySectionHeaderLabel>
        <PropertySectionHeaderActions>
          <Button variant="ghost" size="icon">
            <PlusIcon className="size-3" />
          </Button>
        </PropertySectionHeaderActions>
      </PropertySectionHeaderItem>
      {!empty && (
        <PropertySectionContent>
          {effects.map((effect, index) => (
            <PropertyRow key={index}>
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
            </PropertyRow>
          ))}
        </PropertySectionContent>
      )}
    </PropertySection>
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
    <PropertySection className="border-b">
      <PropertySectionHeaderItem>
        <PropertySectionHeaderLabel>
          Selection colors
        </PropertySectionHeaderLabel>
      </PropertySectionHeaderItem>
      <PropertySectionContent>
        {displayedPaints.map(({ value, ids }, index) => (
          <PropertyRow key={index} className="group/color-item">
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
          </PropertyRow>
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
      </PropertySectionContent>
    </PropertySection>
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
