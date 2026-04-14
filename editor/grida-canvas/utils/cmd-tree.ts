import * as treeify from "../libs/treefy";
import type { TreeObject } from "../libs/treefy";
import type grida from "@grida/schema";
import type cg from "@grida/cg";
import tree from "@grida/tree";

type Document = grida.program.document.Document;
type DocumentContext =
  grida.program.document.internal.INodesRepositoryRuntimeHierarchyContext;
type Node = grida.program.nodes.Node;

interface TreeBranch {
  [label: string]: TreeBranch | "";
}

const RADIUS_ELIGIBLE = new Set<Node["type"]>(["rectangle", "container"]);
const TYPE_LABELS: Partial<Record<Node["type"], string>> = {
  scene: "Scene",
  container: "Frame",
  group: "Group",
  tspan: "TextSpan",
  rectangle: "Rect",
  ellipse: "Ellipse",
  polygon: "Polygon",
  star: "Star",
  image: "Image",
  video: "Video",
  vector: "Vector",
  boolean: "Boolean",
  component: "Component",
  instance: "Instance",
  template_instance: "Template",
  bitmap: "Bitmap",
  line: "Line",
};

const ICON_MAP: Partial<Record<Node["type"], keyof TreeAsciiChars>> = {
  scene: "symbol_container_26F6",
  container: "symbol_container_26F6",
  component: "symbol_container_26F6",
  group: "symbol_group_2B1A",
  instance: "symbol_group_2B1A",
  template_instance: "symbol_group_2B1A",
  tspan: "symbol_text_270E",
  rectangle: "symbol_rect_25FC",
  image: "symbol_rect_25FC",
  video: "symbol_rect_25FC",
  bitmap: "symbol_rect_25FC",
  line: "symbol_rect_25FC",
  polygon: "symbol_polygon_2B22",
  vector: "symbol_polygon_2B22",
  boolean: "symbol_polygon_2B22",
  ellipse: "symbol_ellipse_25CF",
  star: "symbol_star_2605",
};

export interface TreeAsciiChars {
  symbol_container_26F6: string;
  symbol_group_2B1A: string;
  symbol_text_270E: string;
  symbol_rect_25FC: string;
  symbol_polygon_2B22: string;
  symbol_ellipse_25CF: string;
  symbol_star_2605: string;
}

export interface DescribeDocumentTreeOptions {
  entryId?: string;
  chars: TreeAsciiChars;
}

export function describeDocumentTree(
  document: Document,
  context: DocumentContext,
  { entryId, chars }: DescribeDocumentTreeOptions
): string {
  const treeLUT = new tree.lut.TreeLUT(context);
  const visited = new Set<string>();
  const branch = entryId
    ? buildNodeBranch(document, treeLUT, entryId, chars, visited)
    : buildDocumentBranch(document, treeLUT, chars, visited);

  if (!branch || Object.keys(branch).length === 0) {
    return "";
  }

  return treeify.asTree(branch as TreeObject, false, false).trimEnd();
}

function buildDocumentBranch(
  document: Document,
  treeLUT: tree.lut.TreeLUT,
  chars: TreeAsciiChars,
  visited: Set<string>
): TreeBranch {
  const childBranches: TreeBranch[] = [];

  for (const rootId of computeRootIds(document, treeLUT)) {
    const node = document.nodes[rootId];

    if (node?.type === "scene") {
      const sceneChildren = treeLUT
        .childrenOf(rootId)
        .map((childId) =>
          buildNodeBranch(document, treeLUT, childId, chars, visited)
        );
      childBranches.push(...sceneChildren);
      continue;
    }

    childBranches.push(
      buildNodeBranch(document, treeLUT, rootId, chars, visited)
    );
  }

  const label = formatDocumentLabel(document, chars, childBranches.length);

  return { [label]: mergeChildren(childBranches) };
}

function buildNodeBranch(
  document: Document,
  treeLUT: tree.lut.TreeLUT,
  nodeId: string,
  chars: TreeAsciiChars,
  visited: Set<string>
): TreeBranch {
  const node = document.nodes[nodeId];
  if (!node) {
    return { [`Missing node "${nodeId}"`]: "" };
  }

  const label = formatNodeLabel(node, chars);
  if (visited.has(nodeId)) {
    return { [`${label}  (circular)`]: "" };
  }

  visited.add(nodeId);
  const children = treeLUT
    .childrenOf(nodeId)
    .map((childId) =>
      buildNodeBranch(document, treeLUT, childId, chars, visited)
    );
  visited.delete(nodeId);

  return { [label]: mergeChildren(children) };
}

function mergeChildren(children: TreeBranch[]): TreeBranch | "" {
  if (!children.length) {
    return "";
  }

  return children.reduce(
    (acc, branch) => Object.assign(acc, branch),
    {} as TreeBranch
  );
}

function computeRootIds(
  document: Document,
  treeLUT: tree.lut.TreeLUT
): string[] {
  const roots: string[] = [];
  const seen = new Set<string>();

  const push = (id: string | undefined) => {
    if (!id || seen.has(id)) return;
    seen.add(id);
    roots.push(id);
  };

  (document.scenes_ref ?? []).forEach((sceneId) => {
    if (treeLUT.parentOf(sceneId) === null) push(sceneId);
  });

  treeLUT.lut.lu_keys.forEach((id) => {
    if (treeLUT.parentOf(id) === null) push(id);
  });

  if (!roots.length) {
    Object.keys(document.nodes ?? {}).forEach(push);
  }

  return roots;
}

function formatDocumentLabel(
  document: Document,
  chars: TreeAsciiChars,
  childCount: number
): string {
  const meta: string[] = [];
  const nodeCount = Object.keys(document.nodes ?? {}).length;
  if (nodeCount) meta.push(`nodes=${nodeCount}`);

  const sceneCount = document.scenes_ref?.length ?? 0;
  if (sceneCount) meta.push(`scenes=${sceneCount}`);

  if (document.entry_scene_id) meta.push(`entry=${document.entry_scene_id}`);
  if (childCount === 0) meta.push("empty");

  const suffix = meta.length ? ` (${meta.join(", ")})` : "";
  return `${chars.symbol_container_26F6}  Document${suffix}`;
}

function formatNodeLabel(node: Node, chars: TreeAsciiChars): string {
  const iconKey = ICON_MAP[node.type] ?? "symbol_group_2B1A";
  const icon = chars[iconKey];
  const type = TYPE_LABELS[node.type] ?? capitalize(node.type);
  const name = node.name ? ` ${node.name}` : "";
  const identity = `(type=${node.type}, id=${node.id})`;
  const metadata = nodeMetadata(node);

  return [
    icon ? `${icon}  ${type}${name}` : `${type}${name}`,
    identity,
    ...metadata,
  ]
    .filter(Boolean)
    .join("  ");
}

function nodeMetadata(node: Node): string[] {
  switch (node.type) {
    case "tspan":
      return textMetadata(node);
    case "polygon": {
      const metadata = defaultMetadata(node);
      const sides = readNumber(node, "point_count");
      if (sides !== undefined) metadata.push(`sides=${formatNumber(sides)}`);
      return metadata;
    }
    case "star": {
      const metadata = defaultMetadata(node);
      const sides = readNumber(node, "point_count");
      if (sides !== undefined) metadata.push(`sides=${formatNumber(sides)}`);
      const inner = readNumber(node, "inner_radius");
      if (inner !== undefined) metadata.push(`inner=${formatNumber(inner)}`);
      return metadata;
    }
    default:
      return defaultMetadata(node);
  }
}

function textMetadata(node: Node): string[] {
  const meta: string[] = [];
  const text = extractText(node);
  if (text) meta.push(`"${text}"`);

  const font = readString(node, "font_family");
  if (font) meta.push(`font=${font}`);

  const size = readNumber(node, "font_size");
  if (size !== undefined) meta.push(`size=${formatNumber(size)}`);

  const weight =
    readString(node, "font_weight") ?? readNumber(node, "font_weight");
  if (weight !== undefined) meta.push(`weight=${weight}`);

  return meta;
}

function defaultMetadata(node: Node): string[] {
  const meta: string[] = [];
  const width = readNumber(node, "layout_target_width");
  const height = readNumber(node, "layout_target_height");
  if (width !== undefined && height !== undefined) {
    meta.push(`[${formatNumber(width)}×${formatNumber(height)}]`);
  }

  const fill = formatFill(node);
  if (fill) meta.push(`fill=${fill}`);

  const opacity = readNumber(node, "opacity");
  if (opacity !== undefined && Number.isFinite(opacity) && opacity !== 1) {
    meta.push(`opacity=${formatNumber(opacity)}`);
  }

  if (RADIUS_ELIGIBLE.has(node.type)) {
    const radius = formatCornerRadius(node);
    if (radius) meta.push(radius);
  }

  return meta;
}

function formatFill(node: Node): string | null {
  const paint = resolvePaint(node);
  if (!paint) return null;

  if (paint.type === "solid" && paint.color) {
    const hex = colorToHex(paint.color);
    const alpha = extractAlpha(paint.color);
    return alpha < 1 ? `${hex}@${formatNumber(alpha)}` : hex;
  }

  return paint.type;
}

function resolvePaint(node: Node): cg.Paint | null {
  const n = node as grida.program.nodes.UnknownNodeProperties;
  const fill = n.fill;
  if (fill && typeof fill === "object" && "type" in fill) {
    return fill as cg.Paint;
  }

  const fills = n.fill_paints;
  if (Array.isArray(fills) && fills.length > 0) {
    const paints = fills as cg.Paint[];
    return paints.find((entry) => entry.active !== false) ?? paints[0];
  }

  return null;
}

function formatCornerRadius(node: Node): string | null {
  const uniform = readNumber(node, "corner_radius");
  if (uniform !== undefined && uniform > 0) {
    return `radius=${formatNumber(uniform)}`;
  }

  const corners = [
    readNumber(node, "rectangular_corner_radius_top_left"),
    readNumber(node, "rectangular_corner_radius_top_right"),
    readNumber(node, "rectangular_corner_radius_bottom_right"),
    readNumber(node, "rectangular_corner_radius_bottom_left"),
  ];

  const defined = corners.filter((value) => value !== undefined);
  if (!defined.length) return null;

  // If all defined values are 0, omit radius
  if (defined.every((value) => value === 0)) return null;

  if (defined.every((value) => value === defined[0])) {
    return `radius=${formatNumber(defined[0]!)}`;
  }

  const formatted = corners
    .map((value) => (value === undefined ? "-" : formatNumber(value)))
    .join(",");
  return `radius=[${formatted}]`;
}

function extractText(node: Node): string | null {
  const raw = (node as grida.program.nodes.UnknownNodeProperties).text;
  if (!raw) return null;

  let value: string | null = null;
  if (typeof raw === "string") {
    value = raw;
  } else if (typeof raw === "object" && raw !== null) {
    const obj = raw as { value?: string; text?: string };
    if (typeof obj.value === "string") {
      value = obj.value;
    } else if (typeof obj.text === "string") {
      value = obj.text;
    }
  }

  if (!value) return null;
  return truncate(normalizeWhitespace(value), 64).replace(/"/g, "'");
}

function colorToHex(color: cg.RGBA32F): string {
  const r = normalizeColorComponent(color.r);
  const g = normalizeColorComponent(color.g);
  const b = normalizeColorComponent(color.b);
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function extractAlpha(color: cg.RGBA32F): number {
  return clamp(color.a, 0, 1);
}

function normalizeColorComponent(value: number): number {
  if (value <= 1) return clamp(Math.round(value * 255), 0, 255);
  return clamp(Math.round(value), 0, 255);
}

function toHex(value: number): string {
  return value.toString(16).padStart(2, "0").toUpperCase();
}

function readNumber(
  node: Node,
  key: keyof grida.program.nodes.UnknownNode
): number | undefined {
  const value = (node as grida.program.nodes.UnknownNodeProperties)[key];
  return typeof value === "number" ? value : undefined;
}

function readString(
  node: Node,
  key: keyof grida.program.nodes.UnknownNode
): string | undefined {
  const value = (node as grida.program.nodes.UnknownNodeProperties)[key];
  return typeof value === "string" && value.length ? value : undefined;
}

function formatNumber(value: number): string {
  if (!Number.isFinite(value)) return String(value);
  if (value === 0) return "0";

  const abs = Math.abs(value);
  if (abs >= 1000) return Math.round(value).toString();
  if (Number.isInteger(value)) return value.toString();
  if (abs < 1) return value.toFixed(2).replace(/\.?0+$/, "");

  return value.toFixed(1).replace(/\.0$/, "");
}

function capitalize(value: string): string {
  return value ? value.charAt(0).toUpperCase() + value.slice(1) : value;
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

function normalizeWhitespace(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
