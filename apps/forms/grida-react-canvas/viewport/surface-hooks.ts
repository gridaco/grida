import React, { useLayoutEffect, useMemo, useRef, useState } from "react";
import { useDocument, useNode } from "@/grida-react-canvas";
import { analyzeDistribution } from "./ui/distribution";
import { domapi } from "@/grida-react-canvas/domapi";
import { document } from "@/grida-react-canvas/document-query";
import { rectToSurfaceSpace } from "@/grida-react-canvas/utils/transform";
import { cmath } from "@grida/cmath";
import type { ObjectsDistributionAnalysis } from "./ui/distribution";
import { grida } from "@/grida";
import { NodeWithMeta } from "../provider";

export interface SurfaceNodeObject {
  id: string;
  boundingRect: cmath.Rectangle;
  boundingSurfaceRect: cmath.Rectangle;
}

// type SurfaceSelection = SurfaceSingleSelection | SurfaceSelectionGroup;

interface SurfaceSingleSelection {
  type: "single";

  /**
   * the selection, within the group (same parent) - surface overlay objects
   */
  object: SurfaceNodeObject;

  /**
   * id of object
   */
  id: string;

  /**
   * the node.
   */
  node: NodeWithMeta;

  /**
   * the measured size of the group, in canvas space, non rotated
   */
  size: cmath.Vector2;

  /**
   * surface-space bounding rect of the group
   */
  boundingSurfaceRect: cmath.Rectangle;

  /**
   * the absolute rotation of the group, used for displaying overlay
   * only present if single item. otherwise, it's 0
   */
  rotation: number;

  /**
   * style of the surface overlay, as-is. final computed.
   */
  style: React.CSSProperties;

  /**
   * the calculated distribution of the flex container, if the selection is a flex container
   */
  distribution?: ObjectsDistributionAnalysis;
}

export interface SurfaceSelectionGroup {
  type: "multiple";
  /**
   * the id of the group
   *
   * - the shared parent of the selection. if root, it's `""` empty.
   */
  group: string;

  /**
   * the selection, within the group (same parent) - surface overlay objects
   */
  objects: SurfaceNodeObject[];

  /**
   * ids of objects
   */
  ids: string[];

  /**
   * the measured size of the group, in canvas space, non rotated
   */
  size: cmath.Vector2;

  /**
   * surface-space bounding rect of the group
   */
  boundingSurfaceRect: cmath.Rectangle;

  /**
   * the absolute rotation of the group, used for displaying overlay
   * only present if single item. otherwise, it's 0
   */
  rotation: number;

  /**
   * the calculated distribution of the objects
   *
   * if single, it's `undefined`
   */
  distribution?: ObjectsDistributionAnalysis & {
    preferredDistributeEvenlyActionAxis: cmath.Axis | undefined;
  };

  /**
   * style of the surface overlay, as-is. final computed.
   */
  style: React.CSSProperties;
}

const SurfaceSelectionGroupsContext = React.createContext<
  SurfaceSelectionGroup[] | null
>(null);

export const SurfaceSelectionGroupProvider =
  SurfaceSelectionGroupsContext.Provider;

export const useSurfaceSelectionGroups = () => {
  const context = React.useContext(SurfaceSelectionGroupsContext);
  if (!context) {
    throw new Error(
      "useSurfaceSelectionGroup must be used within a SurfaceSelectionGroupProvider"
    );
  }
  return context;
};

/**
 * Custom hook to memoize an array based on its contents
 */
function useStableNodeIds(node_ids: string[]): string[] {
  const prevRef = useRef<string[]>(node_ids);
  const stableNodeIds = useMemo(() => {
    if (
      prevRef.current.length !== node_ids.length ||
      !shallowEqual(prevRef.current, node_ids)
    ) {
      prevRef.current = node_ids;
    }
    return prevRef.current;
  }, [node_ids]);
  return stableNodeIds;
}

/**
 * Helper function to perform shallow comparison of arrays
 */
function shallowEqual(arr1: string[], arr2: string[]): boolean {
  return (
    arr1.length === arr2.length &&
    arr1.every((item, index) => item === arr2[index])
  );
}

function computeSurfaceSelectionGroup({
  group,
  items,
  transform,
}: {
  group: string;
  items: string[];
  transform: cmath.Transform;
}): SurfaceSelectionGroup {
  const cdom = new domapi.CanvasDOM(transform);

  // Collect bounding rectangles for all node elements
  const objects: SurfaceNodeObject[] = items.map((id) => {
    const br = cdom.getNodeBoundingRect(id)!;
    const bsr = rectToSurfaceSpace(br, transform);
    return {
      id: id,
      boundingRect: {
        x: br.x,
        y: br.y,
        width: br.width,
        height: br.height,
      },
      boundingSurfaceRect: {
        x: bsr.x,
        y: bsr.y,
        width: bsr.width,
        height: bsr.height,
      },
    };
  });

  const boundingRect = cmath.rect.union(objects.map((it) => it.boundingRect));

  const surfaceBoundingRect = rectToSurfaceSpace(boundingRect, transform);

  const distribution = analyzeDistribution(
    objects.map((it) => it.boundingRect)
  );

  const preferredDistributeEvenlyActionAxis: "x" | "y" | undefined =
    distribution.x && distribution.x.gap === undefined
      ? "x"
      : distribution.y && distribution.y.gap === undefined
        ? "y"
        : undefined;

  const data: SurfaceSelectionGroup = {
    type: "multiple",
    group: group,
    ids: items,
    boundingSurfaceRect: surfaceBoundingRect,
    size: [boundingRect.width, boundingRect.height],
    rotation: 0,
    style: {
      position: "absolute",
      top: surfaceBoundingRect.y,
      left: surfaceBoundingRect.x,
      width: surfaceBoundingRect.width,
      height: surfaceBoundingRect.height,
      willChange: "transform",
    },
    distribution: {
      ...distribution,
      preferredDistributeEvenlyActionAxis,
    },
    objects: objects,
  };

  return data;
}

/**
 * returns the relative transform of the group surface relative to the portal
 * The group surface will not have rotation - each children rotation is applied to calculate the group bounding rect
 */
export function useSelectionGroups(
  ...node_ids: string[]
): SurfaceSelectionGroup[] {
  const { transform, state } = useDocument();

  // Use stable node IDs to avoid unnecessary re-renders
  const __node_ids = useStableNodeIds(node_ids);

  const [groups, setGroups] = useState<SurfaceSelectionGroup[]>([]);

  const grouped = useMemo(() => {
    const activenodes = __node_ids
      .map((id) => state.document.nodes[id])
      .filter((n) => n && n.active);
    return Object.groupBy(
      activenodes,
      (it) => document.getParentId(state.document_ctx, it.id) ?? ""
    );
  }, [state.document.nodes, state.document_ctx, __node_ids]);

  useLayoutEffect(() => {
    const groupkeys = Object.keys(grouped);
    if (groupkeys.length === 0) {
      setGroups([]);
      return;
    }

    const groups = groupkeys.map((key) => {
      const items = grouped[key]!;
      const group = computeSurfaceSelectionGroup({
        group: key,
        items: items.map((it) => it.id),
        transform,
      });
      return group;
    });

    setGroups(groups);
  }, [grouped, transform]);

  return groups;
}

/**
 * returns the relative transform of the node surface relative to the portal
 */
export function useSingleSelection(
  node_id: string,
  {
    enabled,
  }: {
    enabled: boolean;
  } = { enabled: true }
): SurfaceSingleSelection | undefined {
  const { transform, getNodeAbsoluteRotation, state } = useDocument();
  const node = state.document.nodes[node_id];

  const [data, setData] = useState<SurfaceSingleSelection | undefined>(
    undefined
  );

  useLayoutEffect(() => {
    if (!enabled) return;

    const element = window.document.getElementById(node_id);
    if (!element) {
      setData(undefined);
      return;
    }

    const scale = cmath.transform.getScale(transform);
    const cdom = new domapi.CanvasDOM(transform);

    // Collect bounding rectangle
    const br = cdom.getNodeBoundingRect(node_id)!;
    const bsr = rectToSurfaceSpace(br, transform);
    const object: SurfaceNodeObject = {
      id: node_id,
      boundingRect: {
        x: br.x,
        y: br.y,
        width: br.width,
        height: br.height,
      },
      boundingSurfaceRect: {
        x: bsr.x,
        y: bsr.y,
        width: bsr.width,
        height: bsr.height,
      },
    };

    const boundingSurfaceRect = rectToSurfaceSpace(
      object.boundingRect,
      transform
    );

    const width = element.clientWidth;
    const height = element.clientHeight;
    const size: cmath.Vector2 = [width, height];
    const absolute_rotation = getNodeAbsoluteRotation(node_id);

    const centerX = boundingSurfaceRect.x + boundingSurfaceRect.width / 2;
    const centerY = boundingSurfaceRect.y + boundingSurfaceRect.height / 2;

    const style: React.CSSProperties = {
      position: "absolute",
      top: centerY,
      left: centerX,
      width: width * scale[0],
      height: height * scale[1],
      transform: `translate(-50%, -50%) rotate(${absolute_rotation ?? 0}deg)`,
      willChange: "transform",
    };

    let distribution: ObjectsDistributionAnalysis | undefined = undefined;
    const is_flex_parent = node.type === "container" && node.layout === "flex";
    if (is_flex_parent) {
      distribution = {
        rects: [],
        x: undefined,
        y: undefined,
      };

      const container = node as grida.program.nodes.ContainerNode;
      const { direction, mainAxisGap, crossAxisGap } = container;
      const axis = direction === "horizontal" ? "x" : "y";
      const children = document.getChildren(state.document_ctx, node_id);
      const children_rects = children
        .map((id) => cdom.getNodeBoundingRect(id))
        .filter((it): it is cmath.Rectangle => !!it);

      distribution.rects = children_rects;
      distribution[axis] = {
        gap: mainAxisGap,
        tolerance: 0,
        gaps: Array.from(
          { length: children_rects.length - 1 },
          () => mainAxisGap
        ),
      };
    }

    setData({
      type: "single",
      id: node_id,
      object,
      rotation: absolute_rotation,
      size: size,
      style: style,
      boundingSurfaceRect: boundingSurfaceRect,
      distribution: distribution,
      node: {
        ...(node as grida.program.nodes.AnyNode),
        meta: {
          is_flex_parent,
          // TODO:
          is_component_consumer: false,
        },
      },
    });
  }, [getNodeAbsoluteRotation, node, node_id, transform, enabled]);

  return data;
}
