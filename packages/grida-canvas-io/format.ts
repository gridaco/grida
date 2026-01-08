import grida from "@grida/schema";
import cg from "@grida/cg";
import type cmath from "@grida/cmath";
import * as fbs from "@grida/format";
import { unionToLength, unionToPaint, unionListToNode } from "@grida/format";
import type { vn } from "@grida/schema";
import * as flatbuffers from "flatbuffers";
import { generateNKeysBetween } from "@grida/sequence";

type Builder = flatbuffers.Builder;

/**
 * Type guard to check if a paint value is a valid cg.Paint (not tokenized).
 * Tokenized paints have string values for properties that should be objects/numbers.
 */
function isPaint(
  paint: grida.program.nodes.i.props.PropsPaintValue
): paint is cg.Paint {
  if (!paint || typeof paint !== "object") {
    return false;
  }
  // Check if it's a valid Paint by checking the type property
  if (!("type" in paint)) {
    return false;
  }
  // For solid paints, check if color is an object (RGBA32F) not a string (Token)
  if (paint.type === "solid") {
    const solidPaint = paint as cg.SolidPaint;
    return (
      solidPaint.color &&
      typeof solidPaint.color === "object" &&
      "r" in solidPaint.color &&
      "g" in solidPaint.color &&
      "b" in solidPaint.color &&
      "a" in solidPaint.color
    );
  }
  // For other paint types, if they have a type property and are objects, they're likely valid
  return true;
}

export namespace format {
  /**
   * Enum lookup maps for encoding/decoding between TS and FlatBuffers enums.
   * All enum mappings are centralized here for maintainability.
   */
  export namespace enums {
    // Styling enums
    export const TEXT_ALIGN_ENCODE = new Map<
      cg.TextAlign | undefined,
      fbs.TextAlign
    >([
      ["right", fbs.TextAlign.Right],
      ["center", fbs.TextAlign.Center],
      ["justify", fbs.TextAlign.Justify],
      ["left", fbs.TextAlign.Left],
      [undefined, fbs.TextAlign.Left],
    ]);

    export const TEXT_ALIGN_DECODE = new Map<fbs.TextAlign, cg.TextAlign>([
      [fbs.TextAlign.Right, "right"],
      [fbs.TextAlign.Center, "center"],
      [fbs.TextAlign.Justify, "justify"],
      [fbs.TextAlign.Left, "left"],
    ]);

    export const TEXT_ALIGN_VERTICAL_ENCODE = new Map<
      cg.TextAlignVertical | undefined,
      fbs.TextAlignVertical
    >([
      ["center", fbs.TextAlignVertical.Center],
      ["bottom", fbs.TextAlignVertical.Bottom],
      ["top", fbs.TextAlignVertical.Top],
      [undefined, fbs.TextAlignVertical.Top],
    ]);

    export const TEXT_ALIGN_VERTICAL_DECODE = new Map<
      fbs.TextAlignVertical,
      cg.TextAlignVertical
    >([
      [fbs.TextAlignVertical.Center, "center"],
      [fbs.TextAlignVertical.Bottom, "bottom"],
      [fbs.TextAlignVertical.Top, "top"],
    ]);

    export const STROKE_CAP_ENCODE = new Map<
      cg.StrokeCap | undefined,
      fbs.StrokeCap
    >([
      ["round", fbs.StrokeCap.Round],
      ["square", fbs.StrokeCap.Square],
      ["butt", fbs.StrokeCap.Butt],
      [undefined, fbs.StrokeCap.Butt],
    ]);

    export const STROKE_CAP_DECODE = new Map<fbs.StrokeCap, cg.StrokeCap>([
      [fbs.StrokeCap.Round, "round"],
      [fbs.StrokeCap.Square, "square"],
      [fbs.StrokeCap.Butt, "butt"],
    ]);

    export const STROKE_JOIN_ENCODE = new Map<
      cg.StrokeJoin | undefined,
      fbs.StrokeJoin
    >([
      ["round", fbs.StrokeJoin.Round],
      ["bevel", fbs.StrokeJoin.Bevel],
      ["miter", fbs.StrokeJoin.Miter],
      [undefined, fbs.StrokeJoin.Miter],
    ]);

    export const STROKE_JOIN_DECODE = new Map<fbs.StrokeJoin, cg.StrokeJoin>([
      [fbs.StrokeJoin.Round, "round"],
      [fbs.StrokeJoin.Bevel, "bevel"],
      [fbs.StrokeJoin.Miter, "miter"],
    ]);

    export const TEXT_DECORATION_LINE_ENCODE = new Map<
      cg.TextDecorationLine | undefined,
      fbs.TextDecorationLine
    >([
      ["underline", fbs.TextDecorationLine.Underline],
      ["overline", fbs.TextDecorationLine.Overline],
      ["line-through", fbs.TextDecorationLine.LineThrough],
      ["none", fbs.TextDecorationLine.None],
      [undefined, fbs.TextDecorationLine.None],
    ]);

    export const TEXT_DECORATION_LINE_DECODE = new Map<
      fbs.TextDecorationLine,
      cg.TextDecorationLine
    >([
      [fbs.TextDecorationLine.Underline, "underline"],
      [fbs.TextDecorationLine.Overline, "overline"],
      [fbs.TextDecorationLine.LineThrough, "line-through"],
      [fbs.TextDecorationLine.None, "none"],
    ]);

    export const BLEND_MODE_ENCODE = new Map<
      cg.BlendMode | undefined,
      fbs.BlendMode
    >([
      ["multiply", fbs.BlendMode.Multiply],
      ["screen", fbs.BlendMode.Screen],
      ["overlay", fbs.BlendMode.Overlay],
      ["darken", fbs.BlendMode.Darken],
      ["lighten", fbs.BlendMode.Lighten],
      ["color-dodge", fbs.BlendMode.ColorDodge],
      ["color-burn", fbs.BlendMode.ColorBurn],
      ["hard-light", fbs.BlendMode.HardLight],
      ["soft-light", fbs.BlendMode.SoftLight],
      ["difference", fbs.BlendMode.Difference],
      ["exclusion", fbs.BlendMode.Exclusion],
      ["hue", fbs.BlendMode.Hue],
      ["saturation", fbs.BlendMode.Saturation],
      ["color", fbs.BlendMode.Color],
      ["luminosity", fbs.BlendMode.Luminosity],
      ["normal", fbs.BlendMode.Normal],
      [undefined, fbs.BlendMode.Normal],
    ]);

    export const BLEND_MODE_DECODE = new Map<fbs.BlendMode, cg.BlendMode>([
      [fbs.BlendMode.Multiply, "multiply"],
      [fbs.BlendMode.Screen, "screen"],
      [fbs.BlendMode.Overlay, "overlay"],
      [fbs.BlendMode.Darken, "darken"],
      [fbs.BlendMode.Lighten, "lighten"],
      [fbs.BlendMode.ColorDodge, "color-dodge"],
      [fbs.BlendMode.ColorBurn, "color-burn"],
      [fbs.BlendMode.HardLight, "hard-light"],
      [fbs.BlendMode.SoftLight, "soft-light"],
      [fbs.BlendMode.Difference, "difference"],
      [fbs.BlendMode.Exclusion, "exclusion"],
      [fbs.BlendMode.Hue, "hue"],
      [fbs.BlendMode.Saturation, "saturation"],
      [fbs.BlendMode.Color, "color"],
      [fbs.BlendMode.Luminosity, "luminosity"],
      [fbs.BlendMode.Normal, "normal"],
    ]);

    // Layout enums
    export const AXIS_ENCODE = new Map<cg.Axis | undefined, fbs.Axis>([
      ["vertical", fbs.Axis.Vertical],
      ["horizontal", fbs.Axis.Horizontal],
      [undefined, fbs.Axis.Horizontal],
    ]);

    export const AXIS_DECODE = new Map<fbs.Axis, cg.Axis>([
      [fbs.Axis.Vertical, "vertical"],
      [fbs.Axis.Horizontal, "horizontal"],
    ]);

    export const MAIN_AXIS_ALIGNMENT_ENCODE = new Map<
      cg.MainAxisAlignment | undefined,
      fbs.MainAxisAlignment
    >([
      ["start", fbs.MainAxisAlignment.Start],
      ["end", fbs.MainAxisAlignment.End],
      ["center", fbs.MainAxisAlignment.Center],
      ["space-between", fbs.MainAxisAlignment.SpaceBetween],
      ["space-around", fbs.MainAxisAlignment.SpaceAround],
      ["space-evenly", fbs.MainAxisAlignment.SpaceEvenly],
      ["stretch", fbs.MainAxisAlignment.Stretch],
      [undefined, fbs.MainAxisAlignment.None],
    ]);

    export const MAIN_AXIS_ALIGNMENT_DECODE = new Map<
      fbs.MainAxisAlignment,
      cg.MainAxisAlignment
    >([
      [fbs.MainAxisAlignment.Start, "start"],
      [fbs.MainAxisAlignment.End, "end"],
      [fbs.MainAxisAlignment.Center, "center"],
      [fbs.MainAxisAlignment.SpaceBetween, "space-between"],
      [fbs.MainAxisAlignment.SpaceAround, "space-around"],
      [fbs.MainAxisAlignment.SpaceEvenly, "space-evenly"],
      [fbs.MainAxisAlignment.Stretch, "stretch"],
    ]);

    export const CROSS_AXIS_ALIGNMENT_ENCODE = new Map<
      cg.CrossAxisAlignment | undefined,
      fbs.CrossAxisAlignment
    >([
      ["start", fbs.CrossAxisAlignment.Start],
      ["end", fbs.CrossAxisAlignment.End],
      ["center", fbs.CrossAxisAlignment.Center],
      ["stretch", fbs.CrossAxisAlignment.Stretch],
      [undefined, fbs.CrossAxisAlignment.None],
    ]);

    export const CROSS_AXIS_ALIGNMENT_DECODE = new Map<
      fbs.CrossAxisAlignment,
      cg.CrossAxisAlignment
    >([
      [fbs.CrossAxisAlignment.Start, "start"],
      [fbs.CrossAxisAlignment.End, "end"],
      [fbs.CrossAxisAlignment.Center, "center"],
      [fbs.CrossAxisAlignment.Stretch, "stretch"],
    ]);

    export const LAYOUT_WRAP_ENCODE = new Map<
      "wrap" | "nowrap" | undefined,
      fbs.LayoutWrap
    >([
      ["wrap", fbs.LayoutWrap.Wrap],
      ["nowrap", fbs.LayoutWrap.NoWrap],
      [undefined, fbs.LayoutWrap.None],
    ]);

    export const LAYOUT_WRAP_DECODE = new Map<
      fbs.LayoutWrap,
      "wrap" | "nowrap"
    >([
      [fbs.LayoutWrap.Wrap, "wrap"],
      [fbs.LayoutWrap.NoWrap, "nowrap"],
    ]);

    // Node type enums
    export const NODE_TYPE_ENCODE = new Map<
      grida.program.nodes.Node["type"],
      fbs.NodeType
    >([
      ["scene", fbs.NodeType.Scene],
      ["container", fbs.NodeType.Container],
      ["rectangle", fbs.NodeType.Rectangle],
      ["text", fbs.NodeType.TextSpan],
      ["group", fbs.NodeType.Group],
      ["ellipse", fbs.NodeType.Ellipse],
      ["line", fbs.NodeType.Line],
      ["vector", fbs.NodeType.Vector],
      ["boolean", fbs.NodeType.BooleanOperation],
      ["polygon", fbs.NodeType.RegularPolygon],
      ["star", fbs.NodeType.RegularStarPolygon],
    ]);

    export const NODE_TYPE_DECODE = new Map<
      fbs.NodeType,
      grida.program.nodes.Node["type"]
    >([
      [fbs.NodeType.Scene, "scene"],
      [fbs.NodeType.Container, "container"],
      [fbs.NodeType.Rectangle, "rectangle"],
      [fbs.NodeType.TextSpan, "text"],
      [fbs.NodeType.Group, "group"],
      [fbs.NodeType.Ellipse, "ellipse"],
      [fbs.NodeType.Line, "line"],
      [fbs.NodeType.Vector, "vector"],
      [fbs.NodeType.BooleanOperation, "boolean"],
      [fbs.NodeType.RegularPolygon, "polygon"],
      [fbs.NodeType.RegularStarPolygon, "star"],
    ]);

    // BasicShapeNodeType enum mappings (maps TS node types to BasicShapeNodeType enum)
    export const BASIC_SHAPE_NODE_TYPE_ENCODE = new Map<
      "rectangle" | "ellipse" | "polygon" | "star",
      fbs.BasicShapeNodeType
    >([
      ["rectangle", fbs.BasicShapeNodeType.Rectangle],
      ["ellipse", fbs.BasicShapeNodeType.Ellipse],
      ["polygon", fbs.BasicShapeNodeType.RegularPolygon], // TS "polygon" = RegularPolygon (not SimplePolygon)
      ["star", fbs.BasicShapeNodeType.RegularStarPolygon],
    ]);

    export const BASIC_SHAPE_NODE_TYPE_DECODE = new Map<
      fbs.BasicShapeNodeType,
      "rectangle" | "ellipse" | "polygon" | "star"
    >([
      [fbs.BasicShapeNodeType.Rectangle, "rectangle"],
      [fbs.BasicShapeNodeType.Ellipse, "ellipse"],
      [fbs.BasicShapeNodeType.RegularPolygon, "polygon"],
      [fbs.BasicShapeNodeType.RegularStarPolygon, "star"],
    ]);

    // Paint type enums
    export const PAINT_TYPE_ENCODE = new Map<cg.Paint["type"], fbs.Paint>([
      ["solid", fbs.Paint.SolidPaint],
      ["linear_gradient", fbs.Paint.LinearGradientPaint],
      ["radial_gradient", fbs.Paint.RadialGradientPaint],
      ["sweep_gradient", fbs.Paint.SweepGradientPaint],
      ["diamond_gradient", fbs.Paint.DiamondGradientPaint],
      ["image", fbs.Paint.ImagePaint],
    ]);

    export const PAINT_TYPE_DECODE = new Map<fbs.Paint, cg.Paint["type"]>([
      [fbs.Paint.SolidPaint, "solid"],
      [fbs.Paint.LinearGradientPaint, "linear_gradient"],
      [fbs.Paint.RadialGradientPaint, "radial_gradient"],
      [fbs.Paint.SweepGradientPaint, "sweep_gradient"],
      [fbs.Paint.DiamondGradientPaint, "diamond_gradient"],
      [fbs.Paint.ImagePaint, "image"],
    ]);

    // Boolean operation enums
    export const BOOLEAN_OPERATION_ENCODE = new Map<
      cg.BooleanOperation,
      fbs.BooleanPathOperation
    >([
      ["union", fbs.BooleanPathOperation.Union],
      ["intersection", fbs.BooleanPathOperation.Intersection],
      ["difference", fbs.BooleanPathOperation.Difference],
      ["xor", fbs.BooleanPathOperation.Xor],
    ]);

    export const BOOLEAN_OPERATION_DECODE = new Map<
      fbs.BooleanPathOperation,
      cg.BooleanOperation
    >([
      [fbs.BooleanPathOperation.Union, "union"],
      [fbs.BooleanPathOperation.Intersection, "intersection"],
      [fbs.BooleanPathOperation.Difference, "difference"],
      [fbs.BooleanPathOperation.Xor, "xor"],
    ]);

    // BoxFit enums
    export const BOX_FIT_ENCODE = new Map<cg.BoxFit, fbs.BoxFit>([
      ["contain", fbs.BoxFit.Contain],
      ["cover", fbs.BoxFit.Cover],
      ["fill", fbs.BoxFit.Fill],
      ["none", fbs.BoxFit.None],
    ]);

    export const BOX_FIT_DECODE = new Map<fbs.BoxFit, cg.BoxFit>([
      [fbs.BoxFit.Contain, "contain"],
      [fbs.BoxFit.Cover, "cover"],
      [fbs.BoxFit.Fill, "fill"],
      [fbs.BoxFit.None, "none"],
    ]);
  }

  /**
   * Struct creation helpers for inline struct serialization.
   * FlatBuffers requires structs to be serialized inline in nested table context.
   */
  export namespace structs {
    /**
     * Creates a NodeIdentifier table.
     * TODO: Update to use packed u32 struct for better performance.
     */
    export function nodeIdentifier(
      builder: Builder,
      id: string
    ): flatbuffers.Offset {
      const idOffset = builder.createString(id);
      return fbs.NodeIdentifier.createNodeIdentifier(builder, idOffset);
    }

    /**
     * Creates a ParentReference table.
     */
    export function parentReference(
      builder: Builder,
      parentId: string,
      position: string
    ): flatbuffers.Offset {
      const parentIdOffset = structs.nodeIdentifier(builder, parentId);
      const positionOffset = builder.createString(position);
      fbs.ParentReference.startParentReference(builder);
      fbs.ParentReference.addParentId(builder, parentIdOffset);
      fbs.ParentReference.addPosition(builder, positionOffset);
      return fbs.ParentReference.endParentReference(builder);
    }

    /**
     * Creates a CGPoint struct inline.
     */
    export function cgPoint(
      builder: Builder,
      x: number,
      y: number
    ): flatbuffers.Offset {
      builder.prep(4, 8);
      const offset = builder.offset();
      builder.writeFloat32(x);
      builder.writeFloat32(y);
      return offset;
    }

    /**
     * Creates an EdgeInsets struct inline.
     */
    export function edgeInsets(
      builder: Builder,
      top: number,
      right: number,
      bottom: number,
      left: number
    ): flatbuffers.Offset {
      builder.prep(4, 16);
      const offset = builder.offset();
      builder.writeFloat32(top);
      builder.writeFloat32(right);
      builder.writeFloat32(bottom);
      builder.writeFloat32(left);
      return offset;
    }

    /**
     * Creates a CGTransform2D struct inline (identity transform by default).
     */
    export function cgTransform2D(
      builder: Builder,
      m00: number = 1,
      m01: number = 0,
      m02: number = 0,
      m10: number = 0,
      m11: number = 1,
      m12: number = 0
    ): flatbuffers.Offset {
      return fbs.CGTransform2D.createCGTransform2D(
        builder,
        m00,
        m01,
        m02,
        m10,
        m11,
        m12
      );
    }

    /**
     * Encodes RGBA32F struct inline.
     */
    export function rgba32f(
      builder: Builder,
      color: cg.RGBA32F
    ): flatbuffers.Offset {
      return fbs.RGBA32F.createRGBA32F(
        builder,
        color.r,
        color.g,
        color.b,
        color.a
      );
    }

    /**
     * Encodes Alignment struct inline.
     */
    export function alignment(
      builder: Builder,
      x: number,
      y: number
    ): flatbuffers.Offset {
      return fbs.Alignment.createAlignment(builder, x, y);
    }

    /**
     * Creates a vector of NodeIdentifier tables.
     * Used for scenes array in CanvasDocument.
     * TODO: Update to use packed u32 structs for better performance.
     */
    export function nodeIdentifierVector(
      builder: Builder,
      ids: string[],
      createVector: (
        builder: Builder,
        data: flatbuffers.Offset[]
      ) => flatbuffers.Offset
    ): flatbuffers.Offset {
      if (ids.length === 0) return 0;
      // Create NodeIdentifier tables for each ID
      const offsets: flatbuffers.Offset[] = [];
      for (const id of ids) {
        offsets.push(structs.nodeIdentifier(builder, id));
      }
      // createVector already handles reverse order internally
      return createVector(builder, offsets);
    }

    /**
     * Encodes CGTransform2D struct inline from AffineTransform tuple.
     */
    export function transform(
      builder: Builder,
      t: cg.AffineTransform
    ): flatbuffers.Offset {
      return fbs.CGTransform2D.createCGTransform2D(
        builder,
        t[0][0], // m00
        t[0][1], // m01
        t[0][2], // m02
        t[1][0], // m10
        t[1][1], // m11
        t[1][2] // m12
      );
    }

    /**
     * Encodes GradientStop struct inline.
     */
    export function gradientStop(
      builder: Builder,
      stop: cg.GradientStop
    ): flatbuffers.Offset {
      return fbs.GradientStop.createGradientStop(
        builder,
        stop.offset,
        stop.color.r,
        stop.color.g,
        stop.color.b,
        stop.color.a
      );
    }

    /**
     * Converts a 4-character OpenType feature tag string to OpenTypeFeatureTag struct.
     *
     * @param tag - 4-character OpenType feature tag (e.g., "kern", "liga")
     * @returns Offset to the OpenTypeFeatureTag struct
     */
    export function openTypeFeatureTag(
      builder: Builder,
      tag: string
    ): flatbuffers.Offset {
      if (tag.length !== 4) {
        throw new Error(
          `OpenType feature tag must be exactly 4 characters, got: "${tag}"`
        );
      }
      const bytes = new TextEncoder().encode(tag);
      if (bytes.length !== 4) {
        throw new Error(`OpenType feature tag must be ASCII, got: "${tag}"`);
      }
      return fbs.OpenTypeFeatureTag.createOpenTypeFeatureTag(
        builder,
        bytes[0]!,
        bytes[1]!,
        bytes[2]!,
        bytes[3]!
      );
    }

    /**
     * Converts an OpenTypeFeatureTag struct to a 4-character string tag.
     *
     * @param tag - OpenTypeFeatureTag struct from FlatBuffers
     * @returns 4-character OpenType feature tag string (e.g., "kern", "liga")
     */
    export function openTypeFeatureTagToString(
      tag: fbs.OpenTypeFeatureTag
    ): string {
      const bytes = [tag.a(), tag.b(), tag.c(), tag.d()];
      return new TextDecoder("ascii").decode(new Uint8Array(bytes));
    }
  }

  /**
   * Styling-related enum mappers (text, stroke, blend mode).
   */
  export namespace styling {
    export namespace encode {
      export const textAlign = (
        align: cg.TextAlign | undefined
      ): fbs.TextAlign =>
        enums.TEXT_ALIGN_ENCODE.get(align) ?? fbs.TextAlign.Left;

      export const textAlignVertical = (
        align: cg.TextAlignVertical | undefined
      ): fbs.TextAlignVertical =>
        enums.TEXT_ALIGN_VERTICAL_ENCODE.get(align) ??
        fbs.TextAlignVertical.Top;

      export const strokeCap = (cap: cg.StrokeCap | undefined): fbs.StrokeCap =>
        enums.STROKE_CAP_ENCODE.get(cap) ?? fbs.StrokeCap.Butt;

      export const strokeJoin = (
        join: cg.StrokeJoin | undefined
      ): fbs.StrokeJoin =>
        enums.STROKE_JOIN_ENCODE.get(join) ?? fbs.StrokeJoin.Miter;

      export const textDecorationLine = (
        line: cg.TextDecorationLine | undefined
      ): fbs.TextDecorationLine =>
        enums.TEXT_DECORATION_LINE_ENCODE.get(line) ??
        fbs.TextDecorationLine.None;

      export const blendMode = (
        mode: cg.BlendMode | undefined
      ): fbs.BlendMode =>
        enums.BLEND_MODE_ENCODE.get(mode) ?? fbs.BlendMode.Normal;
    }

    export namespace decode {
      export const textAlign = (align: fbs.TextAlign): cg.TextAlign =>
        enums.TEXT_ALIGN_DECODE.get(align) ?? "left";

      export const textAlignVertical = (
        align: fbs.TextAlignVertical
      ): cg.TextAlignVertical =>
        enums.TEXT_ALIGN_VERTICAL_DECODE.get(align) ?? "top";

      export const strokeCap = (cap: fbs.StrokeCap): cg.StrokeCap =>
        enums.STROKE_CAP_DECODE.get(cap) ?? "butt";

      export const strokeJoin = (join: fbs.StrokeJoin): cg.StrokeJoin =>
        enums.STROKE_JOIN_DECODE.get(join) ?? "miter";

      export const textDecorationLine = (
        line: fbs.TextDecorationLine
      ): cg.TextDecorationLine =>
        enums.TEXT_DECORATION_LINE_DECODE.get(line) ?? "none";

      export const blendMode = (mode: fbs.BlendMode): cg.BlendMode =>
        enums.BLEND_MODE_DECODE.get(mode) ?? "normal";
    }
  }

  /**
   * Node ID utilities for packing/unpacking between TS string IDs and FlatBuffers u32.
   */
  export namespace node {
    // TODO: Update to use packed u32 (actor:8 | counter:24) for better performance
    // Current implementation uses string IDs to match TS editor model
    export function packId(id: grida.id.NodeIdentifier): string {
      return id; // Pass through string ID
    }

    export function unpackId(id: string): grida.id.NodeIdentifier {
      return id; // Pass through string ID
    }

    export namespace encode {
      /**
       * Encodes node type from TS to FlatBuffers enum.
       */
      export function type(node: grida.program.nodes.Node): fbs.NodeType {
        return enums.NODE_TYPE_ENCODE.get(node.type) ?? fbs.NodeType.Exception;
      }

      /**
       * Node data encoding functions, one per node type.
       */
      export namespace nodeData {
        /**
         * Encodes TextSpanNodeProperties.
         */
        export function text(
          builder: Builder,
          node: grida.program.nodes.TextNode
        ): { dataOffset: flatbuffers.Offset } {
          // Create string offset BEFORE starting nested table
          let textOffset: flatbuffers.Offset | null = null;
          if (node.text !== null && node.text !== undefined) {
            const textStr =
              typeof node.text === "string" ? node.text : String(node.text);
            textOffset = builder.createString(textStr);
          }

          // Create TextDecorationRec (innermost) BEFORE starting nested tables
          // RGBA32F struct must be created inline within TextDecorationRec context
          fbs.TextDecorationRec.startTextDecorationRec(builder);
          fbs.TextDecorationRec.addTextDecorationLine(
            builder,
            styling.encode.textDecorationLine(node.text_decoration_line)
          );
          // Create RGBA32F struct inline (black with alpha 1.0 as default)
          // Structs must be created inline within table context
          fbs.TextDecorationRec.addTextDecorationColor(
            builder,
            fbs.RGBA32F.createRGBA32F(
              builder,
              0.0, // r
              0.0, // g
              0.0, // b
              1.0 // a
            )
          );
          // Use defaults for other decoration fields
          fbs.TextDecorationRec.addTextDecorationStyle(
            builder,
            fbs.TextDecorationStyle.Solid
          );
          fbs.TextDecorationRec.addTextDecorationSkipInk(builder, true);
          fbs.TextDecorationRec.addTextDecorationThickness(builder, 1.0);
          const decorationOffset =
            fbs.TextDecorationRec.endTextDecorationRec(builder);

          // Encode font features BEFORE starting TextStyleRec
          let fontFeaturesOffset: flatbuffers.Offset | undefined = undefined;
          if (
            node.font_features &&
            Object.keys(node.font_features).length > 0
          ) {
            const fontFeatureOffsets: flatbuffers.Offset[] = [];
            // Process in reverse order (FlatBuffers requirement)
            const entries = Object.entries(node.font_features).reverse();
            for (const [tag, enabled] of entries) {
              if (enabled !== undefined) {
                const tagOffset = structs.openTypeFeatureTag(builder, tag);
                fontFeatureOffsets.push(
                  fbs.FontFeature.createFontFeature(builder, tagOffset, enabled)
                );
              }
            }
            if (fontFeatureOffsets.length > 0) {
              fontFeaturesOffset = fbs.TextStyleRec.createFontFeaturesVector(
                builder,
                fontFeatureOffsets
              );
            }
          }

          // Create required offsets BEFORE starting TextStyleRec
          // Add required font_family string (must be created before table)
          const fontFamilyOffset = builder.createString(node.font_family ?? "");

          // Create TextStyleRec (middle layer)
          fbs.TextStyleRec.startTextStyleRec(builder);
          fbs.TextStyleRec.addTextDecoration(builder, decorationOffset);
          fbs.TextStyleRec.addFontFamily(builder, fontFamilyOffset);
          // Add font properties
          if (node.font_size !== undefined && node.font_size !== null) {
            fbs.TextStyleRec.addFontSize(builder, node.font_size);
          }
          // Add required font_weight struct (must be created inline within table context)
          fbs.TextStyleRec.addFontWeight(
            builder,
            fbs.FontWeight.createFontWeight(
              builder,
              node.font_weight ?? 400 // default weight
            )
          );
          // Add required font_kerning (field 6)
          fbs.TextStyleRec.addFontKerning(builder, node.font_kerning ?? true);
          if (fontFeaturesOffset !== undefined) {
            fbs.TextStyleRec.addFontFeatures(builder, fontFeaturesOffset);
          }
          // Add required letter_spacing struct (field 10, must be created inline within table context)
          const letterSpacingValue = node.letter_spacing ?? 0;
          const letterSpacingKindEnum =
            letterSpacingValue !== 0
              ? fbs.TextLetterSpacingKind.Factor
              : fbs.TextLetterSpacingKind.Fixed;
          fbs.TextStyleRec.addLetterSpacing(
            builder,
            fbs.TextLetterSpacing.createTextLetterSpacing(
              builder,
              letterSpacingKindEnum,
              0, // fixed_value (not used when kind is Factor)
              letterSpacingValue // factor_value (em-based)
            )
          );
          const textStyleOffset = fbs.TextStyleRec.endTextStyleRec(builder);

          // Encode StrokeGeometryTrait BEFORE starting TextSpanNodeProperties
          // TextNode only has stroke_width from ITextStroke, not stroke_cap/stroke_join
          const strokeGeometryOffset = format.shape.encode.strokeGeometryTrait(
            builder,
            {
              stroke_width: node.stroke_width ?? 0,
            }
          );

          // Encode fill_paints and stroke_paints BEFORE starting TextSpanNodeProperties
          const fillPaintsFiltered = node.fill_paints?.filter(isPaint);
          const fillPaintsOffset = format.paint.encode.fillPaints(
            builder,
            fillPaintsFiltered,
            fbs.TextSpanNodeProperties.createFillPaintsVector
          );
          const strokePaintsFiltered = node.stroke_paints?.filter(isPaint);
          const strokePaintsOffset = format.paint.encode.strokePaints(
            builder,
            strokePaintsFiltered,
            fbs.TextSpanNodeProperties.createStrokePaintsVector
          );

          // Now start TextSpanNodeProperties (outermost)
          fbs.TextSpanNodeProperties.startTextSpanNodeProperties(builder);
          fbs.TextSpanNodeProperties.addStrokeGeometry(
            builder,
            strokeGeometryOffset
          );
          fbs.TextSpanNodeProperties.addFillPaints(builder, fillPaintsOffset);
          fbs.TextSpanNodeProperties.addStrokePaints(
            builder,
            strokePaintsOffset
          );
          if (textOffset !== null) {
            fbs.TextSpanNodeProperties.addText(builder, textOffset);
          }
          fbs.TextSpanNodeProperties.addTextStyle(builder, textStyleOffset);
          // Add text alignment
          fbs.TextSpanNodeProperties.addTextAlign(
            builder,
            styling.encode.textAlign(node.text_align)
          );
          fbs.TextSpanNodeProperties.addTextAlignVertical(
            builder,
            styling.encode.textAlignVertical(node.text_align_vertical)
          );
          if (node.max_lines !== undefined && node.max_lines !== null) {
            fbs.TextSpanNodeProperties.addMaxLines(builder, node.max_lines);
          }
          // ellipsis is not part of the TS TextNode interface yet, skip encoding
          const dataOffset =
            fbs.TextSpanNodeProperties.endTextSpanNodeProperties(builder);
          return { dataOffset };
        }
      }

      /**
       * Encodes SystemNodeTrait table (id, name, active, locked).
       */
      function encodeSystemNodeTrait(
        builder: Builder,
        node: grida.program.nodes.Node
      ): flatbuffers.Offset {
        const idOffset = structs.nodeIdentifier(builder, node.id);
        const nameOffset = builder.createString(node.name ?? "");

        fbs.SystemNodeTrait.startSystemNodeTrait(builder);
        fbs.SystemNodeTrait.addId(builder, idOffset);
        fbs.SystemNodeTrait.addName(builder, nameOffset);
        fbs.SystemNodeTrait.addActive(builder, node.active ?? true);
        fbs.SystemNodeTrait.addLocked(builder, node.locked ?? false);
        return fbs.SystemNodeTrait.endSystemNodeTrait(builder);
      }

      /**
       * Encodes LayerTrait table (used by BasicShapeNode and other nodes that use layer directly).
       * Note: id, name, active, locked are now in SystemNodeTrait, not LayerTrait.
       */
      function encodeLayerTrait(
        builder: Builder,
        node: grida.program.nodes.Node,
        parentReference: { parentId: string; position: string } | undefined,
        layoutOffset?: flatbuffers.Offset
      ): flatbuffers.Offset {
        // Encode blend_mode (LayerBlendMode includes PassThrough)
        // Default to PassThrough for LayerBlendMode (per schema comment)
        // Nodes don't have blend_mode directly - it's not part of the TS node model
        const blendMode: fbs.LayerBlendMode = fbs.LayerBlendMode.PassThrough;

        // Encode mask_type (LayerMaskType union)
        // Default to Image(Alpha) - create LayerMaskTypeImage
        fbs.LayerMaskTypeImage.startLayerMaskTypeImage(builder);
        fbs.LayerMaskTypeImage.addImageMaskType(
          builder,
          fbs.ImageMaskType.Alpha
        );
        const maskTypeOffset =
          fbs.LayerMaskTypeImage.endLayerMaskTypeImage(builder);

        // Encode effects
        let effectsOffset: flatbuffers.Offset | undefined = undefined;
        if (
          (node as any).fe_blur ||
          (node as any).fe_backdrop_blur ||
          (node as any).fe_shadows ||
          (node as any).fe_liquid_glass ||
          (node as any).fe_noises
        ) {
          effectsOffset = format.effects.encode.layerEffects(builder, {
            ...((node as any).fe_blur
              ? { fe_blur: (node as any).fe_blur }
              : {}),
            ...((node as any).fe_backdrop_blur
              ? { fe_backdrop_blur: (node as any).fe_backdrop_blur }
              : {}),
            ...((node as any).fe_shadows
              ? { fe_shadows: (node as any).fe_shadows }
              : {}),
            ...((node as any).fe_liquid_glass
              ? { fe_liquid_glass: (node as any).fe_liquid_glass }
              : {}),
            ...((node as any).fe_noises
              ? { fe_noises: (node as any).fe_noises }
              : {}),
          });
        }

        // Encode parent reference (optional)
        let parentReferenceOffset: flatbuffers.Offset | undefined = undefined;
        if (parentReference) {
          parentReferenceOffset = structs.parentReference(
            builder,
            parentReference.parentId,
            parentReference.position
          );
        }

        fbs.LayerTrait.startLayerTrait(builder);
        fbs.LayerTrait.addOpacity(builder, (node as any).opacity ?? 1.0);
        fbs.LayerTrait.addBlendMode(builder, blendMode);
        fbs.LayerTrait.addMaskTypeType(
          builder,
          fbs.LayerMaskType.LayerMaskTypeImage
        );
        fbs.LayerTrait.addMaskType(builder, maskTypeOffset);
        if (effectsOffset !== undefined) {
          fbs.LayerTrait.addEffects(builder, effectsOffset);
        }
        if (parentReferenceOffset !== undefined) {
          fbs.LayerTrait.addParent(builder, parentReferenceOffset);
        }
        // Create transform struct inline (must be done while table is being built)
        const transformOffset = structs.cgTransform2D(builder);
        fbs.LayerTrait.addRelativeTransformSnapshot(builder, transformOffset);
        if (layoutOffset) {
          fbs.LayerTrait.addLayout(builder, layoutOffset);
        }
        return fbs.LayerTrait.endLayerTrait(builder);
      }

      /**
       * Encodes a complete typed node table (e.g., SceneNode, RectangleNode).
       * Returns the node offset and node type enum.
       */
      export function node(
        builder: Builder,
        node: grida.program.nodes.Node,
        parentReference: { parentId: string; position: string } | undefined,
        layoutOffset?: flatbuffers.Offset
      ): { nodeType: fbs.Node; nodeOffset: flatbuffers.Offset } {
        let nodeType: fbs.Node;
        let nodeOffset: flatbuffers.Offset;

        // SceneNode is special - it doesn't use nodeCommon or data()
        if (node.type === "scene") {
          // SceneNode is special - it inlines all fields directly
          const sceneNode = node as grida.program.nodes.SceneNode;

          // Encode SystemNodeTrait
          const systemNodeTraitOffset = encodeSystemNodeTrait(
            builder,
            sceneNode
          );

          // Encode position field (must be created before ending SceneNode)
          const positionOffset =
            sceneNode.position !== undefined && sceneNode.position !== null
              ? builder.createString(sceneNode.position)
              : undefined;

          // Encode guides vector (table array)
          let guidesOffset: flatbuffers.Offset | undefined = undefined;
          if (sceneNode.guides && sceneNode.guides.length > 0) {
            const guideOffsets: flatbuffers.Offset[] = [];
            // Build from end to start (FlatBuffers requirement)
            for (let i = sceneNode.guides.length - 1; i >= 0; i--) {
              const guide = sceneNode.guides[i]!;
              // guide.axis is cmath.Axis which is "horizontal" | "vertical" string
              const axis =
                (guide.axis as string) === "vertical"
                  ? fbs.Axis.Vertical
                  : fbs.Axis.Horizontal;
              fbs.Guide2D.startGuide2D(builder);
              fbs.Guide2D.addAxis(builder, axis);
              fbs.Guide2D.addGuideOffset(builder, guide.offset ?? 0);
              guideOffsets.push(fbs.Guide2D.endGuide2D(builder));
            }
            guidesOffset = fbs.SceneNode.createGuidesVector(
              builder,
              guideOffsets
            );
          }

          // Encode edges vector (table array)
          let edgesOffset: flatbuffers.Offset | undefined = undefined;
          if (sceneNode.edges && sceneNode.edges.length > 0) {
            const edgeOffsets: flatbuffers.Offset[] = [];
            for (const edge of sceneNode.edges) {
              if (!edge) continue;

              // Encode edge point a
              let edgePointAOffset: flatbuffers.Offset | undefined = undefined;
              let edgePointAType: fbs.EdgePoint | undefined = undefined;
              if (edge.a) {
                if ("x" in edge.a && "y" in edge.a) {
                  // EdgePointPosition2D
                  fbs.EdgePointPosition2D.startEdgePointPosition2D(builder);
                  fbs.EdgePointPosition2D.addX(builder, edge.a.x ?? 0);
                  fbs.EdgePointPosition2D.addY(builder, edge.a.y ?? 0);
                  edgePointAOffset =
                    fbs.EdgePointPosition2D.endEdgePointPosition2D(builder);
                  edgePointAType = fbs.EdgePoint.EdgePointPosition2D;
                } else if ("target" in edge.a) {
                  // EdgePointNodeAnchor
                  const targetIdOffset = structs.nodeIdentifier(
                    builder,
                    edge.a.target
                  );
                  const anchor =
                    fbs.EdgePointNodeAnchor.createEdgePointNodeAnchor(
                      builder,
                      targetIdOffset
                    );
                  edgePointAOffset = anchor;
                  edgePointAType = fbs.EdgePoint.EdgePointNodeAnchor;
                }
              }

              // Encode edge point b
              let edgePointBOffset: flatbuffers.Offset | undefined = undefined;
              let edgePointBType: fbs.EdgePoint | undefined = undefined;
              if (edge.b) {
                if ("x" in edge.b && "y" in edge.b) {
                  // EdgePointPosition2D
                  fbs.EdgePointPosition2D.startEdgePointPosition2D(builder);
                  fbs.EdgePointPosition2D.addX(builder, edge.b.x ?? 0);
                  fbs.EdgePointPosition2D.addY(builder, edge.b.y ?? 0);
                  edgePointBOffset =
                    fbs.EdgePointPosition2D.endEdgePointPosition2D(builder);
                  edgePointBType = fbs.EdgePoint.EdgePointPosition2D;
                } else if ("target" in edge.b) {
                  // EdgePointNodeAnchor
                  const targetIdOffset = structs.nodeIdentifier(
                    builder,
                    edge.b.target
                  );
                  const anchor =
                    fbs.EdgePointNodeAnchor.createEdgePointNodeAnchor(
                      builder,
                      targetIdOffset
                    );
                  edgePointBOffset = anchor;
                  edgePointBType = fbs.EdgePoint.EdgePointNodeAnchor;
                }
              }

              // Create Edge2D table
              const edgeIdOffset = edge.id
                ? builder.createString(edge.id)
                : undefined;
              fbs.Edge2D.startEdge2D(builder);
              if (edgeIdOffset) {
                fbs.Edge2D.addId(builder, edgeIdOffset);
              }
              if (
                edgePointAOffset !== undefined &&
                edgePointAType !== undefined
              ) {
                fbs.Edge2D.addAType(builder, edgePointAType);
                fbs.Edge2D.addA(builder, edgePointAOffset);
              }
              if (
                edgePointBOffset !== undefined &&
                edgePointBType !== undefined
              ) {
                fbs.Edge2D.addBType(builder, edgePointBType);
                fbs.Edge2D.addB(builder, edgePointBOffset);
              }
              edgeOffsets.push(fbs.Edge2D.endEdge2D(builder));
            }

            if (edgeOffsets.length > 0) {
              edgesOffset = fbs.SceneNode.createEdgesVector(
                builder,
                edgeOffsets
              );
            }
          }

          // Encode constraints_children
          const constraints =
            sceneNode.constraints?.children === "single"
              ? fbs.SceneConstraintsChildren.Single
              : fbs.SceneConstraintsChildren.Multiple;

          // Start SceneNode and add all fields
          fbs.SceneNode.startSceneNode(builder);
          fbs.SceneNode.addNode(builder, systemNodeTraitOffset);
          fbs.SceneNode.addConstraintsChildren(builder, constraints);
          // Encode scene_background_color - create struct inline within SceneNode context
          if (
            sceneNode.background_color &&
            typeof sceneNode.background_color === "object" &&
            "r" in sceneNode.background_color &&
            "g" in sceneNode.background_color &&
            "b" in sceneNode.background_color &&
            "a" in sceneNode.background_color
          ) {
            const bgColor = sceneNode.background_color as cg.RGBA32F;
            const backgroundColorStruct = fbs.RGBA32F.createRGBA32F(
              builder,
              bgColor.r,
              bgColor.g,
              bgColor.b,
              bgColor.a
            );
            fbs.SceneNode.addSceneBackgroundColor(
              builder,
              backgroundColorStruct
            );
          }
          if (guidesOffset) {
            fbs.SceneNode.addGuides(builder, guidesOffset);
          }
          if (edgesOffset) {
            fbs.SceneNode.addEdges(builder, edgesOffset);
          }
          // Add position field (offset was created earlier)
          if (positionOffset !== undefined) {
            fbs.SceneNode.addPosition(builder, positionOffset);
          }
          nodeOffset = fbs.SceneNode.endSceneNode(builder);
          nodeType = fbs.Node.SceneNode;
          return { nodeType, nodeOffset };
        }

        // BasicShapeNode is special - it uses LayerTrait directly (rectangle, ellipse, polygon, star)
        if (
          node.type === "rectangle" ||
          node.type === "ellipse" ||
          node.type === "polygon" ||
          node.type === "star"
        ) {
          const shapeNode = node as
            | grida.program.nodes.RectangleNode
            | grida.program.nodes.EllipseNode
            | grida.program.nodes.RegularPolygonNode
            | grida.program.nodes.RegularStarPolygonNode;

          // Encode SystemNodeTrait
          const systemNodeTraitOffset = encodeSystemNodeTrait(
            builder,
            shapeNode
          );

          // Encode LayerTrait
          const layerOffset = encodeLayerTrait(
            builder,
            shapeNode,
            parentReference,
            layoutOffset
          );

          // Encode CanonicalLayerShape union
          const { type: shapeType, offset: shapeOffset } =
            format.shape.encode.minimalShape.minimalShape(
              builder,
              shapeNode.type,
              shapeNode
            );

          // Encode BasicShapeNodeType enum
          const basicShapeNodeType =
            enums.BASIC_SHAPE_NODE_TYPE_ENCODE.get(shapeNode.type) ??
            fbs.BasicShapeNodeType.Rectangle;

          // Helper to create StrokeStyle
          const dashArrayOffset = fbs.StrokeStyle.createStrokeDashArrayVector(
            builder,
            []
          );
          fbs.StrokeStyle.startStrokeStyle(builder);
          fbs.StrokeStyle.addStrokeCap(
            builder,
            styling.encode.strokeCap(shapeNode.stroke_cap)
          );
          fbs.StrokeStyle.addStrokeJoin(
            builder,
            styling.encode.strokeJoin(shapeNode.stroke_join)
          );
          fbs.StrokeStyle.addStrokeAlign(builder, fbs.StrokeAlign.Inside);
          fbs.StrokeStyle.addStrokeMiterLimit(builder, 4.0);
          fbs.StrokeStyle.addStrokeDashArray(builder, dashArrayOffset);
          const strokeStyleOffset = fbs.StrokeStyle.endStrokeStyle(builder);

          // Encode paints as PaintStackItem arrays
          const fillPaintsFiltered = shapeNode.fill_paints?.filter(isPaint);
          const fillPaintsOffset = format.paint.encode.fillPaints(
            builder,
            fillPaintsFiltered,
            fbs.BasicShapeNode.createFillPaintsVector
          );
          const strokePaintsFiltered = shapeNode.stroke_paints?.filter(isPaint);
          const strokePaintsOffset = format.paint.encode.strokePaints(
            builder,
            strokePaintsFiltered,
            fbs.BasicShapeNode.createStrokePaintsVector
          );

          // Create VariableWidthProfile (empty for now - nodes don't have this in TS model)
          const emptyStopsOffset = fbs.VariableWidthProfile.createStopsVector(
            builder,
            []
          );
          fbs.VariableWidthProfile.startVariableWidthProfile(builder);
          fbs.VariableWidthProfile.addStops(builder, emptyStopsOffset);
          const strokeWidthProfileOffset =
            fbs.VariableWidthProfile.endVariableWidthProfile(builder);

          // Encode corner_radius and rectangular properties
          // For rectangle, use rectangular_corner_radius; for others, use corner_radius
          const cornerRadius =
            shapeNode.type === "rectangle"
              ? ((shapeNode as grida.program.nodes.RectangleNode)
                  .rectangular_corner_radius_top_left ?? 0)
              : ((
                  shapeNode as
                    | grida.program.nodes.RegularPolygonNode
                    | grida.program.nodes.RegularStarPolygonNode
                ).corner_radius ?? 0);

          // Build BasicShapeNode
          fbs.BasicShapeNode.startBasicShapeNode(builder);
          fbs.BasicShapeNode.addNode(builder, systemNodeTraitOffset);
          fbs.BasicShapeNode.addLayer(builder, layerOffset);
          fbs.BasicShapeNode.addType(builder, basicShapeNodeType);
          fbs.BasicShapeNode.addShapeType(builder, shapeType);
          fbs.BasicShapeNode.addShape(builder, shapeOffset);
          fbs.BasicShapeNode.addCornerRadius(builder, cornerRadius);
          if (
            "corner_smoothing" in shapeNode &&
            shapeNode.corner_smoothing !== undefined
          ) {
            fbs.BasicShapeNode.addCornerSmoothing(
              builder,
              shapeNode.corner_smoothing
            );
          }
          fbs.BasicShapeNode.addFillPaints(builder, fillPaintsOffset);
          fbs.BasicShapeNode.addStrokeStyle(builder, strokeStyleOffset);
          fbs.BasicShapeNode.addStrokeWidth(
            builder,
            shapeNode.stroke_width ?? 0
          );
          fbs.BasicShapeNode.addStrokeWidthProfile(
            builder,
            strokeWidthProfileOffset
          );
          // Create structs inline (must be done while table is being built)
          const rectangularCornerRadiusOffsetInline =
            shapeNode.type === "rectangle"
              ? fbs.RectangularCornerRadius.createRectangularCornerRadius(
                  builder,
                  (shapeNode as grida.program.nodes.RectangleNode)
                    .rectangular_corner_radius_top_left ?? 0, // tl_rx
                  (shapeNode as grida.program.nodes.RectangleNode)
                    .rectangular_corner_radius_top_left ?? 0, // tl_ry
                  (shapeNode as grida.program.nodes.RectangleNode)
                    .rectangular_corner_radius_top_right ?? 0, // tr_rx
                  (shapeNode as grida.program.nodes.RectangleNode)
                    .rectangular_corner_radius_top_right ?? 0, // tr_ry
                  (shapeNode as grida.program.nodes.RectangleNode)
                    .rectangular_corner_radius_bottom_left ?? 0, // bl_rx
                  (shapeNode as grida.program.nodes.RectangleNode)
                    .rectangular_corner_radius_bottom_left ?? 0, // bl_ry
                  (shapeNode as grida.program.nodes.RectangleNode)
                    .rectangular_corner_radius_bottom_right ?? 0, // br_rx
                  (shapeNode as grida.program.nodes.RectangleNode)
                    .rectangular_corner_radius_bottom_right ?? 0 // br_ry
                )
              : fbs.RectangularCornerRadius.createRectangularCornerRadius(
                  builder,
                  0,
                  0,
                  0,
                  0,
                  0,
                  0,
                  0,
                  0
                );
          fbs.BasicShapeNode.addRectangularCornerRadius(
            builder,
            rectangularCornerRadiusOffsetInline
          );
          const rectangularStrokeWidthOffsetInline =
            shapeNode.type === "rectangle"
              ? fbs.RectangularStrokeWidth.createRectangularStrokeWidth(
                  builder,
                  (shapeNode as grida.program.nodes.RectangleNode)
                    .rectangular_stroke_width_top ?? 0,
                  (shapeNode as grida.program.nodes.RectangleNode)
                    .rectangular_stroke_width_right ?? 0,
                  (shapeNode as grida.program.nodes.RectangleNode)
                    .rectangular_stroke_width_bottom ?? 0,
                  (shapeNode as grida.program.nodes.RectangleNode)
                    .rectangular_stroke_width_left ?? 0
                )
              : fbs.RectangularStrokeWidth.createRectangularStrokeWidth(
                  builder,
                  0,
                  0,
                  0,
                  0
                );
          fbs.BasicShapeNode.addRectangularStrokeWidth(
            builder,
            rectangularStrokeWidthOffsetInline
          );
          fbs.BasicShapeNode.addStrokePaints(builder, strokePaintsOffset);
          nodeOffset = fbs.BasicShapeNode.endBasicShapeNode(builder);
          nodeType = fbs.Node.BasicShapeNode;
          return { nodeType, nodeOffset };
        }

        // For all other node types, use SystemNodeTrait and LayerTrait and encode fields directly
        const systemNodeTraitOffset = encodeSystemNodeTrait(builder, node);
        const layerOffset = encodeLayerTrait(
          builder,
          node,
          parentReference,
          layoutOffset
        );

        switch (node.type) {
          case "container": {
            const containerNode = node as grida.program.nodes.ContainerNode;

            // Encode traits and paints
            const strokeGeometryOffset =
              format.shape.encode.rectangularStrokeGeometryTrait(builder, {
                stroke_cap: containerNode.stroke_cap,
                stroke_join: containerNode.stroke_join,
                rectangular_stroke_width_top:
                  containerNode.rectangular_stroke_width_top,
                rectangular_stroke_width_right:
                  containerNode.rectangular_stroke_width_right,
                rectangular_stroke_width_bottom:
                  containerNode.rectangular_stroke_width_bottom,
                rectangular_stroke_width_left:
                  containerNode.rectangular_stroke_width_left,
              });
            const cornerRadiusOffset =
              format.shape.encode.rectangularCornerRadiusTrait(builder, {
                rectangular_corner_radius_top_left:
                  containerNode.rectangular_corner_radius_top_left,
                rectangular_corner_radius_top_right:
                  containerNode.rectangular_corner_radius_top_right,
                rectangular_corner_radius_bottom_left:
                  containerNode.rectangular_corner_radius_bottom_left,
                rectangular_corner_radius_bottom_right:
                  containerNode.rectangular_corner_radius_bottom_right,
                corner_smoothing: containerNode.corner_smoothing,
              });
            const fillPaintsFiltered =
              containerNode.fill_paints?.filter(isPaint);
            const fillPaintsOffset = format.paint.encode.fillPaints(
              builder,
              fillPaintsFiltered,
              fbs.ContainerNode.createFillPaintsVector
            );
            const strokePaintsFiltered =
              containerNode.stroke_paints?.filter(isPaint);
            const strokePaintsOffset = format.paint.encode.strokePaints(
              builder,
              strokePaintsFiltered,
              fbs.ContainerNode.createStrokePaintsVector
            );

            fbs.ContainerNode.startContainerNode(builder);
            fbs.ContainerNode.addNode(builder, systemNodeTraitOffset);
            fbs.ContainerNode.addLayer(builder, layerOffset);
            fbs.ContainerNode.addStrokeGeometry(builder, strokeGeometryOffset);
            fbs.ContainerNode.addCornerRadius(builder, cornerRadiusOffset);
            fbs.ContainerNode.addFillPaints(builder, fillPaintsOffset);
            fbs.ContainerNode.addStrokePaints(builder, strokePaintsOffset);
            fbs.ContainerNode.addClipsContent(
              builder,
              (containerNode as any).clips_content ?? false
            );
            nodeOffset = fbs.ContainerNode.endContainerNode(builder);
            nodeType = fbs.Node.ContainerNode;
            break;
          }
          case "line": {
            const lineNode = node as grida.program.nodes.LineNode;

            // Encode traits and paints
            const strokeGeometryOffset =
              format.shape.encode.strokeGeometryTrait(builder, {
                stroke_width: lineNode.stroke_width,
                stroke_cap: lineNode.stroke_cap,
                stroke_join: lineNode.stroke_join,
              });
            const strokePaintsFiltered =
              lineNode.stroke_paints?.filter(isPaint);
            const strokePaintsOffset = format.paint.encode.strokePaints(
              builder,
              strokePaintsFiltered,
              fbs.LineNode.createStrokePaintsVector
            );

            fbs.LineNode.startLineNode(builder);
            fbs.LineNode.addNode(builder, systemNodeTraitOffset);
            fbs.LineNode.addLayer(builder, layerOffset);
            fbs.LineNode.addStrokeGeometry(builder, strokeGeometryOffset);
            fbs.LineNode.addStrokePaints(builder, strokePaintsOffset);
            nodeOffset = fbs.LineNode.endLineNode(builder);
            nodeType = fbs.Node.LineNode;
            break;
          }
          case "text": {
            const textNode = node as grida.program.nodes.TextNode;
            const propertiesOffset = format.node.encode.nodeData.text(
              builder,
              textNode
            ).dataOffset;

            fbs.TextSpanNode.startTextSpanNode(builder);
            fbs.TextSpanNode.addNode(builder, systemNodeTraitOffset);
            fbs.TextSpanNode.addLayer(builder, layerOffset);
            fbs.TextSpanNode.addProperties(builder, propertiesOffset);
            nodeOffset = fbs.TextSpanNode.endTextSpanNode(builder);
            nodeType = fbs.Node.TextSpanNode;
            break;
          }
          case "vector": {
            const vectorNode = node as grida.program.nodes.VectorNode;

            // Encode traits and paints
            const strokeGeometryOffset =
              format.shape.encode.strokeGeometryTrait(builder, {
                stroke_width: vectorNode.stroke_width,
                stroke_cap: vectorNode.stroke_cap,
                stroke_join: vectorNode.stroke_join,
              });
            const cornerRadiusOffset = format.shape.encode.cornerRadiusTrait(
              builder,
              {
                corner_radius: vectorNode.corner_radius,
                corner_smoothing: (vectorNode as any).corner_smoothing,
              }
            );
            const fillPaintsFiltered = vectorNode.fill_paints?.filter(isPaint);
            const fillPaintsOffset = format.paint.encode.fillPaints(
              builder,
              fillPaintsFiltered,
              fbs.VectorNode.createFillPaintsVector
            );
            const strokePaintsFiltered =
              vectorNode.stroke_paints?.filter(isPaint);
            const strokePaintsOffset = format.paint.encode.strokePaints(
              builder,
              strokePaintsFiltered,
              fbs.VectorNode.createStrokePaintsVector
            );
            const vectorNetworkOffset = format.vector.encode.vectorNetwork(
              builder,
              vectorNode.vector_network
            );

            fbs.VectorNode.startVectorNode(builder);
            fbs.VectorNode.addNode(builder, systemNodeTraitOffset);
            fbs.VectorNode.addLayer(builder, layerOffset);
            fbs.VectorNode.addStrokeGeometry(builder, strokeGeometryOffset);
            fbs.VectorNode.addStrokePaints(builder, strokePaintsOffset);
            fbs.VectorNode.addCornerRadius(builder, cornerRadiusOffset);
            fbs.VectorNode.addFillPaints(builder, fillPaintsOffset);
            fbs.VectorNode.addVectorNetworkData(builder, vectorNetworkOffset);
            nodeOffset = fbs.VectorNode.endVectorNode(builder);
            nodeType = fbs.Node.VectorNode;
            break;
          }
          case "boolean": {
            const booleanNode =
              node as grida.program.nodes.BooleanPathOperationNode;

            // Encode traits and paints
            const strokeGeometryOffset =
              format.shape.encode.strokeGeometryTrait(builder, {
                stroke_width: booleanNode.stroke_width,
                stroke_cap: booleanNode.stroke_cap,
                stroke_join: booleanNode.stroke_join,
              });
            const cornerRadiusOffset = format.shape.encode.cornerRadiusTrait(
              builder,
              {
                corner_radius: booleanNode.corner_radius,
                corner_smoothing: (booleanNode as any).corner_smoothing,
              }
            );
            const fillPaintsFiltered = booleanNode.fill_paints?.filter(isPaint);
            const fillPaintsOffset = format.paint.encode.fillPaints(
              builder,
              fillPaintsFiltered,
              fbs.BooleanOperationNode.createFillPaintsVector
            );
            const strokePaintsFiltered =
              booleanNode.stroke_paints?.filter(isPaint);
            const strokePaintsOffset = format.paint.encode.strokePaints(
              builder,
              strokePaintsFiltered,
              fbs.BooleanOperationNode.createStrokePaintsVector
            );
            let op: fbs.BooleanPathOperation = fbs.BooleanPathOperation.Union;
            if (booleanNode.op === "intersection")
              op = fbs.BooleanPathOperation.Intersection;
            else if (booleanNode.op === "difference")
              op = fbs.BooleanPathOperation.Difference;
            else if (booleanNode.op === "xor")
              op = fbs.BooleanPathOperation.Xor;

            fbs.BooleanOperationNode.startBooleanOperationNode(builder);
            fbs.BooleanOperationNode.addNode(builder, systemNodeTraitOffset);
            fbs.BooleanOperationNode.addLayer(builder, layerOffset);
            fbs.BooleanOperationNode.addOp(builder, op);
            fbs.BooleanOperationNode.addCornerRadius(
              builder,
              cornerRadiusOffset
            );
            fbs.BooleanOperationNode.addFillPaints(builder, fillPaintsOffset);
            fbs.BooleanOperationNode.addStrokeGeometry(
              builder,
              strokeGeometryOffset
            );
            fbs.BooleanOperationNode.addStrokePaints(
              builder,
              strokePaintsOffset
            );
            nodeOffset =
              fbs.BooleanOperationNode.endBooleanOperationNode(builder);
            nodeType = fbs.Node.BooleanOperationNode;
            break;
          }
          case "group":
          case "image": {
            // ImageNode is not in the union, encode as GroupNode
            fbs.GroupNode.startGroupNode(builder);
            fbs.GroupNode.addNode(builder, systemNodeTraitOffset);
            fbs.GroupNode.addLayer(builder, layerOffset);
            nodeOffset = fbs.GroupNode.endGroupNode(builder);
            nodeType = fbs.Node.GroupNode;
            break;
          }
          default: {
            // Fallback to UnknownNode (only has SystemNodeTrait, no layer)
            fbs.UnknownNode.startUnknownNode(builder);
            fbs.UnknownNode.addNode(builder, systemNodeTraitOffset);
            nodeOffset = fbs.UnknownNode.endUnknownNode(builder);
            nodeType = fbs.Node.UnknownNode;
            break;
          }
        }

        return { nodeType, nodeOffset };
      }
    }

    export namespace decode {
      /**
       * Decodes node type from FlatBuffers enum to TS string.
       */
      export function type(
        fbType: fbs.NodeType
      ): grida.program.nodes.Node["type"] {
        return enums.NODE_TYPE_DECODE.get(fbType) ?? "group";
      }
    }
  }

  /**
   * Paint encoding/decoding for fills, strokes, and gradients.
   */
  export namespace paint {
    export namespace encode {
      /**
       * Paint encoding functions, one per paint type.
       */
      export namespace paintTypes {
        /**
         * Encodes SolidPaint.
         */
        export function solid(
          builder: Builder,
          paint: cg.SolidPaint
        ): { type: fbs.Paint; offset: flatbuffers.Offset } {
          // Structs must be created inline within table context
          fbs.SolidPaint.startSolidPaint(builder);
          fbs.SolidPaint.addActive(builder, paint.active ?? true);
          // Create RGBA32F struct inline within SolidPaint context
          fbs.SolidPaint.addColor(
            builder,
            structs.rgba32f(builder, paint.color)
          );
          fbs.SolidPaint.addBlendMode(
            builder,
            styling.encode.blendMode(paint.blend_mode)
          );
          const offset = fbs.SolidPaint.endSolidPaint(builder);
          return { type: fbs.Paint.SolidPaint, offset };
        }

        /**
         * Helper to encode gradient stops vector.
         */
        function encodeGradientStops(
          builder: Builder,
          stops: cg.GradientStop[],
          startVector: (builder: Builder, length: number) => void
        ): flatbuffers.Offset {
          startVector(builder, stops.length);
          for (let i = stops.length - 1; i >= 0; i--) {
            structs.gradientStop(builder, stops[i]!);
          }
          return builder.endVector();
        }

        /**
         * Generic helper to encode gradient paints (radial, sweep, diamond).
         */
        function encodeGradientPaint<T extends cg.GradientPaint>(
          builder: Builder,
          paint: T,
          config: {
            startStopsVector: (builder: Builder, length: number) => void;
            startPaint: (builder: Builder) => void;
            addTransform: (
              builder: Builder,
              offset: flatbuffers.Offset
            ) => void;
            addStops: (builder: Builder, offset: flatbuffers.Offset) => void;
            addOpacity: (builder: Builder, value: number) => void;
            addBlendMode: (builder: Builder, mode: fbs.BlendMode) => void;
            addActive: (builder: Builder, value: boolean) => void;
            addTileMode?: (builder: Builder, mode: fbs.TileMode) => void;
            endPaint: (builder: Builder) => flatbuffers.Offset;
            paintType: fbs.Paint;
          }
        ): { type: fbs.Paint; offset: flatbuffers.Offset } {
          const stopsOffset = encodeGradientStops(
            builder,
            paint.stops,
            config.startStopsVector
          );

          config.startPaint(builder);
          config.addActive(builder, paint.active ?? true);
          config.addTransform(
            builder,
            structs.transform(builder, paint.transform)
          );
          config.addStops(builder, stopsOffset);
          config.addOpacity(builder, paint.opacity ?? 1.0);
          config.addBlendMode(
            builder,
            styling.encode.blendMode(paint.blend_mode)
          );
          if (config.addTileMode) {
            config.addTileMode(builder, fbs.TileMode.Clamp);
          }
          const offset = config.endPaint(builder);
          return { type: config.paintType, offset };
        }

        /**
         * Encodes LinearGradientPaint.
         */
        export function linearGradient(
          builder: Builder,
          paint: cg.LinearGradientPaint
        ): { type: fbs.Paint; offset: flatbuffers.Offset } {
          // LinearGradientPaint has special xy1/xy2 fields, so handle separately
          const stopsOffset = encodeGradientStops(
            builder,
            paint.stops,
            (b, len) => fbs.LinearGradientPaint.startStopsVector(b, len)
          );

          fbs.LinearGradientPaint.startLinearGradientPaint(builder);
          fbs.LinearGradientPaint.addActive(builder, paint.active ?? true);
          fbs.LinearGradientPaint.addXy1(
            builder,
            structs.alignment(builder, 0, 0)
          );
          fbs.LinearGradientPaint.addXy2(
            builder,
            structs.alignment(builder, 1, 0)
          );
          fbs.LinearGradientPaint.addTileMode(builder, fbs.TileMode.Clamp);
          fbs.LinearGradientPaint.addTransform(
            builder,
            structs.transform(builder, paint.transform)
          );
          fbs.LinearGradientPaint.addStops(builder, stopsOffset);
          fbs.LinearGradientPaint.addOpacity(builder, paint.opacity ?? 1.0);
          fbs.LinearGradientPaint.addBlendMode(
            builder,
            styling.encode.blendMode(paint.blend_mode)
          );
          const offset =
            fbs.LinearGradientPaint.endLinearGradientPaint(builder);
          return { type: fbs.Paint.LinearGradientPaint, offset };
        }

        /**
         * Encodes RadialGradientPaint.
         */
        export function radialGradient(
          builder: Builder,
          paint: cg.RadialGradientPaint
        ): { type: fbs.Paint; offset: flatbuffers.Offset } {
          return encodeGradientPaint(builder, paint, {
            startStopsVector: (b, len) =>
              fbs.RadialGradientPaint.startStopsVector(b, len),
            startPaint: (b) =>
              fbs.RadialGradientPaint.startRadialGradientPaint(b),
            addTransform: (b, off) =>
              fbs.RadialGradientPaint.addTransform(b, off),
            addStops: (b, off) => fbs.RadialGradientPaint.addStops(b, off),
            addOpacity: (b, v) => fbs.RadialGradientPaint.addOpacity(b, v),
            addBlendMode: (b, m) => fbs.RadialGradientPaint.addBlendMode(b, m),
            addActive: (b, v) => fbs.RadialGradientPaint.addActive(b, v),
            addTileMode: (b, m) => fbs.RadialGradientPaint.addTileMode(b, m),
            endPaint: (b) => fbs.RadialGradientPaint.endRadialGradientPaint(b),
            paintType: fbs.Paint.RadialGradientPaint,
          });
        }

        /**
         * Encodes SweepGradientPaint.
         */
        export function sweepGradient(
          builder: Builder,
          paint: cg.SweepGradientPaint
        ): { type: fbs.Paint; offset: flatbuffers.Offset } {
          return encodeGradientPaint(builder, paint, {
            startStopsVector: (b, len) =>
              fbs.SweepGradientPaint.startStopsVector(b, len),
            startPaint: (b) =>
              fbs.SweepGradientPaint.startSweepGradientPaint(b),
            addTransform: (b, off) =>
              fbs.SweepGradientPaint.addTransform(b, off),
            addStops: (b, off) => fbs.SweepGradientPaint.addStops(b, off),
            addOpacity: (b, v) => fbs.SweepGradientPaint.addOpacity(b, v),
            addBlendMode: (b, m) => fbs.SweepGradientPaint.addBlendMode(b, m),
            addActive: (b, v) => fbs.SweepGradientPaint.addActive(b, v),
            endPaint: (b) => fbs.SweepGradientPaint.endSweepGradientPaint(b),
            paintType: fbs.Paint.SweepGradientPaint,
          });
        }

        /**
         * Encodes DiamondGradientPaint.
         */
        export function diamondGradient(
          builder: Builder,
          paint: cg.DiamondGradientPaint
        ): { type: fbs.Paint; offset: flatbuffers.Offset } {
          return encodeGradientPaint(builder, paint, {
            startStopsVector: (b, len) =>
              fbs.DiamondGradientPaint.startStopsVector(b, len),
            startPaint: (b) =>
              fbs.DiamondGradientPaint.startDiamondGradientPaint(b),
            addTransform: (b, off) =>
              fbs.DiamondGradientPaint.addTransform(b, off),
            addStops: (b, off) => fbs.DiamondGradientPaint.addStops(b, off),
            addOpacity: (b, v) => fbs.DiamondGradientPaint.addOpacity(b, v),
            addBlendMode: (b, m) => fbs.DiamondGradientPaint.addBlendMode(b, m),
            addActive: (b, v) => fbs.DiamondGradientPaint.addActive(b, v),
            endPaint: (b) =>
              fbs.DiamondGradientPaint.endDiamondGradientPaint(b),
            paintType: fbs.Paint.DiamondGradientPaint,
          });
        }

        /**
         * Encodes ImagePaint.
         */
        export function image(
          builder: Builder,
          paint: cg.ImagePaint
        ): { type: fbs.Paint; offset: flatbuffers.Offset } {
          // ImagePaint is complex - for now, create a placeholder
          // TODO: Implement full ImagePaint encoding (ResourceRef, ImagePaintFit, filters)
          // Create ResourceRefRID with src string
          const srcOffset = builder.createString(paint.src);
          fbs.ResourceRefRID.startResourceRefRID(builder);
          fbs.ResourceRefRID.addRid(builder, srcOffset);
          const resourceRefOffset =
            fbs.ResourceRefRID.endResourceRefRID(builder);

          // Create ImagePaintFit based on fit type
          let fitType: fbs.ImagePaintFit;
          let fitOffset: flatbuffers.Offset;
          if (paint.fit === "transform" && paint.transform) {
            // Structs must be created inline within table context
            fbs.ImagePaintFitTransform.startImagePaintFitTransform(builder);
            // Create CGTransform2D struct inline within ImagePaintFitTransform context
            fbs.ImagePaintFitTransform.addTransform(
              builder,
              structs.transform(builder, paint.transform)
            );
            fitOffset =
              fbs.ImagePaintFitTransform.endImagePaintFitTransform(builder);
            fitType = fbs.ImagePaintFit.ImagePaintFitTransform;
          } else if (paint.fit === "tile") {
            const scale = paint.scale ?? 1.0;
            const tileOffset = fbs.ImageTile.createImageTile(
              builder,
              scale,
              fbs.ImageRepeat.Repeat
            );
            fbs.ImagePaintFitTile.startImagePaintFitTile(builder);
            fbs.ImagePaintFitTile.addTile(builder, tileOffset);
            fitOffset = fbs.ImagePaintFitTile.endImagePaintFitTile(builder);
            fitType = fbs.ImagePaintFit.ImagePaintFitTile;
          } else {
            // BoxFit cases: contain, cover, fill, none
            const boxFit =
              enums.BOX_FIT_ENCODE.get(paint.fit as cg.BoxFit) ??
              fbs.BoxFit.Cover;
            fbs.ImagePaintFitFit.startImagePaintFitFit(builder);
            fbs.ImagePaintFitFit.addBoxFit(builder, boxFit);
            fitOffset = fbs.ImagePaintFitFit.endImagePaintFitFit(builder);
            fitType = fbs.ImagePaintFit.ImagePaintFitFit;
          }

          // Structs must be created inline within table context
          fbs.ImagePaint.startImagePaint(builder);
          fbs.ImagePaint.addActive(builder, paint.active ?? true);
          fbs.ImagePaint.addImageType(builder, fbs.ResourceRef.ResourceRefRID);
          fbs.ImagePaint.addImage(builder, resourceRefOffset);
          fbs.ImagePaint.addQuarterTurns(
            builder,
            (paint.quarter_turns ?? 0) & 0xff
          );
          // Create Alignment struct inline within ImagePaint context
          fbs.ImagePaint.addAlignement(
            builder,
            structs.alignment(builder, 0, 0)
          );
          fbs.ImagePaint.addFitType(builder, fitType);
          fbs.ImagePaint.addFit(builder, fitOffset);
          fbs.ImagePaint.addOpacity(builder, paint.opacity ?? 1.0);
          fbs.ImagePaint.addBlendMode(
            builder,
            styling.encode.blendMode(paint.blend_mode)
          );
          // Create ImageFilters struct inline within ImagePaint context
          fbs.ImagePaint.addFilters(
            builder,
            fbs.ImageFilters.createImageFilters(
              builder,
              paint.filters?.exposure ?? 0.0,
              paint.filters?.contrast ?? 0.0,
              paint.filters?.saturation ?? 0.0,
              paint.filters?.temperature ?? 0.0,
              paint.filters?.tint ?? 0.0,
              paint.filters?.highlights ?? 0.0,
              paint.filters?.shadows ?? 0.0
            )
          );
          const offset = fbs.ImagePaint.endImagePaint(builder);
          return { type: fbs.Paint.ImagePaint, offset };
        }
      }

      // Paint type registry for encoding (defined after all functions)
      const PAINT_ENCODE_REGISTRY = new Map<
        cg.Paint["type"],
        (
          builder: Builder,
          paint: cg.Paint
        ) => { type: fbs.Paint; offset: flatbuffers.Offset }
      >([
        ["solid", (b, p) => paintTypes.solid(b, p as cg.SolidPaint)],
        [
          "linear_gradient",
          (b, p) => paintTypes.linearGradient(b, p as cg.LinearGradientPaint),
        ],
        [
          "radial_gradient",
          (b, p) => paintTypes.radialGradient(b, p as cg.RadialGradientPaint),
        ],
        [
          "sweep_gradient",
          (b, p) => paintTypes.sweepGradient(b, p as cg.SweepGradientPaint),
        ],
        [
          "diamond_gradient",
          (b, p) => paintTypes.diamondGradient(b, p as cg.DiamondGradientPaint),
        ],
        ["image", (b, p) => paintTypes.image(b, p as cg.ImagePaint)],
      ]);

      /**
       * Encodes a Paint union.
       */
      export function paint(
        builder: Builder,
        paint: cg.Paint
      ): { type: fbs.Paint; offset: flatbuffers.Offset } {
        const encoder = PAINT_ENCODE_REGISTRY.get(paint.type);
        if (encoder) {
          return encoder(builder, paint);
        }
        // Fallback: create empty SolidPaint
        const transparentColor: cg.RGBA32F = {
          r: 0,
          g: 0,
          b: 0,
          a: 0,
        } as cg.RGBA32F;
        // Structs must be created inline within table context
        fbs.SolidPaint.startSolidPaint(builder);
        fbs.SolidPaint.addActive(builder, false);
        // Create RGBA32F struct inline within SolidPaint context
        fbs.SolidPaint.addColor(
          builder,
          structs.rgba32f(builder, transparentColor)
        );
        fbs.SolidPaint.addBlendMode(builder, fbs.BlendMode.Normal);
        const offset = fbs.SolidPaint.endSolidPaint(builder);
        return { type: fbs.Paint.SolidPaint, offset };
      }

      /**
       * Generic helper to encode paint arrays to PaintStackItem vector.
       */
      function encodePaints(
        builder: Builder,
        paints: cg.Paint[] | undefined,
        createVector: (
          builder: Builder,
          data: flatbuffers.Offset[]
        ) => flatbuffers.Offset
      ): flatbuffers.Offset {
        if (!paints || paints.length === 0) {
          return createVector(builder, []);
        }

        const stackItemOffsets: flatbuffers.Offset[] = [];
        for (const paint of paints) {
          const { type, offset } = format.paint.encode.paint(builder, paint);
          fbs.PaintStackItem.startPaintStackItem(builder);
          fbs.PaintStackItem.addPaintType(builder, type);
          fbs.PaintStackItem.addPaint(builder, offset);
          stackItemOffsets.push(fbs.PaintStackItem.endPaintStackItem(builder));
        }

        return createVector(builder, stackItemOffsets.reverse());
      }

      /**
       * Encodes fill_paints array to PaintStackItem vector.
       * @param createVector - Function to create the vector (e.g., fbs.RectangleNodeProperties.createFillPaintsVector)
       */
      export function fillPaints(
        builder: Builder,
        paints: cg.Paint[] | undefined,
        createVector: (
          builder: Builder,
          data: flatbuffers.Offset[]
        ) => flatbuffers.Offset
      ): flatbuffers.Offset {
        return encodePaints(builder, paints, createVector);
      }

      /**
       * Encodes stroke_paints array to PaintStackItem vector.
       * @param createVector - Function to create the vector (e.g., fbs.RectangleNodeProperties.createStrokePaintsVector)
       */
      export function strokePaints(
        builder: Builder,
        paints: cg.Paint[] | undefined,
        createVector: (
          builder: Builder,
          data: flatbuffers.Offset[]
        ) => flatbuffers.Offset
      ): flatbuffers.Offset {
        return encodePaints(builder, paints, createVector);
      }
    }

    export namespace decode {
      /**
       * Paint decoding functions, one per paint type.
       */
      export namespace paintTypes {
        /**
         * Decodes SolidPaint.
         */
        export function solid(paintValue: unknown): cg.SolidPaint {
          const solid = paintValue as fbs.SolidPaint;
          const color = solid.color();
          return {
            type: "solid",
            color: {
              r: color?.r() ?? 0,
              g: color?.g() ?? 0,
              b: color?.b() ?? 0,
              a: color?.a() ?? 0,
            } as cg.RGBA32F,
            blend_mode: styling.decode.blendMode(solid.blendMode()),
            active: solid.active(),
          } satisfies cg.SolidPaint;
        }

        /**
         * Helper to decode gradient stops.
         */
        function decodeGradientStops(paint: {
          stopsLength(): number;
          stops(index: number): fbs.GradientStop | null;
        }): cg.GradientStop[] {
          const stops: cg.GradientStop[] = [];
          const length = paint.stopsLength();
          for (let i = 0; i < length; i++) {
            const stop = paint.stops(i);
            if (stop) {
              const color = stop.stopColor();
              stops.push({
                offset: stop.stopOffset(),
                color: {
                  r: color?.r() ?? 0,
                  g: color?.g() ?? 0,
                  b: color?.b() ?? 0,
                  a: color?.a() ?? 0,
                } as cg.RGBA32F,
              });
            }
          }
          return stops;
        }

        /**
         * Helper to decode gradient transform.
         */
        function decodeGradientTransform(
          transform: fbs.CGTransform2D | null
        ): cg.AffineTransform {
          return transform
            ? [
                [transform.m00(), transform.m01(), transform.m02()],
                [transform.m10(), transform.m11(), transform.m12()],
              ]
            : [
                [1, 0, 0],
                [0, 1, 0],
              ];
        }

        /**
         * Generic helper to decode gradient paints.
         */
        function decodeGradientPaint<T extends cg.GradientPaint>(
          paintValue: {
            stopsLength(): number;
            stops(index: number): fbs.GradientStop | null;
            transform(): fbs.CGTransform2D | null;
            blendMode(): fbs.BlendMode;
            opacity(): number;
            active(): boolean;
          },
          type: T["type"]
        ): T {
          return {
            type,
            stops: decodeGradientStops(paintValue),
            transform: decodeGradientTransform(paintValue.transform()),
            blend_mode: styling.decode.blendMode(paintValue.blendMode()),
            opacity: paintValue.opacity(),
            active: paintValue.active(),
          } as T;
        }

        /**
         * Decodes LinearGradientPaint.
         */
        export function linearGradient(
          paintValue: unknown
        ): cg.LinearGradientPaint {
          return decodeGradientPaint(
            paintValue as fbs.LinearGradientPaint,
            "linear_gradient"
          );
        }

        /**
         * Decodes RadialGradientPaint.
         */
        export function radialGradient(
          paintValue: unknown
        ): cg.RadialGradientPaint {
          return decodeGradientPaint(
            paintValue as fbs.RadialGradientPaint,
            "radial_gradient"
          );
        }

        /**
         * Decodes SweepGradientPaint.
         */
        export function sweepGradient(
          paintValue: unknown
        ): cg.SweepGradientPaint {
          return decodeGradientPaint(
            paintValue as fbs.SweepGradientPaint,
            "sweep_gradient"
          );
        }

        /**
         * Decodes DiamondGradientPaint.
         */
        export function diamondGradient(
          paintValue: unknown
        ): cg.DiamondGradientPaint {
          return decodeGradientPaint(
            paintValue as fbs.DiamondGradientPaint,
            "diamond_gradient"
          );
        }

        /**
         * Decodes ImagePaint.
         */
        export function image(paintValue: unknown): cg.ImagePaint {
          // ImagePaint decoding is complex - for now return a placeholder
          // TODO: Implement full ImagePaint decoding (ResourceRef, ImagePaintFit, filters)
          const imagePaint = paintValue as fbs.ImagePaint;
          return {
            type: "image",
            src: "", // TODO: decode from ResourceRef
            fit: "cover",
            blend_mode: styling.decode.blendMode(imagePaint.blendMode()),
            opacity: imagePaint.opacity(),
            active: imagePaint.active(),
            filters: {
              exposure: imagePaint.filters()?.exposure() ?? 0.0,
              contrast: imagePaint.filters()?.contrast() ?? 0.0,
              saturation: imagePaint.filters()?.saturation() ?? 0.0,
              temperature: imagePaint.filters()?.temperature() ?? 0.0,
              tint: imagePaint.filters()?.tint() ?? 0.0,
              highlights: imagePaint.filters()?.highlights() ?? 0.0,
              shadows: imagePaint.filters()?.shadows() ?? 0.0,
            },
          } satisfies cg.ImagePaint;
        }
      }

      // Paint type registry for decoding (defined after all functions)
      const PAINT_DECODE_REGISTRY = new Map<
        fbs.Paint,
        (paintValue: unknown) => cg.Paint
      >([
        [fbs.Paint.SolidPaint, paintTypes.solid],
        [fbs.Paint.LinearGradientPaint, paintTypes.linearGradient],
        [fbs.Paint.RadialGradientPaint, paintTypes.radialGradient],
        [fbs.Paint.SweepGradientPaint, paintTypes.sweepGradient],
        [fbs.Paint.DiamondGradientPaint, paintTypes.diamondGradient],
        [fbs.Paint.ImagePaint, paintTypes.image],
      ]);

      /**
       * Decodes a Paint union to TS Paint.
       */
      export function paint(
        paintType: fbs.Paint,
        paintValue: unknown
      ): cg.Paint {
        const decoder = PAINT_DECODE_REGISTRY.get(paintType);
        if (decoder) {
          return decoder(paintValue);
        }
        // Fallback: transparent solid paint
        return {
          type: "solid",
          color: { r: 0, g: 0, b: 0, a: 0 } as cg.RGBA32F,
          blend_mode: "normal",
          active: false,
        } satisfies cg.SolidPaint;
      }

      /**
       * Generic helper to decode paint arrays from PaintStackItem vector.
       */
      function decodePaints(props: {
        length(): number;
        get(index: number): fbs.PaintStackItem | null;
      }): cg.Paint[] | undefined {
        const len = props.length();
        if (len === 0) {
          return undefined;
        }

        const paints: cg.Paint[] = [];
        for (let i = 0; i < len; i++) {
          const stackItem = props.get(i);
          if (stackItem) {
            const paintType = stackItem.paintType();
            const paintValue = unionToPaint(paintType, (obj: any) =>
              stackItem.paint(obj)
            );
            if (paintValue) {
              paints.push(format.paint.decode.paint(paintType, paintValue));
            }
          }
        }
        return paints.length > 0 ? paints : undefined;
      }

      /**
       * Decodes fill_paints array from PaintStackItem vector.
       */
      export function fillPaints(props: {
        fillPaintsLength(): number;
        fillPaints(
          index: number,
          obj?: fbs.PaintStackItem
        ): fbs.PaintStackItem | null;
      }): cg.Paint[] | undefined {
        return decodePaints({
          length: () => props.fillPaintsLength(),
          get: (i) => props.fillPaints(i),
        });
      }

      /**
       * Decodes stroke_paints array from PaintStackItem vector.
       */
      export function strokePaints(props: {
        strokePaintsLength(): number;
        strokePaints(
          index: number,
          obj?: fbs.PaintStackItem
        ): fbs.PaintStackItem | null;
      }): cg.Paint[] | undefined {
        return decodePaints({
          length: () => props.strokePaintsLength(),
          get: (i) => props.strokePaints(i),
        });
      }
    }
  }

  /**
   * Shape trait encoding/decoding (corner_radius, fill_paints, stroke_paints, stroke_style, stroke_width).
   */
  export namespace shape {
    export namespace encode {
      /**
       * Helper to create StrokeStyle table.
       */
      function createStrokeStyle(
        builder: Builder,
        strokeCap: cg.StrokeCap | undefined,
        strokeJoin: cg.StrokeJoin | undefined
      ): flatbuffers.Offset {
        const dashArrayOffset = fbs.StrokeStyle.createStrokeDashArrayVector(
          builder,
          []
        );
        fbs.StrokeStyle.startStrokeStyle(builder);
        fbs.StrokeStyle.addStrokeCap(
          builder,
          styling.encode.strokeCap(strokeCap)
        );
        fbs.StrokeStyle.addStrokeJoin(
          builder,
          styling.encode.strokeJoin(strokeJoin)
        );
        fbs.StrokeStyle.addStrokeAlign(builder, fbs.StrokeAlign.Inside);
        fbs.StrokeStyle.addStrokeMiterLimit(builder, 4.0);
        fbs.StrokeStyle.addStrokeDashArray(builder, dashArrayOffset);
        return fbs.StrokeStyle.endStrokeStyle(builder);
      }

      /**
       * Encodes StrokeGeometryTrait table.
       */
      export function strokeGeometryTrait(
        builder: Builder,
        node: Partial<{
          stroke_width?: number;
          stroke_cap?: cg.StrokeCap;
          stroke_join?: cg.StrokeJoin;
        }>
      ): flatbuffers.Offset {
        const strokeStyleOffset = createStrokeStyle(
          builder,
          node.stroke_cap,
          node.stroke_join
        );

        // Create VariableWidthProfile (empty for now)
        const emptyStopsOffset = fbs.VariableWidthProfile.createStopsVector(
          builder,
          []
        );
        fbs.VariableWidthProfile.startVariableWidthProfile(builder);
        fbs.VariableWidthProfile.addStops(builder, emptyStopsOffset);
        const strokeWidthProfileOffset =
          fbs.VariableWidthProfile.endVariableWidthProfile(builder);

        // Create StrokeGeometryTrait table
        fbs.StrokeGeometryTrait.startStrokeGeometryTrait(builder);
        fbs.StrokeGeometryTrait.addStrokeWidth(builder, node.stroke_width ?? 0);
        fbs.StrokeGeometryTrait.addStrokeStyle(builder, strokeStyleOffset);
        fbs.StrokeGeometryTrait.addStrokeWidthProfile(
          builder,
          strokeWidthProfileOffset
        );
        return fbs.StrokeGeometryTrait.endStrokeGeometryTrait(builder);
      }

      /**
       * Encodes RectangularStrokeGeometryTrait table.
       */
      export function rectangularStrokeGeometryTrait(
        builder: Builder,
        node: Partial<{
          stroke_cap?: cg.StrokeCap;
          stroke_join?: cg.StrokeJoin;
          rectangular_stroke_width_top?: number;
          rectangular_stroke_width_right?: number;
          rectangular_stroke_width_bottom?: number;
          rectangular_stroke_width_left?: number;
        }>
      ): flatbuffers.Offset {
        const strokeStyleOffset = createStrokeStyle(
          builder,
          node.stroke_cap,
          node.stroke_join
        );

        // Create VariableWidthProfile (empty for now)
        const emptyStopsOffset = fbs.VariableWidthProfile.createStopsVector(
          builder,
          []
        );
        fbs.VariableWidthProfile.startVariableWidthProfile(builder);
        fbs.VariableWidthProfile.addStops(builder, emptyStopsOffset);
        const strokeWidthProfileOffset =
          fbs.VariableWidthProfile.endVariableWidthProfile(builder);

        // Create RectangularStrokeWidth struct
        const rectangularStrokeWidthOffset =
          fbs.RectangularStrokeWidth.createRectangularStrokeWidth(
            builder,
            node.rectangular_stroke_width_top ?? 0,
            node.rectangular_stroke_width_right ?? 0,
            node.rectangular_stroke_width_bottom ?? 0,
            node.rectangular_stroke_width_left ?? 0
          );

        // Create RectangularStrokeGeometryTrait table
        fbs.RectangularStrokeGeometryTrait.startRectangularStrokeGeometryTrait(
          builder
        );
        fbs.RectangularStrokeGeometryTrait.addRectangularStrokeWidth(
          builder,
          rectangularStrokeWidthOffset
        );
        fbs.RectangularStrokeGeometryTrait.addStrokeStyle(
          builder,
          strokeStyleOffset
        );
        fbs.RectangularStrokeGeometryTrait.addStrokeWidthProfile(
          builder,
          strokeWidthProfileOffset
        );
        return fbs.RectangularStrokeGeometryTrait.endRectangularStrokeGeometryTrait(
          builder
        );
      }

      /**
       * Encodes RectangularCornerRadiusTrait table.
       */
      export function rectangularCornerRadiusTrait(
        builder: Builder,
        node: Partial<{
          rectangular_corner_radius_top_left?: number;
          rectangular_corner_radius_top_right?: number;
          rectangular_corner_radius_bottom_left?: number;
          rectangular_corner_radius_bottom_right?: number;
          corner_smoothing?: number;
        }>
      ): flatbuffers.Offset {
        // Create RectangularCornerRadius struct (flattened: tl_rx, tl_ry, tr_rx, tr_ry, bl_rx, bl_ry, br_rx, br_ry)
        const rectangularCornerRadiusOffset =
          fbs.RectangularCornerRadius.createRectangularCornerRadius(
            builder,
            node.rectangular_corner_radius_top_left ?? 0, // tl_rx
            node.rectangular_corner_radius_top_left ?? 0, // tl_ry
            node.rectangular_corner_radius_top_right ?? 0, // tr_rx
            node.rectangular_corner_radius_top_right ?? 0, // tr_ry
            node.rectangular_corner_radius_bottom_left ?? 0, // bl_rx
            node.rectangular_corner_radius_bottom_left ?? 0, // bl_ry
            node.rectangular_corner_radius_bottom_right ?? 0, // br_rx
            node.rectangular_corner_radius_bottom_right ?? 0 // br_ry
          );

        // Create RectangularCornerRadiusTrait table
        fbs.RectangularCornerRadiusTrait.startRectangularCornerRadiusTrait(
          builder
        );
        fbs.RectangularCornerRadiusTrait.addRectangularCornerRadius(
          builder,
          rectangularCornerRadiusOffset
        );
        fbs.RectangularCornerRadiusTrait.addCornerSmoothing(
          builder,
          node.corner_smoothing ?? 0
        );
        return fbs.RectangularCornerRadiusTrait.endRectangularCornerRadiusTrait(
          builder
        );
      }

      /**
       * Encodes CorerRadiusTrait table.
       */
      export function cornerRadiusTrait(
        builder: Builder,
        node: Partial<{
          corner_radius?: number;
          corner_smoothing?: number;
        }>
      ): flatbuffers.Offset {
        // Create CGRadius struct
        const cornerRadius = node.corner_radius ?? 0;
        const cornerRadiusStruct = fbs.CGRadius.createCGRadius(
          builder,
          cornerRadius,
          cornerRadius
        );

        // Create CorerRadiusTrait table
        fbs.CorerRadiusTrait.startCorerRadiusTrait(builder);
        fbs.CorerRadiusTrait.addCornerRadius(builder, cornerRadiusStruct);
        fbs.CorerRadiusTrait.addCornerSmoothing(
          builder,
          node.corner_smoothing ?? 0
        );
        return fbs.CorerRadiusTrait.endCorerRadiusTrait(builder);
      }

      /**
       * Encodes CanonicalLayerShape union variants.
       */
      export namespace minimalShape {
        /**
         * Encodes CanonicalShapeRectangular.
         * Note: width/height are no longer stored in the shape (they come from layout).
         */
        export function shapeRectangular(
          builder: Builder,
          width: number,
          height: number
        ): { type: fbs.CanonicalLayerShape; offset: flatbuffers.Offset } {
          fbs.CanonicalShapeRectangular.startCanonicalShapeRectangular(builder);
          const offset =
            fbs.CanonicalShapeRectangular.endCanonicalShapeRectangular(builder);
          return {
            type: fbs.CanonicalLayerShape.CanonicalShapeRectangular,
            offset,
          };
        }

        /**
         * Encodes CanonicalShapeElliptical.
         */
        export function shapeElliptical(
          builder: Builder,
          width: number,
          height: number,
          ringSectorData?: {
            inner_radius: number; // TS uses inner_radius (0-1)
            angle_offset: number; // TS uses angle_offset (degrees)
            angle: number; // TS uses angle (degrees)
          }
        ): { type: fbs.CanonicalLayerShape; offset: flatbuffers.Offset } {
          // Encode ring_sector_data (always encode it, even with defaults)
          fbs.CanonicalEllipticalShapeRingSectorParameters.startCanonicalEllipticalShapeRingSectorParameters(
            builder
          );
          fbs.CanonicalEllipticalShapeRingSectorParameters.addInnerRadiusRatio(
            builder,
            ringSectorData?.inner_radius ?? 0.0
          );
          fbs.CanonicalEllipticalShapeRingSectorParameters.addStartAngle(
            builder,
            ringSectorData?.angle_offset ?? 0.0
          );
          fbs.CanonicalEllipticalShapeRingSectorParameters.addAngle(
            builder,
            ringSectorData?.angle ?? 360.0
          );
          const ringSectorDataOffset =
            fbs.CanonicalEllipticalShapeRingSectorParameters.endCanonicalEllipticalShapeRingSectorParameters(
              builder
            );

          // Note: width/height are no longer stored in the shape (they come from layout).
          fbs.CanonicalShapeElliptical.startCanonicalShapeElliptical(builder);
          fbs.CanonicalShapeElliptical.addRingSectorData(
            builder,
            ringSectorDataOffset
          );
          const offset =
            fbs.CanonicalShapeElliptical.endCanonicalShapeElliptical(builder);
          return {
            type: fbs.CanonicalLayerShape.CanonicalShapeElliptical,
            offset,
          };
        }

        /**
         * Encodes CanonicalShapeRegularPolygon.
         * Note: width/height are no longer stored in the shape (they come from layout).
         */
        export function shapeRegularPolygon(
          builder: Builder,
          width: number,
          height: number,
          point_count: number
        ): { type: fbs.CanonicalLayerShape; offset: flatbuffers.Offset } {
          fbs.CanonicalShapeRegularPolygon.startCanonicalShapeRegularPolygon(
            builder
          );
          fbs.CanonicalShapeRegularPolygon.addPointCount(builder, point_count);
          const offset =
            fbs.CanonicalShapeRegularPolygon.endCanonicalShapeRegularPolygon(
              builder
            );
          return {
            type: fbs.CanonicalLayerShape.CanonicalShapeRegularPolygon,
            offset,
          };
        }

        /**
         * Encodes CanonicalShapeRegularStarPolygon.
         * Note: width/height are no longer stored in the shape (they come from layout).
         */
        export function shapeRegularStarPolygon(
          builder: Builder,
          width: number,
          height: number,
          point_count: number,
          inner_radius: number // TS uses inner_radius (0-1), schema uses inner_radius_ratio
        ): { type: fbs.CanonicalLayerShape; offset: flatbuffers.Offset } {
          fbs.CanonicalShapeRegularStarPolygon.startCanonicalShapeRegularStarPolygon(
            builder
          );
          fbs.CanonicalShapeRegularStarPolygon.addPointCount(
            builder,
            point_count
          );
          fbs.CanonicalShapeRegularStarPolygon.addInnerRadiusRatio(
            builder,
            inner_radius
          );
          const offset =
            fbs.CanonicalShapeRegularStarPolygon.endCanonicalShapeRegularStarPolygon(
              builder
            );
          return {
            type: fbs.CanonicalLayerShape.CanonicalShapeRegularStarPolygon,
            offset,
          };
        }

        /**
         * Main dispatch function to encode CanonicalLayerShape based on TS node type.
         */
        export function minimalShape(
          builder: Builder,
          nodeType: "rectangle" | "ellipse" | "polygon" | "star",
          node:
            | grida.program.nodes.RectangleNode
            | grida.program.nodes.EllipseNode
            | grida.program.nodes.RegularPolygonNode
            | grida.program.nodes.RegularStarPolygonNode
        ): { type: fbs.CanonicalLayerShape; offset: flatbuffers.Offset } {
          const width = typeof node.width === "number" ? node.width : 0;
          const height = typeof node.height === "number" ? node.height : 0;

          switch (nodeType) {
            case "rectangle":
              return shapeRectangular(builder, width, height);

            case "ellipse": {
              const ellipseNode = node as grida.program.nodes.EllipseNode;
              return shapeElliptical(builder, width, height, {
                inner_radius: ellipseNode.inner_radius ?? 0,
                angle_offset: ellipseNode.angle_offset ?? 0,
                angle: ellipseNode.angle ?? 360,
              });
            }

            case "polygon": {
              const polygonNode =
                node as grida.program.nodes.RegularPolygonNode;
              return shapeRegularPolygon(
                builder,
                width,
                height,
                polygonNode.point_count ?? 3
              );
            }

            case "star": {
              const starNode =
                node as grida.program.nodes.RegularStarPolygonNode;
              return shapeRegularStarPolygon(
                builder,
                width,
                height,
                starNode.point_count ?? 5,
                starNode.inner_radius ?? 0.5
              );
            }
          }
        }
      }
    }

    export namespace decode {
      /**
       * Helper to derive stroke_width from rectangular_stroke_width (uses maximum).
       */
      export function deriveStrokeWidth(shape: {
        rectangular_stroke_width_top: number;
        rectangular_stroke_width_right: number;
        rectangular_stroke_width_bottom: number;
        rectangular_stroke_width_left: number;
      }): number {
        return Math.max(
          shape.rectangular_stroke_width_top,
          shape.rectangular_stroke_width_right,
          shape.rectangular_stroke_width_bottom,
          shape.rectangular_stroke_width_left
        );
      }

      /**
       * Decodes RectangularStrokeGeometryTrait table.
       */
      export function rectangularStrokeGeometryTrait(
        trait: fbs.RectangularStrokeGeometryTrait | null
      ): {
        rectangular_stroke_width_top: number;
        rectangular_stroke_width_right: number;
        rectangular_stroke_width_bottom: number;
        rectangular_stroke_width_left: number;
        stroke_cap: cg.StrokeCap;
        stroke_join: cg.StrokeJoin;
      } {
        if (!trait) {
          return {
            rectangular_stroke_width_top: 0,
            rectangular_stroke_width_right: 0,
            rectangular_stroke_width_bottom: 0,
            rectangular_stroke_width_left: 0,
            stroke_cap: "butt",
            stroke_join: "miter",
          };
        }

        const strokeStyle = trait.strokeStyle();
        const cap = strokeStyle
          ? styling.decode.strokeCap(strokeStyle.strokeCap())
          : "butt";
        const join = strokeStyle
          ? styling.decode.strokeJoin(strokeStyle.strokeJoin())
          : "miter";

        const strokeWidth = trait.rectangularStrokeWidth();
        return {
          rectangular_stroke_width_top: strokeWidth?.strokeTopWidth() ?? 0,
          rectangular_stroke_width_right: strokeWidth?.strokeRightWidth() ?? 0,
          rectangular_stroke_width_bottom:
            strokeWidth?.strokeBottomWidth() ?? 0,
          rectangular_stroke_width_left: strokeWidth?.strokeLeftWidth() ?? 0,
          stroke_cap: cap,
          stroke_join: join,
        };
      }

      /**
       * Decodes RectangularCornerRadiusTrait table.
       */
      export function rectangularCornerRadiusTrait(
        trait: fbs.RectangularCornerRadiusTrait | null
      ): {
        rectangular_corner_radius_top_left: number;
        rectangular_corner_radius_top_right: number;
        rectangular_corner_radius_bottom_left: number;
        rectangular_corner_radius_bottom_right: number;
        corner_smoothing: number;
      } {
        if (!trait) {
          return {
            rectangular_corner_radius_top_left: 0,
            rectangular_corner_radius_top_right: 0,
            rectangular_corner_radius_bottom_left: 0,
            rectangular_corner_radius_bottom_right: 0,
            corner_smoothing: 0,
          };
        }

        const cornerRadius = trait.rectangularCornerRadius();
        return {
          rectangular_corner_radius_top_left: cornerRadius?.tl()?.rx() ?? 0,
          rectangular_corner_radius_top_right: cornerRadius?.tr()?.rx() ?? 0,
          rectangular_corner_radius_bottom_left: cornerRadius?.bl()?.rx() ?? 0,
          rectangular_corner_radius_bottom_right: cornerRadius?.br()?.rx() ?? 0,
          corner_smoothing: trait.cornerSmoothing() ?? 0,
        };
      }

      /**
       * Decodes StrokeGeometryTrait table.
       */
      export function strokeGeometryTrait(
        trait: fbs.StrokeGeometryTrait | null
      ): {
        stroke_width: number;
        stroke_cap: cg.StrokeCap;
        stroke_join: cg.StrokeJoin;
      } {
        if (!trait) {
          return {
            stroke_width: 0,
            stroke_cap: "butt",
            stroke_join: "miter",
          };
        }

        const strokeStyle = trait.strokeStyle();
        const cap = strokeStyle
          ? styling.decode.strokeCap(strokeStyle.strokeCap())
          : "butt";
        const join = strokeStyle
          ? styling.decode.strokeJoin(strokeStyle.strokeJoin())
          : "miter";

        return {
          stroke_width: trait.strokeWidth() ?? 0,
          stroke_cap: cap,
          stroke_join: join,
        };
      }

      /**
       * Decodes CorerRadiusTrait table.
       */
      export function cornerRadiusTrait(trait: fbs.CorerRadiusTrait | null): {
        corner_radius: number;
        corner_smoothing: number;
      } {
        if (!trait) {
          return {
            corner_radius: 0,
            corner_smoothing: 0,
          };
        }

        const cornerRadius = trait.cornerRadius();
        return {
          corner_radius: cornerRadius?.rx() ?? 0,
          corner_smoothing: trait.cornerSmoothing(),
        };
      }

      /**
       * Decodes CanonicalLayerShape union variants.
       */
      export namespace minimalShape {
        /**
         * Decodes CanonicalLayerShape union to TS node properties.
         * Note: width/height are no longer stored in shapes (they come from layout).
         */
        export function minimalShape(
          shapeType: fbs.CanonicalLayerShape,
          shapeValue: unknown
        ): {
          type: "rectangle" | "ellipse" | "polygon" | "star";
          // Shape-specific fields (width/height come from layout, not from shape)
          point_count?: number;
          inner_radius?: number; // For ellipse and star (mapped from inner_radius_ratio)
          angle_offset?: number; // For ellipse (mapped from start_angle)
          angle?: number; // For ellipse
        } {
          switch (shapeType) {
            case fbs.CanonicalLayerShape.CanonicalShapeRectangular: {
              return {
                type: "rectangle",
              };
            }

            case fbs.CanonicalLayerShape.CanonicalShapeElliptical: {
              const shape = shapeValue as fbs.CanonicalShapeElliptical;
              const ringSectorData = shape.ringSectorData();
              return {
                type: "ellipse",
                inner_radius: ringSectorData?.innerRadiusRatio() ?? 0, // Map inner_radius_ratio -> inner_radius
                angle_offset: ringSectorData?.startAngle() ?? 0, // Map start_angle -> angle_offset
                angle: ringSectorData?.angle() ?? 360,
              };
            }

            case fbs.CanonicalLayerShape.CanonicalShapeRegularPolygon: {
              const shape = shapeValue as fbs.CanonicalShapeRegularPolygon;
              return {
                type: "polygon",
                point_count: shape.pointCount() ?? 3,
              };
            }

            case fbs.CanonicalLayerShape.CanonicalShapeRegularStarPolygon: {
              const shape = shapeValue as fbs.CanonicalShapeRegularStarPolygon;
              return {
                type: "star",
                point_count: shape.pointCount() ?? 5,
                inner_radius: shape.innerRadiusRatio() ?? 0.5, // Map inner_radius_ratio -> inner_radius
              };
            }

            default:
              throw new Error(
                `Unsupported CanonicalLayerShape type: ${shapeType}`
              );
          }
        }
      }
    }
  }

  /**
   * Effects encoding/decoding.
   */
  export namespace effects {
    export namespace encode {
      /**
       * Encodes FeBlur to FlatBuffers FeBlur table.
       */
      function encodeFeBlur(
        builder: Builder,
        blur: cg.FeBlur
      ): flatbuffers.Offset {
        if (blur.type === "blur") {
          // Gaussian blur
          const gaussianRadius = blur.radius;
          // Create FeGaussianBlur table
          fbs.FeGaussianBlur.startFeGaussianBlur(builder);
          fbs.FeGaussianBlur.addRadius(builder, gaussianRadius);
          const gaussianOffset = fbs.FeGaussianBlur.endFeGaussianBlur(builder);

          // Create FeProgressiveBlur table (empty/default values)
          // Structs must be created inline within table context
          fbs.FeProgressiveBlur.startFeProgressiveBlur(builder);
          fbs.FeProgressiveBlur.addStart(
            builder,
            fbs.Alignment.createAlignment(builder, 0, 0)
          );
          fbs.FeProgressiveBlur.addEnd(
            builder,
            fbs.Alignment.createAlignment(builder, 0, 0)
          );
          fbs.FeProgressiveBlur.addRadius(builder, 0);
          fbs.FeProgressiveBlur.addRadius2(builder, 0);
          const progressiveOffset =
            fbs.FeProgressiveBlur.endFeProgressiveBlur(builder);

          // Create FeBlur table
          fbs.FeBlur.startFeBlur(builder);
          fbs.FeBlur.addKind(builder, fbs.FeBlurKind.Gaussian);
          fbs.FeBlur.addGaussian(builder, gaussianOffset);
          fbs.FeBlur.addProgressive(builder, progressiveOffset);
          return fbs.FeBlur.endFeBlur(builder);
        } else {
          // Progressive blur
          const progressive = blur as cg.FeProgressiveBlur;
          // Create FeGaussianBlur table (empty/default values)
          fbs.FeGaussianBlur.startFeGaussianBlur(builder);
          fbs.FeGaussianBlur.addRadius(builder, 0);
          const gaussianOffset = fbs.FeGaussianBlur.endFeGaussianBlur(builder);

          // Create FeProgressiveBlur table
          // Structs must be created inline within table context
          fbs.FeProgressiveBlur.startFeProgressiveBlur(builder);
          fbs.FeProgressiveBlur.addStart(
            builder,
            fbs.Alignment.createAlignment(
              builder,
              progressive.x1,
              progressive.y1
            )
          );
          fbs.FeProgressiveBlur.addEnd(
            builder,
            fbs.Alignment.createAlignment(
              builder,
              progressive.x2,
              progressive.y2
            )
          );
          fbs.FeProgressiveBlur.addRadius(builder, progressive.radius);
          fbs.FeProgressiveBlur.addRadius2(builder, progressive.radius2);
          const progressiveOffset =
            fbs.FeProgressiveBlur.endFeProgressiveBlur(builder);

          // Create FeBlur table
          fbs.FeBlur.startFeBlur(builder);
          fbs.FeBlur.addKind(builder, fbs.FeBlurKind.Progressive);
          fbs.FeBlur.addGaussian(builder, gaussianOffset);
          fbs.FeBlur.addProgressive(builder, progressiveOffset);
          return fbs.FeBlur.endFeBlur(builder);
        }
      }

      /**
       * Encodes FeLayerBlur to FlatBuffers FeLayerBlur table.
       */
      function encodeFeLayerBlur(
        builder: Builder,
        feLayerBlur: cg.FeLayerBlur
      ): flatbuffers.Offset {
        const blurOffset = encodeFeBlur(builder, feLayerBlur.blur);

        // Create FeLayerBlur table
        fbs.FeLayerBlur.startFeLayerBlur(builder);
        fbs.FeLayerBlur.addBlur(builder, blurOffset);
        fbs.FeLayerBlur.addActive(builder, feLayerBlur.active ?? true);
        return fbs.FeLayerBlur.endFeLayerBlur(builder);
      }

      /**
       * Encodes FeBackdropBlur to FlatBuffers FeBackdropBlur table.
       */
      function encodeFeBackdropBlur(
        builder: Builder,
        feBackdropBlur: cg.FeBackdropBlur
      ): flatbuffers.Offset {
        const blurOffset = encodeFeBlur(builder, feBackdropBlur.blur);

        // Create FeBackdropBlur table
        fbs.FeBackdropBlur.startFeBackdropBlur(builder);
        fbs.FeBackdropBlur.addBlur(builder, blurOffset);
        fbs.FeBackdropBlur.addActive(builder, feBackdropBlur.active ?? true);
        return fbs.FeBackdropBlur.endFeBackdropBlur(builder);
      }

      /**
       * Encodes FeShadow to FlatBuffers FilterShadowEffect table.
       */
      function encodeFeShadow(
        builder: Builder,
        shadow: cg.FeShadow,
        kind: fbs.FilterShadowEffectKind
      ): flatbuffers.Offset {
        // Create FeShadow table
        // Structs must be created inline within table context
        fbs.FeShadow.startFeShadow(builder);
        fbs.FeShadow.addDx(builder, shadow.dx);
        fbs.FeShadow.addDy(builder, shadow.dy);
        fbs.FeShadow.addBlur(builder, shadow.blur);
        fbs.FeShadow.addSpread(builder, shadow.spread);
        fbs.FeShadow.addColor(
          builder,
          fbs.RGBA32F.createRGBA32F(
            builder,
            shadow.color.r,
            shadow.color.g,
            shadow.color.b,
            shadow.color.a
          )
        );
        fbs.FeShadow.addActive(builder, shadow.active ?? true);
        const shadowOffset = fbs.FeShadow.endFeShadow(builder);

        // Create FilterShadowEffect table
        fbs.FilterShadowEffect.startFilterShadowEffect(builder);
        fbs.FilterShadowEffect.addKind(builder, kind);
        fbs.FilterShadowEffect.addShadow(builder, shadowOffset);
        return fbs.FilterShadowEffect.endFilterShadowEffect(builder);
      }

      /**
       * Encodes FeShadow array to FlatBuffers FilterShadowEffect table array.
       */
      function encodeFeShadows(
        builder: Builder,
        shadows: cg.FeShadow[]
      ): flatbuffers.Offset | undefined {
        if (shadows.length === 0) return undefined;
        // Create all FilterShadowEffect table offsets first
        const shadowOffsets: flatbuffers.Offset[] = [];
        for (let i = shadows.length - 1; i >= 0; i--) {
          const shadow = shadows[i]!;
          const kind = shadow.inset
            ? fbs.FilterShadowEffectKind.InnerShadow
            : fbs.FilterShadowEffectKind.DropShadow;
          shadowOffsets.push(encodeFeShadow(builder, shadow, kind));
        }
        // Create vector from offsets
        return fbs.LayerEffects.createFeShadowsVector(builder, shadowOffsets);
      }

      /**
       * Encodes FeLiquidGlass to FlatBuffers FeLiquidGlass table.
       */
      function encodeFeLiquidGlass(
        builder: Builder,
        feLiquidGlass: cg.FeLiquidGlass
      ): flatbuffers.Offset {
        fbs.FeLiquidGlass.startFeLiquidGlass(builder);
        fbs.FeLiquidGlass.addLightIntensity(
          builder,
          feLiquidGlass.light_intensity
        );
        fbs.FeLiquidGlass.addLightAngle(builder, feLiquidGlass.light_angle);
        fbs.FeLiquidGlass.addRefraction(builder, feLiquidGlass.refraction);
        fbs.FeLiquidGlass.addDepth(builder, feLiquidGlass.depth);
        fbs.FeLiquidGlass.addDispersion(builder, feLiquidGlass.dispersion);
        fbs.FeLiquidGlass.addBlurRadius(builder, feLiquidGlass.radius);
        fbs.FeLiquidGlass.addActive(builder, feLiquidGlass.active ?? true);
        return fbs.FeLiquidGlass.endFeLiquidGlass(builder);
      }

      /**
       * Encodes FeNoise array to FlatBuffers FeNoiseEffect table array.
       */
      function encodeFeNoises(
        builder: Builder,
        noises: cg.FeNoise[]
      ): flatbuffers.Offset | undefined {
        if (noises.length === 0) return undefined;
        fbs.LayerEffects.startFeNoisesVector(builder, noises.length);
        for (let i = noises.length - 1; i >= 0; i--) {
          const noise = noises[i]!;
          let coloringKind: fbs.NoiseEffectColorsKind;
          let monoColorR = 0,
            monoColorG = 0,
            monoColorB = 0,
            monoColorA = 1;
          let duoColor1R = 0,
            duoColor1G = 0,
            duoColor1B = 0,
            duoColor1A = 1;
          let duoColor2R = 1,
            duoColor2G = 1,
            duoColor2B = 1,
            duoColor2A = 1;
          let multiOpacity = 1.0;

          // Create NoiseEffectColors table
          let coloringOffset: flatbuffers.Offset;
          if (noise.mode === "mono") {
            coloringKind = fbs.NoiseEffectColorsKind.Mono;
            const color =
              noise.color || ({ r: 0, g: 0, b: 0, a: 1 } as cg.RGBA32F);
            const monoColorOffset = structs.rgba32f(builder, color);
            fbs.NoiseEffectColors.startNoiseEffectColors(builder);
            fbs.NoiseEffectColors.addKind(builder, coloringKind);
            fbs.NoiseEffectColors.addMonoColor(builder, monoColorOffset);
            coloringOffset =
              fbs.NoiseEffectColors.endNoiseEffectColors(builder);
          } else if (noise.mode === "duo") {
            coloringKind = fbs.NoiseEffectColorsKind.Duo;
            const color1 =
              noise.color1 || ({ r: 0, g: 0, b: 0, a: 1 } as cg.RGBA32F);
            const color2 =
              noise.color2 || ({ r: 1, g: 1, b: 1, a: 1 } as cg.RGBA32F);
            const duoColor1Offset = structs.rgba32f(builder, color1);
            const duoColor2Offset = structs.rgba32f(builder, color2);
            fbs.NoiseEffectColors.startNoiseEffectColors(builder);
            fbs.NoiseEffectColors.addKind(builder, coloringKind);
            fbs.NoiseEffectColors.addDuoColor1(builder, duoColor1Offset);
            fbs.NoiseEffectColors.addDuoColor2(builder, duoColor2Offset);
            coloringOffset =
              fbs.NoiseEffectColors.endNoiseEffectColors(builder);
          } else {
            // Multi
            coloringKind = fbs.NoiseEffectColorsKind.Multi;
            multiOpacity = noise.opacity ?? 1.0;
            fbs.NoiseEffectColors.startNoiseEffectColors(builder);
            fbs.NoiseEffectColors.addKind(builder, coloringKind);
            fbs.NoiseEffectColors.addMultiOpacity(builder, multiOpacity);
            coloringOffset =
              fbs.NoiseEffectColors.endNoiseEffectColors(builder);
          }

          // Create FeNoiseEffect table
          fbs.FeNoiseEffect.startFeNoiseEffect(builder);
          fbs.FeNoiseEffect.addNoiseSize(builder, noise.noise_size);
          fbs.FeNoiseEffect.addDensity(builder, noise.density);
          fbs.FeNoiseEffect.addNumOctaves(builder, noise.num_octaves ?? 3);
          fbs.FeNoiseEffect.addSeed(builder, noise.seed ?? 0);
          fbs.FeNoiseEffect.addColoring(builder, coloringOffset);
          fbs.FeNoiseEffect.addActive(builder, noise.active ?? true);
          fbs.FeNoiseEffect.addBlendMode(
            builder,
            styling.encode.blendMode(noise.blend_mode ?? "normal")
          );
          fbs.FeNoiseEffect.endFeNoiseEffect(builder);
        }
        return builder.endVector();
      }

      /**
       * Encodes IEffects interface to FlatBuffers LayerEffects table.
       */
      export function layerEffects(
        builder: Builder,
        effects: grida.program.nodes.i.IEffects
      ): flatbuffers.Offset {
        // Encode individual effects BEFORE starting LayerEffects
        const feBlurOffset = effects.fe_blur
          ? encodeFeLayerBlur(builder, effects.fe_blur)
          : undefined;
        const feBackdropBlurOffset = effects.fe_backdrop_blur
          ? encodeFeBackdropBlur(builder, effects.fe_backdrop_blur)
          : undefined;
        const feShadowsOffset = effects.fe_shadows
          ? encodeFeShadows(builder, effects.fe_shadows)
          : undefined;
        const feGlassOffset = effects.fe_liquid_glass
          ? encodeFeLiquidGlass(builder, effects.fe_liquid_glass)
          : undefined;
        const feNoisesOffset = effects.fe_noises
          ? encodeFeNoises(builder, effects.fe_noises)
          : undefined;

        // Create LayerEffects table
        fbs.LayerEffects.startLayerEffects(builder);
        if (feBlurOffset !== undefined) {
          fbs.LayerEffects.addFeBlur(builder, feBlurOffset);
        }
        if (feBackdropBlurOffset !== undefined) {
          fbs.LayerEffects.addFeBackdropBlur(builder, feBackdropBlurOffset);
        }
        if (feShadowsOffset !== undefined) {
          fbs.LayerEffects.addFeShadows(builder, feShadowsOffset);
        }
        if (feGlassOffset !== undefined) {
          fbs.LayerEffects.addFeGlass(builder, feGlassOffset);
        }
        if (feNoisesOffset !== undefined) {
          fbs.LayerEffects.addFeNoises(builder, feNoisesOffset);
        }
        return fbs.LayerEffects.endLayerEffects(builder);
      }
    }

    export namespace decode {
      /**
       * Decodes FeBlur table to TS FeBlur type.
       */
      function decodeFeBlur(blur: fbs.FeBlur): cg.FeBlur {
        const kind = blur.kind();
        if (kind === fbs.FeBlurKind.Gaussian) {
          const gaussian = blur.gaussian();
          return {
            type: "blur",
            radius: gaussian ? gaussian.radius() : 0,
          } satisfies cg.FeGaussianBlur;
        } else {
          // Progressive blur
          const progressive = blur.progressive();
          if (progressive) {
            const start = progressive.start();
            const end = progressive.end();
            return {
              type: "progressive-blur",
              x1: start ? start.x() : 0,
              y1: start ? start.y() : 0,
              x2: end ? end.x() : 0,
              y2: end ? end.y() : 0,
              radius: progressive.radius(),
              radius2: progressive.radius2(),
            } satisfies cg.FeProgressiveBlur;
          } else {
            // Fallback to gaussian blur
            return {
              type: "blur",
              radius: 0,
            } satisfies cg.FeGaussianBlur;
          }
        }
      }

      /**
       * Decodes FeLayerBlur table to TS FeLayerBlur type.
       */
      function decodeFeLayerBlur(
        feLayerBlur: fbs.FeLayerBlur | null
      ): cg.FeLayerBlur | undefined {
        if (!feLayerBlur) return undefined;
        const blur = feLayerBlur.blur();
        if (!blur) return undefined;
        return {
          type: "filter-blur",
          blur: decodeFeBlur(blur),
          active: feLayerBlur.active(),
        } satisfies cg.FeLayerBlur;
      }

      /**
       * Decodes FeBackdropBlur table to TS FeBackdropBlur type.
       */
      function decodeFeBackdropBlur(
        feBackdropBlur: fbs.FeBackdropBlur | null
      ): cg.FeBackdropBlur | undefined {
        if (!feBackdropBlur) return undefined;
        const blur = feBackdropBlur.blur();
        if (!blur) return undefined;
        return {
          type: "backdrop-filter-blur",
          blur: decodeFeBlur(blur),
          active: feBackdropBlur.active(),
        } satisfies cg.FeBackdropBlur;
      }

      /**
       * Decodes FeShadow table to TS FeShadow type.
       */
      function decodeFeShadow(shadow: fbs.FeShadow): cg.FeShadow {
        const color = shadow.color();
        return {
          type: "shadow",
          dx: shadow.dx(),
          dy: shadow.dy(),
          blur: shadow.blur(),
          spread: shadow.spread(),
          color: {
            r: color?.r() ?? 0,
            g: color?.g() ?? 0,
            b: color?.b() ?? 0,
            a: color?.a() ?? 0,
          } as cg.RGBA32F,
          active: shadow.active(),
        } satisfies cg.FeShadow;
      }

      /**
       * Decodes FilterShadowEffect table array to TS FeShadow array.
       */
      function decodeFeShadows(
        layerEffects: fbs.LayerEffects
      ): cg.FeShadow[] | undefined {
        const length = layerEffects.feShadowsLength();
        if (length === 0) return undefined;
        const shadows: cg.FeShadow[] = [];
        for (let i = 0; i < length; i++) {
          const filterShadow = layerEffects.feShadows(i);
          if (filterShadow) {
            const shadow = filterShadow.shadow();
            if (shadow) {
              const decodedShadow = decodeFeShadow(shadow);
              // Add inset property based on FilterShadowEffectKind
              if (
                filterShadow.kind() === fbs.FilterShadowEffectKind.InnerShadow
              ) {
                decodedShadow.inset = true;
              }
              shadows.push(decodedShadow);
            }
          }
        }
        return shadows.length > 0 ? shadows : undefined;
      }

      /**
       * Decodes FeLiquidGlass table to TS FeLiquidGlass type.
       */
      function decodeFeLiquidGlass(
        feLiquidGlass: fbs.FeLiquidGlass | null
      ): cg.FeLiquidGlass | undefined {
        if (!feLiquidGlass) return undefined;
        return {
          type: "glass",
          light_intensity: feLiquidGlass.lightIntensity(),
          light_angle: feLiquidGlass.lightAngle(),
          refraction: feLiquidGlass.refraction(),
          depth: feLiquidGlass.depth(),
          dispersion: feLiquidGlass.dispersion(),
          radius: feLiquidGlass.blurRadius(),
          active: feLiquidGlass.active(),
        } satisfies cg.FeLiquidGlass;
      }

      /**
       * Decodes NoiseEffectColors table to TS FeNoise coloring properties.
       */
      function decodeNoiseEffectColors(
        colors: fbs.NoiseEffectColors
      ): Pick<cg.FeNoise, "mode"> &
        Partial<Pick<cg.FeNoise, "color" | "color1" | "color2" | "opacity">> {
        const kind = colors.kind();
        const monoColor = colors.monoColor();
        const duoColor1 = colors.duoColor1();
        const duoColor2 = colors.duoColor2();

        if (kind === fbs.NoiseEffectColorsKind.Mono) {
          return {
            mode: "mono" as const,
            color: monoColor
              ? ({
                  r: monoColor.r(),
                  g: monoColor.g(),
                  b: monoColor.b(),
                  a: monoColor.a(),
                } as cg.RGBA32F)
              : ({ r: 0, g: 0, b: 0, a: 1 } as cg.RGBA32F),
          };
        } else if (kind === fbs.NoiseEffectColorsKind.Duo) {
          return {
            mode: "duo" as const,
            color1: duoColor1
              ? ({
                  r: duoColor1.r(),
                  g: duoColor1.g(),
                  b: duoColor1.b(),
                  a: duoColor1.a(),
                } as cg.RGBA32F)
              : ({ r: 0, g: 0, b: 0, a: 1 } as cg.RGBA32F),
            color2: duoColor2
              ? ({
                  r: duoColor2.r(),
                  g: duoColor2.g(),
                  b: duoColor2.b(),
                  a: duoColor2.a(),
                } as cg.RGBA32F)
              : ({ r: 1, g: 1, b: 1, a: 1 } as cg.RGBA32F),
          };
        } else {
          // Multi
          return {
            mode: "multi" as const,
            opacity: colors.multiOpacity(),
          };
        }
      }

      /**
       * Decodes FeNoiseEffect table array to TS FeNoise array.
       */
      function decodeFeNoises(
        layerEffects: fbs.LayerEffects
      ): cg.FeNoise[] | undefined {
        const length = layerEffects.feNoisesLength();
        if (length === 0) return undefined;
        const noises: cg.FeNoise[] = [];
        for (let i = 0; i < length; i++) {
          const feNoiseEffect = layerEffects.feNoises(i);
          if (feNoiseEffect) {
            const coloring = feNoiseEffect.coloring();
            if (coloring) {
              const noise: cg.FeNoise = {
                type: "noise",
                noise_size: feNoiseEffect.noiseSize(),
                density: feNoiseEffect.density(),
                num_octaves: feNoiseEffect.numOctaves(),
                seed: feNoiseEffect.seed(),
                ...decodeNoiseEffectColors(coloring),
                blend_mode: styling.decode.blendMode(feNoiseEffect.blendMode()),
                active: feNoiseEffect.active(),
              } satisfies cg.FeNoise;
              noises.push(noise);
            }
          }
        }
        return noises.length > 0 ? noises : undefined;
      }

      /**
       * Decodes LayerEffects table to TS IEffects interface.
       */
      export function layerEffects(
        layerEffects: fbs.LayerEffects | null
      ): grida.program.nodes.i.IEffects | undefined {
        if (!layerEffects) return undefined;

        const feBlur = decodeFeLayerBlur(layerEffects.feBlur());
        const feBackdropBlur = decodeFeBackdropBlur(
          layerEffects.feBackdropBlur()
        );
        const feShadows = decodeFeShadows(layerEffects);
        const feLiquidGlass = decodeFeLiquidGlass(layerEffects.feGlass());
        const feNoises = decodeFeNoises(layerEffects);

        // Only return if at least one effect is present
        if (
          feBlur ||
          feBackdropBlur ||
          feShadows ||
          feLiquidGlass ||
          feNoises
        ) {
          return {
            ...(feBlur ? { fe_blur: feBlur } : {}),
            ...(feBackdropBlur ? { fe_backdrop_blur: feBackdropBlur } : {}),
            ...(feShadows ? { fe_shadows: feShadows } : {}),
            ...(feLiquidGlass ? { fe_liquid_glass: feLiquidGlass } : {}),
            ...(feNoises ? { fe_noises: feNoises } : {}),
          };
        }
        return undefined;
      }
    }
  }

  /**
   * Vector network encoding/decoding.
   */
  export namespace vector {
    export namespace encode {
      /**
       * Helper to convert Vector2 to [x, y] tuple.
       */
      function vector2ToXY(v: cg.Vector2): [number, number] {
        if (Array.isArray(v)) {
          return [v[0] ?? 0, v[1] ?? 0];
        }
        if (
          typeof v === "object" &&
          v !== null &&
          "x" in v &&
          "y" in v &&
          typeof (v as { x: unknown; y: unknown }).x === "number" &&
          typeof (v as { x: unknown; y: unknown }).y === "number"
        ) {
          const vObj = v as { x: number; y: number };
          return [vObj.x ?? 0, vObj.y ?? 0];
        }
        return [0, 0];
      }

      /**
       * Encodes a TS `vn.VectorNetwork` into FlatBuffers `VectorNetwork` table.
       * Note: Regions are not encoded as TS schema doesn't include them.
       */
      export function vectorNetwork(
        builder: Builder,
        network: vn.VectorNetwork
      ): flatbuffers.Offset {
        // Encode vertices as vector of CGPoint structs
        const vertices = network.vertices || [];
        fbs.VectorNetworkData.startVerticesVector(builder, vertices.length);
        for (let i = vertices.length - 1; i >= 0; i--) {
          const vertex = vertices[i]!;
          const [x, y] = vector2ToXY(vertex);
          fbs.CGPoint.createCGPoint(builder, x, y);
        }
        const verticesOffset = builder.endVector();

        // Encode segments as vector of VectorNetworkSegment structs
        const segments = network.segments || [];
        fbs.VectorNetworkData.startSegmentsVector(builder, segments.length);
        for (let i = segments.length - 1; i >= 0; i--) {
          const seg = segments[i]!;
          const [taX, taY] = vector2ToXY(seg.ta);
          const [tbX, tbY] = vector2ToXY(seg.tb);
          fbs.VectorNetworkSegment.createVectorNetworkSegment(
            builder,
            seg.a,
            seg.b,
            taX,
            taY,
            tbX,
            tbY
          );
        }
        const segmentsOffset = builder.endVector();

        // Create empty regions vector (TS schema doesn't support regions yet)
        const regionsOffset = fbs.VectorNetworkData.createRegionsVector(
          builder,
          []
        );

        // Create VectorNetwork table
        fbs.VectorNetworkData.startVectorNetworkData(builder);
        fbs.VectorNetworkData.addVertices(builder, verticesOffset);
        fbs.VectorNetworkData.addSegments(builder, segmentsOffset);
        fbs.VectorNetworkData.addRegions(builder, regionsOffset);
        return fbs.VectorNetworkData.endVectorNetworkData(builder);
      }
    }

    export namespace decode {
      /**
       * Decodes a FlatBuffers `VectorNetwork` table to TS `vn.VectorNetwork`.
       * Note: Regions are ignored as TS schema doesn't include them.
       */
      export function vectorNetwork(
        fbNetwork: fbs.VectorNetworkData
      ): vn.VectorNetwork {
        // Decode vertices
        const vertices: vn.VectorNetworkVertex[] = [];
        const verticesLength = fbNetwork.verticesLength();
        for (let i = 0; i < verticesLength; i++) {
          const vertex = fbNetwork.vertices(i);
          if (vertex) {
            vertices.push([vertex.x(), vertex.y()] as cg.Vector2);
          }
        }

        // Decode segments
        const segments: vn.VectorNetworkSegment[] = [];
        const segmentsLength = fbNetwork.segmentsLength();
        for (let i = 0; i < segmentsLength; i++) {
          const seg = fbNetwork.segments(i);
          if (seg) {
            const ta = seg.tangentA();
            const tb = seg.tangentB();
            segments.push({
              a: seg.segmentVertexA(),
              b: seg.segmentVertexB(),
              ta: ta
                ? ([ta.x(), ta.y()] as cg.Vector2)
                : ([0, 0] as cg.Vector2),
              tb: tb
                ? ([tb.x(), tb.y()] as cg.Vector2)
                : ([0, 0] as cg.Vector2),
            });
          }
        }

        // Regions are ignored (TS schema doesn't support them)
        return {
          vertices,
          segments,
        };
      }
    }
  }

  /**
   * Layout encoding/decoding for positioning, sizing, and flex properties.
   */
  export namespace layout {
    export namespace encode {
      // Type guards
      function isPercentage(
        v: grida.program.css.LengthPercentage
      ): v is grida.program.css.Percentage {
        return (
          typeof v === "object" &&
          v !== null &&
          "type" in v &&
          v.type === "percentage"
        );
      }

      function isLengthObject(
        v: grida.program.css.LengthPercentage
      ): v is Extract<grida.program.css.Length, { type: "length" }> {
        return (
          typeof v === "object" &&
          v !== null &&
          "type" in v &&
          v.type === "length"
        );
      }

      // Enum mappers
      export const axis = (axis: cg.Axis | undefined): fbs.Axis =>
        enums.AXIS_ENCODE.get(axis) ?? fbs.Axis.Horizontal;

      export const mainAxisAlignment = (
        v: cg.MainAxisAlignment | undefined
      ): fbs.MainAxisAlignment =>
        enums.MAIN_AXIS_ALIGNMENT_ENCODE.get(v) ?? fbs.MainAxisAlignment.None;

      export const crossAxisAlignment = (
        v: cg.CrossAxisAlignment | undefined
      ): fbs.CrossAxisAlignment =>
        enums.CROSS_AXIS_ALIGNMENT_ENCODE.get(v) ?? fbs.CrossAxisAlignment.None;

      export const layoutWrap = (
        v: "wrap" | "nowrap" | undefined
      ): fbs.LayoutWrap =>
        enums.LAYOUT_WRAP_ENCODE.get(v) ?? fbs.LayoutWrap.None;

      export const layoutPositioning = (
        position: string
      ): fbs.LayoutPositioning => {
        return position === "absolute"
          ? fbs.LayoutPositioning.Absolute
          : fbs.LayoutPositioning.Auto;
      };

      /**
       * Encodes a TS `css.LengthPercentage | "auto"` into FlatBuffers `Length` union.
       *
       * Canonical mapping:
       * - `"auto"` -> `Auto`
       * - `number` or `{type:"length", unit:"px"}` -> `Px`
       * - `{type:"percentage"}` -> `Percent`
       */
      export function length(
        builder: Builder,
        value: grida.program.css.LengthPercentage | "auto"
      ): { type: fbs.Length; offset: number } {
        if (value === "auto") {
          const offset = fbs.Auto.createAuto(builder);
          return { type: fbs.Length.Auto, offset };
        }

        if (typeof value === "number") {
          const offset = fbs.Px.createPx(builder, value);
          return { type: fbs.Length.Px, offset };
        }

        if (isPercentage(value)) {
          const offset = fbs.Percent.createPercent(builder, value.value);
          return { type: fbs.Length.Percent, offset };
        }

        if (isLengthObject(value)) {
          // TS supports multiple CSS units, but for the canonical archive model we only persist px.
          // If it's not px, preserve the numeric magnitude (lossy) rather than throwing.
          const offset = fbs.Px.createPx(builder, value.value);
          return { type: fbs.Length.Px, offset };
        }

        // Fallback: treat unknown object as px=0.
        const offset = fbs.Px.createPx(builder, 0);
        return { type: fbs.Length.Px, offset };
      }

      /**
       * Encodes LayoutDimensions table with Length unions for target width/height.
       */
      export function dimensions(
        builder: Builder,
        width: grida.program.css.LengthPercentage | "auto",
        height: grida.program.css.LengthPercentage | "auto"
      ): flatbuffers.Offset {
        const targetWidth = length(builder, width);
        const targetHeight = length(builder, height);

        fbs.LayoutDimensions.startLayoutDimensions(builder);
        fbs.LayoutDimensions.addLayoutTargetWidthType(
          builder,
          targetWidth.type
        );
        fbs.LayoutDimensions.addLayoutTargetWidth(builder, targetWidth.offset);
        fbs.LayoutDimensions.addLayoutTargetHeightType(
          builder,
          targetHeight.type
        );
        fbs.LayoutDimensions.addLayoutTargetHeight(
          builder,
          targetHeight.offset
        );
        return fbs.LayoutDimensions.endLayoutDimensions(builder);
      }

      /**
       * Encodes LayoutContainerStyle table (flex properties and padding).
       */
      export function containerStyle(
        builder: Builder,
        node: Partial<
          Pick<
            grida.program.nodes.ContainerNode,
            | "layout"
            | "direction"
            | "layout_wrap"
            | "main_axis_alignment"
            | "cross_axis_alignment"
            | "main_axis_gap"
            | "cross_axis_gap"
            | "padding_top"
            | "padding_right"
            | "padding_bottom"
            | "padding_left"
          >
        >
      ): flatbuffers.Offset {
        fbs.LayoutContainerStyle.startLayoutContainerStyle(builder);
        fbs.LayoutContainerStyle.addLayoutMode(
          builder,
          node.layout === "flex" ? fbs.LayoutMode.Flex : fbs.LayoutMode.Normal
        );
        fbs.LayoutContainerStyle.addLayoutDirection(
          builder,
          axis(node.direction)
        );
        fbs.LayoutContainerStyle.addLayoutWrap(
          builder,
          layoutWrap(node.layout_wrap)
        );
        fbs.LayoutContainerStyle.addLayoutMainAxisAlignment(
          builder,
          mainAxisAlignment(node.main_axis_alignment)
        );
        fbs.LayoutContainerStyle.addLayoutCrossAxisAlignment(
          builder,
          crossAxisAlignment(node.cross_axis_alignment)
        );
        // Create EdgeInsets struct inline for padding using generated method
        const paddingOffset = fbs.EdgeInsets.createEdgeInsets(
          builder,
          node.padding_top ?? 0,
          node.padding_right ?? 0,
          node.padding_bottom ?? 0,
          node.padding_left ?? 0
        );
        fbs.LayoutContainerStyle.addLayoutPadding(builder, paddingOffset);
        fbs.LayoutContainerStyle.addLayoutMainAxisGap(
          builder,
          node.main_axis_gap ?? 0
        );
        fbs.LayoutContainerStyle.addLayoutCrossAxisGap(
          builder,
          node.cross_axis_gap ?? 0
        );
        return fbs.LayoutContainerStyle.endLayoutContainerStyle(builder);
      }

      /**
       * Encodes LayoutChildStyle table (positioning mode).
       */
      export function childStyle(
        builder: Builder,
        position: string
      ): flatbuffers.Offset {
        fbs.LayoutChildStyle.startLayoutChildStyle(builder);
        fbs.LayoutChildStyle.addLayoutPositioning(
          builder,
          layoutPositioning(position)
        );
        return fbs.LayoutChildStyle.endLayoutChildStyle(builder);
      }

      /**
       * Encodes a TS node's layout-related inputs into a FlatBuffers `Layout` table.
       *
       * Uses canonical fields: layout_position_basis, layout_position, layout_inset,
       * layout_dimensions (with Length unions for target width/height), rotation.
       */
      export function nodeLayout(
        builder: Builder,
        node: Pick<
          grida.program.nodes.UnknwonNode,
          | "position"
          | "left"
          | "top"
          | "right"
          | "bottom"
          | "width"
          | "height"
          | "rotation"
        > &
          Partial<
            Pick<
              grida.program.nodes.ContainerNode,
              | "layout"
              | "direction"
              | "layout_wrap"
              | "main_axis_alignment"
              | "cross_axis_alignment"
              | "main_axis_gap"
              | "cross_axis_gap"
              | "padding_top"
              | "padding_right"
              | "padding_bottom"
              | "padding_left"
            >
          >
      ): number {
        const positioning = {
          position: node.position ?? "relative",
          left: node.left,
          top: node.top,
          right: node.right,
          bottom: node.bottom,
        };

        // Determine position basis: use Inset if right/bottom are set, otherwise Cartesian
        const hasRightOrBottom =
          typeof positioning.right === "number" ||
          typeof positioning.bottom === "number";
        const positionBasis = hasRightOrBottom
          ? fbs.LayoutPositionBasis.Inset
          : fbs.LayoutPositionBasis.Cartesian;

        // Encode dimensions
        const dimensionsOffset = dimensions(
          builder,
          node.width ?? "auto",
          node.height ?? "auto"
        );

        // Encode container style (optional)
        let containerOffset = 0;
        const hasContainerStyle = node.layout !== undefined;
        if (hasContainerStyle) {
          containerOffset = containerStyle(builder, node);
        }

        // Encode child style
        const childOffset = childStyle(builder, positioning.position);

        // Build Layout table
        fbs.Layout.startLayout(builder);
        fbs.Layout.addLayoutPositionBasis(builder, positionBasis);
        if (positionBasis === fbs.LayoutPositionBasis.Cartesian) {
          // Create CGPoint struct inline using generated method
          const pointOffset = fbs.CGPoint.createCGPoint(
            builder,
            typeof positioning.left === "number" ? positioning.left : 0,
            typeof positioning.top === "number" ? positioning.top : 0
          );
          fbs.Layout.addLayoutPosition(builder, pointOffset);
        } else {
          // Create EdgeInsets struct inline using generated method
          const insetOffset = fbs.EdgeInsets.createEdgeInsets(
            builder,
            positioning.top ?? 0,
            positioning.right ?? 0,
            positioning.bottom ?? 0,
            positioning.left ?? 0
          );
          fbs.Layout.addLayoutInset(builder, insetOffset);
        }
        fbs.Layout.addLayoutDimensions(builder, dimensionsOffset);
        fbs.Layout.addRotation(builder, node.rotation ?? 0);
        if (containerOffset) {
          fbs.Layout.addLayoutContainer(builder, containerOffset);
        }
        fbs.Layout.addLayoutChild(builder, childOffset);
        return fbs.Layout.endLayout(builder);
      }
    }

    export namespace decode {
      export const axis = (axis: fbs.Axis): cg.Axis =>
        enums.AXIS_DECODE.get(axis) ?? "horizontal";

      export const mainAxisAlignment = (
        v: fbs.MainAxisAlignment
      ): cg.MainAxisAlignment | undefined =>
        enums.MAIN_AXIS_ALIGNMENT_DECODE.get(v);

      export const crossAxisAlignment = (
        v: fbs.CrossAxisAlignment
      ): cg.CrossAxisAlignment | undefined =>
        enums.CROSS_AXIS_ALIGNMENT_DECODE.get(v);

      export const layoutWrap = (
        v: fbs.LayoutWrap
      ): "wrap" | "nowrap" | undefined => enums.LAYOUT_WRAP_DECODE.get(v);

      export function length(
        type: fbs.Length,
        value: unknown
      ): grida.program.css.LengthPercentage | "auto" {
        switch (type) {
          case fbs.Length.Auto:
            return "auto";
          case fbs.Length.Percent: {
            const v = value as fbs.Percent;
            return { type: "percentage", value: v.value() };
          }
          case fbs.Length.Px: {
            const v = value as fbs.Px;
            return v.value();
          }
          case fbs.Length.NONE:
          default:
            // Default for missing values in TS varies by node; keep it explicit.
            return "auto";
        }
      }

      export function nodeLayout(
        layout: fbs.Layout
      ): grida.program.nodes.i.ILayoutTrait &
        Partial<
          Pick<
            grida.program.nodes.ContainerNode,
            | "layout"
            | "direction"
            | "layout_wrap"
            | "main_axis_alignment"
            | "cross_axis_alignment"
            | "main_axis_gap"
            | "cross_axis_gap"
            | "padding_top"
            | "padding_right"
            | "padding_bottom"
            | "padding_left"
          >
        > {
        // Decode positioning from canonical fields
        const layoutChild = layout.layoutChild();
        const layoutPositioning = layoutChild
          ? layoutChild.layoutPositioning()
          : fbs.LayoutPositioning.Auto;
        const position =
          layoutPositioning === fbs.LayoutPositioning.Absolute
            ? "absolute"
            : "relative";

        const positionBasis = layout.layoutPositionBasis();
        let left: number | undefined;
        let top: number | undefined;
        let right: number | undefined;
        let bottom: number | undefined;

        if (positionBasis === fbs.LayoutPositionBasis.Inset) {
          const inset = layout.layoutInset();
          if (inset) {
            // For inset positioning, treat 0 as potentially undefined
            // since FlatBuffers structs can't represent undefined values
            // Only set values if they're non-zero or if other inset values are also zero
            const topVal = inset.top();
            const rightVal = inset.right();
            const bottomVal = inset.bottom();
            const leftVal = inset.left();

            // If we have non-zero values, treat 0 as undefined
            const hasNonZero =
              topVal !== 0 ||
              rightVal !== 0 ||
              bottomVal !== 0 ||
              leftVal !== 0;

            top = hasNonZero && topVal === 0 ? undefined : topVal;
            right = hasNonZero && rightVal === 0 ? undefined : rightVal;
            bottom = hasNonZero && bottomVal === 0 ? undefined : bottomVal;
            left = hasNonZero && leftVal === 0 ? undefined : leftVal;
          }
        } else {
          // Cartesian
          const pos = layout.layoutPosition();
          if (pos) {
            left = pos.x();
            top = pos.y();
          }
        }

        // Decode dimensions from canonical fields (Length unions)
        const dimensions = layout.layoutDimensions();
        let width: grida.program.css.LengthPercentage | "auto" = "auto";
        let height: grida.program.css.LengthPercentage | "auto" = "auto";

        if (dimensions) {
          const widthType = dimensions.layoutTargetWidthType();
          const widthValue = unionToLength(
            widthType,
            (obj: fbs.Auto | fbs.Px | fbs.Percent) =>
              dimensions.layoutTargetWidth(obj)
          );
          width = decode.length(widthType, widthValue);

          const heightType = dimensions.layoutTargetHeightType();
          const heightValue = unionToLength(
            heightType,
            (obj: fbs.Auto | fbs.Px | fbs.Percent) =>
              dimensions.layoutTargetHeight(obj)
          );
          height = decode.length(heightType, heightValue);
        }

        const container = layout.layoutContainer();
        const containerFields: Partial<grida.program.nodes.ContainerNode> = {};
        if (container) {
          containerFields.layout =
            container.layoutMode() === fbs.LayoutMode.Flex ? "flex" : "flow";
          containerFields.direction = decode.axis(container.layoutDirection());

          const wrap = decode.layoutWrap(container.layoutWrap());
          if (wrap !== undefined) {
            containerFields.layout_wrap = wrap;
          }

          const mainAxis = decode.mainAxisAlignment(
            container.layoutMainAxisAlignment()
          );
          if (mainAxis !== undefined) {
            containerFields.main_axis_alignment = mainAxis;
          }

          const crossAxis = decode.crossAxisAlignment(
            container.layoutCrossAxisAlignment()
          );
          if (crossAxis !== undefined) {
            containerFields.cross_axis_alignment = crossAxis;
          }

          containerFields.main_axis_gap = container.layoutMainAxisGap();
          containerFields.cross_axis_gap = container.layoutCrossAxisGap();

          const padding = container.layoutPadding();
          if (padding) {
            containerFields.padding_top = padding.top();
            containerFields.padding_right = padding.right();
            containerFields.padding_bottom = padding.bottom();
            containerFields.padding_left = padding.left();
          }
        }

        return {
          position,
          left,
          top,
          right,
          bottom,
          width,
          height,
          rotation: layout.rotation(),
          ...containerFields,
        };
      }
    }
  }

  /**
   * Document-level encoding/decoding.
   */
  export namespace document {
    export namespace encode {
      /**
       * Encodes a TypeScript Document to FlatBuffers binary format.
       *
       * @param document - The TS IR document to encode
       * @returns Uint8Array containing the FlatBuffers binary data
       */
      export function toFlatbuffer(
        document: grida.program.document.Document,
        schemaVersion: string = grida.program.document.SCHEMA_VERSION
      ): Uint8Array {
        const builder = new flatbuffers.Builder(1024);

        // Build schema version
        const schemaVersionOffset = builder.createString(schemaVersion);

        // Build parent reference map: for each node, find its parent and generate position
        // First, build a reverse map: childId -> parentId
        const childToParentMap = new Map<string, string>();
        const parentToChildrenMap = new Map<string, string[]>();

        if (document.links) {
          for (const [parentId, children] of Object.entries(document.links)) {
            if (children && children.length > 0) {
              parentToChildrenMap.set(parentId, children);
              for (const childId of children) {
                childToParentMap.set(childId, parentId);
              }
            }
          }
        }

        // Generate position strings for each parent's children
        const nodeToParentRef = new Map<
          string,
          { parentId: string; position: string }
        >();
        for (const [parentId, children] of parentToChildrenMap.entries()) {
          if (children.length === 0) continue;
          // Generate position strings for all children
          const positions = generateNKeysBetween(null, null, children.length);
          for (let i = 0; i < children.length; i++) {
            nodeToParentRef.set(children[i]!, {
              parentId,
              position: positions[i]!,
            });
          }
        }

        // Encode nodes array (TS nodes map -> flat list)
        const nodeIds = Object.keys(document.nodes || {});
        // Deterministic ordering: sort by string id
        nodeIds.sort();

        const nodeOffsets: flatbuffers.Offset[] = [];
        const nodeTypes: fbs.Node[] = [];
        for (const nodeId of nodeIds) {
          const node = document.nodes[nodeId]!;
          const parentRef = nodeToParentRef.get(nodeId);

          // Layout: only for nodes that have the expected TS fields (position/size).
          let layoutOffset: number | undefined = undefined;
          if (
            "position" in node &&
            "width" in node &&
            "height" in node &&
            node.position &&
            node.width !== undefined &&
            node.height !== undefined
          ) {
            layoutOffset = format.layout.encode.nodeLayout(
              builder,
              node as Pick<
                grida.program.nodes.UnknwonNode,
                | "position"
                | "left"
                | "top"
                | "right"
                | "bottom"
                | "width"
                | "height"
                | "rotation"
              > &
                Partial<
                  Pick<
                    grida.program.nodes.ContainerNode,
                    | "layout"
                    | "direction"
                    | "layout_wrap"
                    | "main_axis_alignment"
                    | "cross_axis_alignment"
                    | "main_axis_gap"
                    | "cross_axis_gap"
                    | "padding_top"
                    | "padding_right"
                    | "padding_bottom"
                    | "padding_left"
                  >
                >
            );
          }

          const { nodeType, nodeOffset } = format.node.encode.node(
            builder,
            node,
            parentRef,
            layoutOffset
          );
          nodeOffsets.push(nodeOffset);
          nodeTypes.push(nodeType);
        }

        // Create both nodesType and nodes vectors for union
        const nodesTypeOffset = fbs.CanvasDocument.createNodesTypeVector(
          builder,
          nodeTypes
        );
        const nodesOffset = fbs.CanvasDocument.createNodesVector(
          builder,
          nodeOffsets
        );

        // Encode scenes array
        const scenesIds = (document.scenes_ref || []).map(format.node.packId);
        const scenesOffset = structs.nodeIdentifierVector(
          builder,
          scenesIds,
          fbs.CanvasDocument.createScenesVector
        );

        // Build CanvasDocument table
        fbs.CanvasDocument.startCanvasDocument(builder);
        fbs.CanvasDocument.addSchemaVersion(builder, schemaVersionOffset);
        fbs.CanvasDocument.addNodesType(builder, nodesTypeOffset);
        fbs.CanvasDocument.addNodes(builder, nodesOffset);
        fbs.CanvasDocument.addScenes(builder, scenesOffset);
        const documentOffset = fbs.CanvasDocument.endCanvasDocument(builder);

        // Build GridaFile root
        fbs.GridaFile.startGridaFile(builder);
        fbs.GridaFile.addDocument(builder, documentOffset);
        const rootOffset = fbs.GridaFile.endGridaFile(builder);

        builder.finish(rootOffset);

        return builder.asUint8Array();
      }
    }

    export namespace decode {
      /**
       * Node decoding functions, one per node type.
       */
      export namespace nodeTypes {
        /**
         * Decodes SceneNode.
         */
        export function scene(
          n: fbs.SceneNode,
          id: string
        ): grida.program.nodes.SceneNode {
          // Read SystemNodeTrait
          const systemNode = n.node()!;
          const name = systemNode.name() ?? "";
          const active = systemNode.active() ?? true;
          const locked = systemNode.locked() ?? false;

          // SceneNode fields are directly on the node, not in properties()
          const constraintsChildren =
            n.constraintsChildren() === fbs.SceneConstraintsChildren.Single
              ? "single"
              : "multiple";

          // Decode background_color (solid color only, RGBA32F)
          let background_color: cg.RGBA32F | undefined = undefined;
          const bgColor = n.sceneBackgroundColor();
          if (bgColor) {
            background_color = {
              r: bgColor.r(),
              g: bgColor.g(),
              b: bgColor.b(),
              a: bgColor.a(),
            } as cg.RGBA32F;
          }

          // Decode guides
          const guides: Array<{ axis: cmath.Axis; offset: number }> = [];
          const guidesCount = n.guidesLength();
          for (let i = 0; i < guidesCount; i++) {
            const guide = n.guides(i);
            if (guide) {
              const axisValue =
                guide.axis() === fbs.Axis.Vertical ? "vertical" : "horizontal";
              guides.push({
                axis: axisValue as cmath.Axis,
                offset: guide.guideOffset(),
              });
            }
          }

          // Decode edges
          const edges: Array<{
            type: "edge";
            id: string;
            a:
              | { type: "position"; x: number; y: number }
              | { type: "anchor"; target: string };
            b:
              | { type: "position"; x: number; y: number }
              | { type: "anchor"; target: string };
          }> = [];
          const edgesCount = n.edgesLength();
          for (let i = 0; i < edgesCount; i++) {
            const edge = n.edges(i);
            if (!edge) continue;

            const edgeId = edge.id();

            // Decode edge point a
            let edgePointA:
              | { type: "position"; x: number; y: number }
              | { type: "anchor"; target: string }
              | undefined = undefined;
            const edgePointAType = edge.aType();
            if (edgePointAType === fbs.EdgePoint.EdgePointPosition2D) {
              const pos2d = edge.a(
                new fbs.EdgePointPosition2D()
              ) as fbs.EdgePointPosition2D | null;
              if (pos2d) {
                edgePointA = {
                  type: "position" as const,
                  x: pos2d.x(),
                  y: pos2d.y(),
                };
              }
            } else if (edgePointAType === fbs.EdgePoint.EdgePointNodeAnchor) {
              const anchor = edge.a(
                new fbs.EdgePointNodeAnchor()
              ) as fbs.EdgePointNodeAnchor | null;
              if (anchor) {
                const target = anchor.target();
                if (target) {
                  edgePointA = {
                    type: "anchor" as const,
                    target: format.node.unpackId(target.id()!),
                  };
                }
              }
            }

            // Decode edge point b
            let edgePointB:
              | { type: "position"; x: number; y: number }
              | { type: "anchor"; target: string }
              | undefined = undefined;
            const edgePointBType = edge.bType();
            if (edgePointBType === fbs.EdgePoint.EdgePointPosition2D) {
              const pos2d = edge.b(
                new fbs.EdgePointPosition2D()
              ) as fbs.EdgePointPosition2D | null;
              if (pos2d) {
                edgePointB = {
                  type: "position" as const,
                  x: pos2d.x(),
                  y: pos2d.y(),
                };
              }
            } else if (edgePointBType === fbs.EdgePoint.EdgePointNodeAnchor) {
              const anchor = edge.b(
                new fbs.EdgePointNodeAnchor()
              ) as fbs.EdgePointNodeAnchor | null;
              if (anchor) {
                const target = anchor.target();
                if (target) {
                  edgePointB = {
                    type: "anchor" as const,
                    target: format.node.unpackId(target.id()!),
                  };
                }
              }
            }

            if (edgePointA && edgePointB) {
              edges.push({
                type: "edge" as const,
                id: edgeId || "",
                a: edgePointA,
                b: edgePointB,
              });
            }
          }

          // Decode position field
          const position = n.position() ?? undefined;

          return {
            type: "scene",
            id,
            name,
            active,
            locked,
            guides,
            edges,
            constraints: { children: constraintsChildren },
            ...(background_color ? { background_color } : {}),
            ...(position !== undefined && position !== null && position !== ""
              ? { position }
              : {}),
          } satisfies grida.program.nodes.SceneNode;
        }

        /**
         * Decodes BasicShapeNode (rectangle, ellipse, polygon, star).
         */
        export function basicShape(
          n: fbs.BasicShapeNode,
          id: string,
          systemNode: fbs.SystemNodeTrait,
          layer: fbs.LayerTrait,
          opacity: number,
          layoutFields: ReturnType<typeof format.layout.decode.nodeLayout>,
          effects?: grida.program.nodes.i.IEffects
        ):
          | grida.program.nodes.RectangleNode
          | grida.program.nodes.EllipseNode
          | grida.program.nodes.RegularPolygonNode
          | grida.program.nodes.RegularStarPolygonNode {
          // Read SystemNodeTrait
          const name = systemNode.name() ?? "";
          const active = systemNode.active();
          const locked = systemNode.locked();

          // Decode BasicShapeNodeType to determine TS node type
          const basicShapeNodeType = n.type();
          const tsNodeType =
            enums.BASIC_SHAPE_NODE_TYPE_DECODE.get(basicShapeNodeType) ??
            "rectangle";

          // Decode CanonicalLayerShape union
          const shapeType = n.shapeType();
          // Extract shape value - manually access union based on type
          let shapeValue: unknown = null;
          switch (shapeType) {
            case fbs.CanonicalLayerShape.CanonicalShapeRectangular:
              shapeValue = n.shape(new fbs.CanonicalShapeRectangular());
              break;
            case fbs.CanonicalLayerShape.CanonicalShapeElliptical:
              shapeValue = n.shape(new fbs.CanonicalShapeElliptical());
              break;
            case fbs.CanonicalLayerShape.CanonicalShapeRegularPolygon:
              shapeValue = n.shape(new fbs.CanonicalShapeRegularPolygon());
              break;
            case fbs.CanonicalLayerShape.CanonicalShapeRegularStarPolygon:
              shapeValue = n.shape(new fbs.CanonicalShapeRegularStarPolygon());
              break;
            case fbs.CanonicalLayerShape.CanonicalShapePointsPolygon:
              shapeValue = n.shape(new fbs.CanonicalShapePointsPolygon());
              break;
            case fbs.CanonicalLayerShape.CanonicalShapePath:
              shapeValue = n.shape(new fbs.CanonicalShapePath());
              break;
            default:
              throw new Error(
                `Unsupported CanonicalLayerShape type: ${shapeType}`
              );
          }
          if (!shapeValue) {
            throw new Error(
              `Failed to decode CanonicalLayerShape union: ${shapeType}`
            );
          }
          const shapeData = format.shape.decode.minimalShape.minimalShape(
            shapeType,
            shapeValue
          );

          // Decode stroke_style
          const strokeStyle = n.strokeStyle();
          const strokeCap = strokeStyle
            ? format.styling.decode.strokeCap(strokeStyle.strokeCap())
            : "butt";
          const strokeJoin = strokeStyle
            ? format.styling.decode.strokeJoin(strokeStyle.strokeJoin())
            : "miter";
          const strokeWidth = n.strokeWidth();

          // Decode corner_radius and rectangular properties
          const cornerRadius = n.cornerRadius();
          const cornerSmoothing = n.cornerSmoothing();
          const rectangularCornerRadius = n.rectangularCornerRadius();
          const rectangularStrokeWidth = n.rectangularStrokeWidth();

          // Decode paints from PaintStackItem arrays
          const fillPaints: cg.Paint[] = [];
          const fillPaintsLength = n.fillPaintsLength();
          for (let i = 0; i < fillPaintsLength; i++) {
            const stackItem = n.fillPaints(i);
            if (stackItem) {
              const paintType = stackItem.paintType();
              const paintValue = unionToPaint(paintType, (obj: any) =>
                stackItem.paint(obj)
              );
              if (paintValue) {
                fillPaints.push(
                  format.paint.decode.paint(paintType, paintValue)
                );
              }
            }
          }

          const strokePaints: cg.Paint[] = [];
          const strokePaintsLength = n.strokePaintsLength();
          for (let i = 0; i < strokePaintsLength; i++) {
            const stackItem = n.strokePaints(i);
            if (stackItem) {
              const paintType = stackItem.paintType();
              const paintValue = unionToPaint(paintType, (obj: any) =>
                stackItem.paint(obj)
              );
              if (paintValue) {
                strokePaints.push(
                  format.paint.decode.paint(paintType, paintValue)
                );
              }
            }
          }

          // Common fields for all basic shapes
          // Note: width/height now come from layoutFields, not from shapeData
          const width =
            typeof layoutFields.width === "number" ? layoutFields.width : 0;
          const height =
            typeof layoutFields.height === "number" ? layoutFields.height : 0;
          const baseFields = {
            id,
            name: name || tsNodeType,
            active,
            locked,
            opacity,
            z_index: 0,
            width,
            height,
            position: layoutFields.position ?? "absolute",
            left: layoutFields.left,
            top: layoutFields.top,
            right: layoutFields.right,
            bottom: layoutFields.bottom,
            rotation: layoutFields.rotation ?? 0,
            stroke_width: strokeWidth,
            stroke_cap: strokeCap,
            stroke_join: strokeJoin,
            ...(fillPaints.length > 0 ? { fill_paints: fillPaints } : {}),
            ...(strokePaints.length > 0 ? { stroke_paints: strokePaints } : {}),
            ...(effects || {}),
          };

          // Shape-specific fields
          switch (tsNodeType) {
            case "rectangle": {
              // Decode rectangular properties
              const tl = rectangularCornerRadius?.tl()?.rx() ?? cornerRadius;
              const tr = rectangularCornerRadius?.tr()?.rx() ?? cornerRadius;
              const bl = rectangularCornerRadius?.bl()?.rx() ?? cornerRadius;
              const br = rectangularCornerRadius?.br()?.rx() ?? cornerRadius;

              const strokeTop =
                rectangularStrokeWidth?.strokeTopWidth() ?? strokeWidth;
              const strokeRight =
                rectangularStrokeWidth?.strokeRightWidth() ?? strokeWidth;
              const strokeBottom =
                rectangularStrokeWidth?.strokeBottomWidth() ?? strokeWidth;
              const strokeLeft =
                rectangularStrokeWidth?.strokeLeftWidth() ?? strokeWidth;

              return {
                type: "rectangle" as const,
                ...baseFields,
                rectangular_corner_radius_top_left: tl,
                rectangular_corner_radius_top_right: tr,
                rectangular_corner_radius_bottom_left: bl,
                rectangular_corner_radius_bottom_right: br,
                ...(cornerSmoothing !== 0
                  ? { corner_smoothing: cornerSmoothing }
                  : {}),
                rectangular_stroke_width_top: strokeTop,
                rectangular_stroke_width_right: strokeRight,
                rectangular_stroke_width_bottom: strokeBottom,
                rectangular_stroke_width_left: strokeLeft,
              } satisfies grida.program.nodes.RectangleNode;
            }

            case "ellipse": {
              return {
                type: "ellipse" as const,
                ...baseFields,
                inner_radius: shapeData.inner_radius ?? 0,
                angle_offset: shapeData.angle_offset ?? 0,
                angle: shapeData.angle ?? 360,
              } satisfies grida.program.nodes.EllipseNode;
            }

            case "polygon": {
              return {
                type: "polygon" as const,
                ...baseFields,
                point_count: shapeData.point_count ?? 3,
                corner_radius: cornerRadius,
                ...(cornerSmoothing !== 0
                  ? { corner_smoothing: cornerSmoothing }
                  : {}),
              } satisfies grida.program.nodes.RegularPolygonNode;
            }

            case "star": {
              return {
                type: "star" as const,
                ...baseFields,
                point_count: shapeData.point_count ?? 5,
                inner_radius: shapeData.inner_radius ?? 0.5,
                corner_radius: cornerRadius,
                ...(cornerSmoothing !== 0
                  ? { corner_smoothing: cornerSmoothing }
                  : {}),
              } satisfies grida.program.nodes.RegularStarPolygonNode;
            }
          }
        }

        /**
         * Decodes ContainerNode.
         */
        export function container(
          n: fbs.ContainerNode,
          id: string,
          systemNode: fbs.SystemNodeTrait,
          layer: fbs.LayerTrait | null,
          opacity: number,
          layoutFields: ReturnType<typeof format.layout.decode.nodeLayout>,
          effects?: grida.program.nodes.i.IEffects
        ): grida.program.nodes.ContainerNode {
          const strokeGeometry = n.strokeGeometry();
          const cornerRadius = n.cornerRadius();
          const fillPaints = format.paint.decode.fillPaints(n);
          const strokePaints = format.paint.decode.strokePaints(n);
          const clipsContent = n.clipsContent();

          const strokeGeometryProps =
            format.shape.decode.rectangularStrokeGeometryTrait(strokeGeometry);
          const cornerRadiusProps =
            format.shape.decode.rectangularCornerRadiusTrait(cornerRadius);

          const baseName = systemNode.name() ?? "container";
          const baseActive = systemNode.active() ?? true;
          const baseLocked = systemNode.locked() ?? false;

          return {
            type: "container",
            id,
            name: baseName,
            active: baseActive,
            locked: baseLocked,
            opacity,
            z_index: 0,
            href: undefined,
            target: undefined,
            cursor: undefined,
            ...(fillPaints ? { fill_paints: fillPaints } : {}),
            ...(strokePaints ? { stroke_paints: strokePaints } : {}),
            layout: "flow",
            direction: "horizontal" as cg.Axis,
            main_axis_alignment: "start" as cg.MainAxisAlignment,
            cross_axis_alignment: "start" as cg.CrossAxisAlignment,
            main_axis_gap: 0,
            cross_axis_gap: 0,
            padding_top: 0,
            padding_right: 0,
            padding_bottom: 0,
            padding_left: 0,
            stroke_width:
              format.shape.decode.deriveStrokeWidth(strokeGeometryProps),
            stroke_cap: strokeGeometryProps.stroke_cap,
            stroke_join: strokeGeometryProps.stroke_join,
            rectangular_corner_radius_top_left:
              cornerRadiusProps.rectangular_corner_radius_top_left,
            rectangular_corner_radius_top_right:
              cornerRadiusProps.rectangular_corner_radius_top_right,
            rectangular_corner_radius_bottom_left:
              cornerRadiusProps.rectangular_corner_radius_bottom_left,
            rectangular_corner_radius_bottom_right:
              cornerRadiusProps.rectangular_corner_radius_bottom_right,
            corner_smoothing: cornerRadiusProps.corner_smoothing,
            rectangular_stroke_width_top:
              strokeGeometryProps.rectangular_stroke_width_top,
            rectangular_stroke_width_right:
              strokeGeometryProps.rectangular_stroke_width_right,
            rectangular_stroke_width_bottom:
              strokeGeometryProps.rectangular_stroke_width_bottom,
            rectangular_stroke_width_left:
              strokeGeometryProps.rectangular_stroke_width_left,
            ...(clipsContent ? { clips_content: clipsContent } : {}),
            ...layoutFields,
            ...(effects || {}),
          } satisfies grida.program.nodes.ContainerNode;
        }

        /**
         * Decodes TextNode.
         */
        export function text(
          n: fbs.TextSpanNode,
          id: string,
          systemNode: fbs.SystemNodeTrait,
          layer: fbs.LayerTrait | null,
          opacity: number,
          layoutFields: ReturnType<typeof format.layout.decode.nodeLayout>,
          effects?: grida.program.nodes.i.IEffects
        ): grida.program.nodes.TextNode {
          const textProps = n.properties();

          // Decode text alignment from TextSpanNodeProperties
          let textAlign: cg.TextAlign = "left";
          let textAlignVertical: cg.TextAlignVertical = "top";
          let textDecorationLine: cg.TextDecorationLine = "none";
          let fontSize: number = 14;
          let fontWeight: number = 400;
          let fontKerning: boolean = true;
          if (textProps) {
            textAlign = format.styling.decode.textAlign(textProps.textAlign());
            textAlignVertical = format.styling.decode.textAlignVertical(
              textProps.textAlignVertical()
            );

            // Decode text decoration and font properties from TextSpanNodeProperties.text_style
            const textStyle = textProps.textStyle();
            if (textStyle) {
              const decoration = textStyle.textDecoration();
              if (decoration) {
                textDecorationLine = format.styling.decode.textDecorationLine(
                  decoration.textDecorationLine()
                );
              }
              // Decode font properties
              const fontSizeValue = textStyle.fontSize();
              if (fontSizeValue !== 0) {
                fontSize = fontSizeValue;
              }
              const fontWeightStruct = textStyle.fontWeight();
              if (fontWeightStruct) {
                fontWeight = fontWeightStruct.value();
              }
              fontKerning = textStyle.fontKerning();
            }
          }

          // Decode StrokeGeometryTrait
          const strokeGeometry = textProps?.strokeGeometry();
          const strokeGeometryProps = format.shape.decode.strokeGeometryTrait(
            strokeGeometry ?? null
          );

          // Decode paints from TextSpanNodeProperties
          const fillPaints = textProps
            ? format.paint.decode.fillPaints(textProps)
            : undefined;
          const strokePaints = textProps
            ? format.paint.decode.strokePaints(textProps)
            : undefined;

          const baseName = systemNode.name() ?? "text";
          const baseActive = systemNode.active() ?? true;
          const baseLocked = systemNode.locked() ?? false;

          // Decode font features
          let fontFeatures:
            | Partial<Record<cg.OpenTypeFeature, boolean>>
            | undefined = undefined;
          if (textProps) {
            const textStyle = textProps.textStyle();
            if (textStyle) {
              const fontFeaturesLength = textStyle.fontFeaturesLength();
              if (fontFeaturesLength > 0) {
                fontFeatures = {};
                for (let i = 0; i < fontFeaturesLength; i++) {
                  const feature = textStyle.fontFeatures(i);
                  if (feature) {
                    const tagObj = feature.openTypeFeatureTag();
                    if (tagObj) {
                      const tag = structs.openTypeFeatureTagToString(tagObj);
                      fontFeatures[tag as cg.OpenTypeFeature] =
                        feature.openTypeFeatureValue();
                    }
                  }
                }
                if (Object.keys(fontFeatures).length === 0) {
                  fontFeatures = undefined;
                }
              }
            }
          }

          return {
            type: "text",
            id,
            name: baseName,
            active: baseActive,
            locked: baseLocked,
            opacity,
            z_index: 0,
            // fill_paints and stroke_paints from TextSpanNodeProperties
            ...(fillPaints ? { fill_paints: fillPaints } : {}),
            ...(strokePaints ? { stroke_paints: strokePaints } : {}),
            stroke_width: strokeGeometryProps.stroke_width,
            // geometry via layout
            ...layoutFields,
            // text content and properties
            text: textProps?.text() ?? null,
            font_size: fontSize,
            font_weight: fontWeight,
            font_kerning: fontKerning,
            text_decoration_line: textDecorationLine,
            text_align: textAlign,
            text_align_vertical: textAlignVertical,
            ...(fontFeatures ? { font_features: fontFeatures } : {}),
            ...(textProps?.maxLines() !== undefined
              ? { max_lines: textProps.maxLines() }
              : {}),
            ...(textProps?.ellipsis()
              ? { ellipsis: textProps.ellipsis()! }
              : {}),
            ...(effects || {}),
          } satisfies grida.program.nodes.TextNode;
        }

        /**
         * Decodes LineNode.
         */
        export function line(
          n: fbs.LineNode,
          id: string,
          systemNode: fbs.SystemNodeTrait,
          layer: fbs.LayerTrait | null,
          opacity: number,
          layoutFields: ReturnType<typeof format.layout.decode.nodeLayout>,
          effects?: grida.program.nodes.i.IEffects
        ): grida.program.nodes.LineNode {
          const strokeGeometry = n.strokeGeometry();
          const strokePaints = format.paint.decode.strokePaints(n);

          const strokeGeometryProps = format.shape.decode.strokeGeometryTrait(
            strokeGeometry ?? null
          );

          // Convert width to number for IFixedDimension (height is always 0 for lines)
          const width =
            typeof layoutFields.width === "number" ? layoutFields.width : 0;

          const baseName = systemNode.name() ?? "line";

          return {
            type: "line",
            id,
            name: baseName,
            active: systemNode.active(),
            locked: systemNode.locked(),
            opacity,
            z_index: 0,
            // stroke_paints from LineNode
            ...(strokePaints ? { stroke_paints: strokePaints } : {}),
            // geometry via layout (height is always 0 for lines)
            position: layoutFields.position ?? "absolute",
            left: layoutFields.left,
            top: layoutFields.top,
            right: layoutFields.right,
            bottom: layoutFields.bottom,
            width,
            height: 0,
            rotation: layoutFields.rotation ?? 0,
            stroke_width: strokeGeometryProps.stroke_width,
            stroke_cap: strokeGeometryProps.stroke_cap,
            stroke_join: strokeGeometryProps.stroke_join,
            ...(effects || {}),
          } satisfies grida.program.nodes.LineNode;
        }

        /**
         * Decodes VectorNode.
         */
        export function vector(
          n: fbs.VectorNode,
          id: string,
          systemNode: fbs.SystemNodeTrait,
          layer: fbs.LayerTrait | null,
          opacity: number,
          layoutFields: ReturnType<typeof format.layout.decode.nodeLayout>,
          effects?: grida.program.nodes.i.IEffects
        ): grida.program.nodes.VectorNode {
          const strokeGeometry = n.strokeGeometry();
          const cornerRadius = n.cornerRadius();
          const fillPaints = format.paint.decode.fillPaints(n);
          const strokePaints = format.paint.decode.strokePaints(n);

          const strokeGeometryProps = format.shape.decode.strokeGeometryTrait(
            strokeGeometry ?? null
          );
          const cornerRadiusProps = format.shape.decode.cornerRadiusTrait(
            cornerRadius ?? null
          );

          // Decode vector_network
          const vectorNetworkData = n.vectorNetworkData();
          const vectorNetwork = vectorNetworkData
            ? format.vector.decode.vectorNetwork(vectorNetworkData)
            : ({ vertices: [], segments: [] } satisfies vn.VectorNetwork);

          // Convert width/height to numbers for IFixedDimension
          const width =
            typeof layoutFields.width === "number" ? layoutFields.width : 0;
          const height =
            typeof layoutFields.height === "number" ? layoutFields.height : 0;

          const baseName = systemNode.name() ?? "vector";

          return {
            type: "vector",
            id,
            name: baseName,
            active: systemNode.active(),
            locked: systemNode.locked(),
            opacity,
            z_index: 0,
            // fill_paints and stroke_paints from VectorNode
            ...(fillPaints ? { fill_paints: fillPaints } : {}),
            ...(strokePaints ? { stroke_paints: strokePaints } : {}),
            // geometry via layout (fixed dimensions)
            position: layoutFields.position ?? "absolute",
            left: layoutFields.left,
            top: layoutFields.top,
            right: layoutFields.right,
            bottom: layoutFields.bottom,
            width,
            height,
            rotation: layoutFields.rotation ?? 0,
            // vector-specific properties
            corner_radius: cornerRadiusProps.corner_radius,
            stroke_width: strokeGeometryProps.stroke_width,
            stroke_cap: strokeGeometryProps.stroke_cap,
            stroke_join: strokeGeometryProps.stroke_join,
            vector_network: vectorNetwork,
            ...(effects || {}),
          } satisfies grida.program.nodes.VectorNode;
        }

        /**
         * Decodes BooleanPathOperationNode.
         */
        export function boolean(
          n: fbs.BooleanOperationNode,
          id: string,
          systemNode: fbs.SystemNodeTrait,
          layer: fbs.LayerTrait | null,
          opacity: number,
          layoutFields: ReturnType<typeof format.layout.decode.nodeLayout>,
          effects?: grida.program.nodes.i.IEffects
        ): grida.program.nodes.BooleanPathOperationNode {
          const op = enums.BOOLEAN_OPERATION_DECODE.get(n.op()) ?? "union";

          const strokeGeometry = n.strokeGeometry();
          const cornerRadius = n.cornerRadius();
          const fillPaints = format.paint.decode.fillPaints(n);
          const strokePaints = format.paint.decode.strokePaints(n);

          const strokeGeometryProps = format.shape.decode.strokeGeometryTrait(
            strokeGeometry ?? null
          );
          const cornerRadiusProps = format.shape.decode.cornerRadiusTrait(
            cornerRadius ?? null
          );

          const baseName = systemNode.name() ?? "boolean";

          return {
            type: "boolean",
            id,
            name: baseName,
            active: systemNode.active(),
            locked: systemNode.locked(),
            opacity,
            z_index: 0,
            // fill_paints and stroke_paints from BooleanOperationNode
            ...(fillPaints ? { fill_paints: fillPaints } : {}),
            ...(strokePaints ? { stroke_paints: strokePaints } : {}),
            // geometry via layout (IPositioning, IRotation, ILayoutTrait)
            position: layoutFields.position ?? "absolute",
            left: layoutFields.left,
            top: layoutFields.top,
            right: layoutFields.right,
            bottom: layoutFields.bottom,
            width: layoutFields.width ?? "auto",
            height: layoutFields.height ?? "auto",
            rotation: layoutFields.rotation ?? 0,
            op,
            corner_radius: cornerRadiusProps.corner_radius,
            stroke_width: strokeGeometryProps.stroke_width,
            stroke_cap: strokeGeometryProps.stroke_cap,
            stroke_join: strokeGeometryProps.stroke_join,
            ...(effects || {}),
          } satisfies grida.program.nodes.BooleanPathOperationNode;
        }

        /**
         * Decodes GroupNode (fallback).
         */
        export function group(
          n: fbs.GroupNode,
          id: string,
          systemNode: fbs.SystemNodeTrait,
          layer: fbs.LayerTrait | null,
          opacity: number,
          layoutFields: ReturnType<typeof format.layout.decode.nodeLayout>,
          effects?: grida.program.nodes.i.IEffects
        ): grida.program.nodes.GroupNode {
          const baseName = systemNode.name() ?? "node";

          return {
            type: "group",
            id,
            name: baseName,
            active: systemNode.active(),
            locked: systemNode.locked(),
            opacity,
            ...layoutFields,
            position: layoutFields.position ?? "relative",
            ...(effects || {}),
          } satisfies grida.program.nodes.GroupNode;
        }
      }

      /**
       * Decodes a FlatBuffers binary to a TypeScript Document.
       *
       * @param bytes - The FlatBuffers binary data
       * @returns The decoded TS IR document
       */
      export function fromFlatbuffer(
        bytes: Uint8Array
      ): grida.program.document.Document {
        const buf = new flatbuffers.ByteBuffer(bytes);
        const gridaFile = fbs.GridaFile.getRootAsGridaFile(buf);
        const document = gridaFile.document();

        if (!document) {
          throw new Error(
            "Invalid FlatBuffers document: missing document table"
          );
        }

        const schemaVersion =
          document.schemaVersion() || grida.program.document.SCHEMA_VERSION;

        // Decode nodes array and collect parent references
        const nodes: Record<string, grida.program.nodes.Node> = {};
        const parentRefs: Array<{
          nodeId: string;
          parentId: string;
          position: string;
        }> = [];

        const nodeCount = document.nodesLength();
        for (let i = 0; i < nodeCount; i++) {
          const nodeType = document.nodesType(i);
          if (nodeType === null || nodeType === fbs.Node.NONE) continue;

          // Get typed node table using union
          const typedNode = unionListToNode(
            nodeType,
            (index: number, obj: any) => document.nodes(index, obj),
            i
          );
          if (!typedNode) continue;

          // SceneNode is special - it doesn't use LayerTrait
          if (nodeType === fbs.Node.SceneNode) {
            const sceneNode = typedNode as fbs.SceneNode;
            const systemNode = sceneNode.node()!;

            const idString = systemNode.id()!.id()!;
            const id = format.node.unpackId(idString);

            nodes[id] = nodeTypes.scene(sceneNode, id);
            // SceneNode doesn't have parent reference (it's a root node)
            continue;
          }

          // BasicShapeNode is special - it uses node() and layer() directly
          if (nodeType === fbs.Node.BasicShapeNode) {
            const basicShapeNode = typedNode as fbs.BasicShapeNode;
            const systemNode = basicShapeNode.node()!;
            const layer = basicShapeNode.layer()!;

            const idString = systemNode.id()!.id()!;
            const id = format.node.unpackId(idString);
            const layout = layer.layout();
            const layoutFields = layout
              ? format.layout.decode.nodeLayout(layout)
              : ({} as ReturnType<typeof format.layout.decode.nodeLayout>);

            // Decode parent reference
            const parent = layer.parent()!;
            const parentIdString = parent.parentId()!.id()!;
            const parentId = format.node.unpackId(parentIdString);
            const position = parent.position() ?? "";
            parentRefs.push({ nodeId: id, parentId, position });

            // Decode opacity from layer
            const opacity = layer.opacity() ?? 1.0;

            // Decode effects from layer
            const effects = layer.effects();
            const decodedEffects = effects
              ? format.effects.decode.layerEffects(effects)
              : undefined;

            nodes[id] = nodeTypes.basicShape(
              basicShapeNode,
              id,
              systemNode,
              layer,
              opacity,
              layoutFields,
              decodedEffects
            );
            continue;
          }

          // Access node and layer fields from typed node (for all other node types)
          const nodeWithLayer = typedNode as Exclude<
            typeof typedNode,
            fbs.SceneNode | fbs.BasicShapeNode
          >;
          const systemNode = (nodeWithLayer as any).node()!;
          const layer = (nodeWithLayer as any).layer()!;

          const idString = systemNode.id()!.id()!;
          const id = format.node.unpackId(idString);

          // Decode parent reference
          const parent = layer.parent()!;
          const parentIdString = parent.parentId()!.id()!;
          const parentId = format.node.unpackId(parentIdString);
          const position = parent.position() ?? "";
          parentRefs.push({ nodeId: id, parentId, position });

          // Layout (canonical fields)
          const layout = layer.layout();
          const layoutFields = layout
            ? format.layout.decode.nodeLayout(layout)
            : ({} as ReturnType<typeof format.layout.decode.nodeLayout>);

          // Decode opacity from layer
          const opacity = layer.opacity() ?? 1.0;

          // Decode effects from layer
          const effects = layer.effects();
          const decodedEffects = effects
            ? format.effects.decode.layerEffects(effects)
            : undefined;

          // Minimal node reconstruction with safe defaults
          switch (nodeType) {
            case fbs.Node.ContainerNode:
              nodes[id] = nodeTypes.container(
                typedNode as fbs.ContainerNode,
                id,
                systemNode,
                layer,
                opacity,
                layoutFields,
                decodedEffects
              );
              break;
            case fbs.Node.TextSpanNode:
              nodes[id] = nodeTypes.text(
                typedNode as fbs.TextSpanNode,
                id,
                systemNode,
                layer,
                opacity,
                layoutFields,
                decodedEffects
              );
              break;
            case fbs.Node.LineNode:
              nodes[id] = nodeTypes.line(
                typedNode as fbs.LineNode,
                id,
                systemNode,
                layer,
                opacity,
                layoutFields,
                decodedEffects
              );
              break;
            case fbs.Node.VectorNode:
              nodes[id] = nodeTypes.vector(
                typedNode as fbs.VectorNode,
                id,
                systemNode,
                layer,
                opacity,
                layoutFields,
                decodedEffects
              );
              break;
            case fbs.Node.BooleanOperationNode:
              nodes[id] = nodeTypes.boolean(
                typedNode as fbs.BooleanOperationNode,
                id,
                systemNode,
                layer,
                opacity,
                layoutFields,
                decodedEffects
              );
              break;
            case fbs.Node.GroupNode:
              nodes[id] = nodeTypes.group(
                typedNode as fbs.GroupNode,
                id,
                systemNode,
                layer,
                opacity,
                layoutFields,
                decodedEffects
              );
              break;
            default:
              nodes[id] = nodeTypes.group(
                typedNode as fbs.GroupNode,
                id,
                systemNode,
                layer,
                opacity,
                layoutFields,
                decodedEffects
              );
              break;
          }
        }

        // Reconstruct links from parent references
        // Group children by parent_id and sort by position
        const links: Record<string, string[] | undefined> = {};
        const parentToChildren = new Map<
          string,
          Array<{ nodeId: string; position: string }>
        >();

        for (const ref of parentRefs) {
          if (!parentToChildren.has(ref.parentId)) {
            parentToChildren.set(ref.parentId, []);
          }
          parentToChildren.get(ref.parentId)!.push({
            nodeId: ref.nodeId,
            position: ref.position,
          });
        }

        // Sort children by position (lexicographic) and build links
        for (const [parentId, children] of parentToChildren.entries()) {
          children.sort((a, b) => a.position.localeCompare(b.position));
          links[parentId] = children.map((c) => c.nodeId);
        }

        // Initialize links for all nodes (empty array if no children)
        for (const nodeId of Object.keys(nodes)) {
          if (!(nodeId in links)) {
            links[nodeId] = [];
          }
        }

        // Decode scenes array
        const scenesRef: string[] = [];
        const sceneCount = document.scenesLength();
        for (let i = 0; i < sceneCount; i++) {
          const sceneId = document.scenes(i)?.id();
          if (sceneId) {
            scenesRef.push(format.node.unpackId(sceneId));
          }
        }

        // Return minimal document structure (Document doesn't have schema_version, it's in the file wrapper)
        return {
          nodes,
          links,
          scenes_ref: scenesRef,
          entry_scene_id: undefined,
          images: {},
          bitmaps: {},
          properties: {},
        } satisfies grida.program.document.Document;
      }
    }
  }
}
