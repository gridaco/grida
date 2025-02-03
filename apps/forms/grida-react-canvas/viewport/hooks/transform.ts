import { useDocument, useEventTarget } from "@/grida-react-canvas";
import {
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { ViewportSurfaceContext } from "../context";
import { cmath } from "@grida/cmath";
import { SurfaceNodeObject, SurfaceSelectionGroup } from "../core";
import { analyzeDistribution } from "../ui/distribution";
import { domapi } from "@/grida-react-canvas/domapi";
import { rectToSurfaceSpace } from "@/grida-react-canvas/utils/transform";

function useViewportSurfacePortal() {
  const context = useContext(ViewportSurfaceContext);
  if (!context) {
    throw new Error(
      "useCanvasOverlay must be used within a CanvasEventTarget."
    );
  }
  return context.portal;
}

function useNodeDomElement(node_id: string) {
  const [nodeElement, setNodeElement] = useState<HTMLElement | null>(null);

  useLayoutEffect(() => {
    if (!node_id) {
      setNodeElement(null);
      return;
    }

    const element = document.getElementById(node_id);
    setNodeElement(element);
  }, [node_id]);

  return nodeElement;
}

function useNodeDomElements(node_ids: string[]) {
  const [nodeElement, setNodeElement] = useState<HTMLElement[] | null>(null);

  useLayoutEffect(() => {
    if (!node_ids.length) {
      setNodeElement(null);
      return;
    }

    const elements = node_ids
      .map((node_id) => document.getElementById(node_id))
      .filter(Boolean) as HTMLElement[];
    setNodeElement(elements);
  }, [node_ids]);

  return nodeElement;
}

/**
 * returns the relative transform of the node surface relative to the portal
 * TODO: Not tested with the performance
 */
export function useNodeSurfaceTransfrom(node_id: string) {
  const { transform } = useEventTarget();
  const __rect_fallback = useMemo(() => new DOMRect(0, 0, 0, 0), []);
  const { getNodeAbsoluteRotation } = useDocument();
  const portal = useViewportSurfacePortal();
  const node_element = useNodeDomElement(node_id);

  const [rect, setRect] = useState<cmath.Rectangle>();
  const [size, setSize] = useState<cmath.Vector2>([0, 0]);
  const [style, setStyle] = useState({
    top: 0,
    left: 0,
    transform: "",
    width: 0,
    height: 0,
  });

  useEffect(() => {
    if (!node_element || !portal) return;

    const scale = cmath.transform.getScale(transform);

    const updateTransform = () => {
      const portal_rect = portal.getBoundingClientRect();
      const node_element_bounding_rect =
        node_element.getBoundingClientRect() ?? __rect_fallback;

      const centerX =
        node_element_bounding_rect.left +
        node_element_bounding_rect.width / 2 -
        portal_rect.left;
      const centerY =
        node_element_bounding_rect.top +
        node_element_bounding_rect.height / 2 -
        portal_rect.top;

      const width = node_element.clientWidth;
      const height = node_element.clientHeight;

      const absolute_rotation = getNodeAbsoluteRotation(node_id);

      setRect({
        x: node_element_bounding_rect.left,
        y: node_element_bounding_rect.top,
        width: width * scale[0],
        height: height * scale[1],
      });

      setSize([width, height]);

      setStyle({
        top: centerY,
        left: centerX,
        transform: `translate(-50%, -50%) rotate(${absolute_rotation ?? 0}deg)`,
        width: width * scale[0],
        height: height * scale[1],
      });
    };

    // Observe size changes
    const resizeObserver = new ResizeObserver(() => updateTransform());
    resizeObserver.observe(node_element);

    // Trigger initial update
    updateTransform();

    return () => {
      resizeObserver.disconnect();
    };
  }, [
    node_element,
    portal,
    getNodeAbsoluteRotation,
    node_id,
    __rect_fallback,
    // recompute when viewport changes
    transform,
  ]);

  return { style, rect, size };
}

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

const __initial_surface_selection_group: SurfaceSelectionGroup = {
  selection: [],
  size: [0, 0],
  boundingSurfaceRect: { x: 0, y: 0, width: 0, height: 0 },
  style: { top: 0, left: 0, transform: "", width: 0, height: 0 },
  distribution: {
    rects: [],
    x: undefined,
    y: undefined,
    preferredDistributeEvenlyActionAxis: undefined,
  },
  objects: [],
};

/**
 * returns the relative transform of the group surface relative to the portal
 * The group surface will not have rotation - each children rotation is applied to calculate the group bounding rect
 */
export function useGroupSurfaceTransform(
  ...node_ids: string[]
): SurfaceSelectionGroup {
  const {
    state: { document },
  } = useDocument();
  const { transform } = useEventTarget();
  const portal = useViewportSurfacePortal();

  // Use stable node IDs to avoid unnecessary re-renders
  const __node_ids = useStableNodeIds(node_ids);
  const selection = useMemo(
    () =>
      __node_ids.map((id) => document.nodes[id]).filter((n) => n && n.active),
    [document.nodes, __node_ids]
  );

  const [data, setData] = useState<SurfaceSelectionGroup>(
    __initial_surface_selection_group
  );

  useLayoutEffect(() => {
    if (!portal) return;
    if (!selection.length) {
      setData(__initial_surface_selection_group);
      return;
    }

    const updateTransform = () => {
      // const portal_rect = portal.getBoundingClientRect();
      const cdom = new domapi.CanvasDOM(transform);

      // Collect bounding rectangles for all node elements
      const objects: SurfaceNodeObject[] = selection.map(({ id }) => {
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

      const boundingRect = cmath.rect.union(
        objects.map((it) => it.boundingRect)
      );

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

      setData({
        selection: selection.map((it) => it.id),
        boundingSurfaceRect: surfaceBoundingRect,
        size: [boundingRect.width, boundingRect.height],
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
      });
    };

    updateTransform();
  }, [selection, transform]);

  return data;
}
