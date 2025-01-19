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
import { SelectionItem, SurfaceSelectionGroup } from "../core";

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

/**
 * returns the relative transform of the group surface relative to the portal
 * The group surface will not have rotation - each children rotation is applied to calculate the group bounding rect
 *
 * TODO: Not tested with the performance
 *
 * Uses MutationObserver to observe position changes - expensive
 */
export function useGroupSurfaceTransform(
  ...node_ids: string[]
): SurfaceSelectionGroup {
  const { transform } = useEventTarget();
  const portal = useViewportSurfacePortal();

  // Use stable node IDs to avoid unnecessary re-renders
  const stableNodeIds = useStableNodeIds(node_ids);

  const node_elements = useNodeDomElements(stableNodeIds);

  const [data, setData] = useState<SurfaceSelectionGroup>({
    selection: [],
    size: [0, 0],
    boundingRect: { x: 0, y: 0, width: 0, height: 0 },
    style: { top: 0, left: 0, transform: "", width: 0, height: 0 },
    items: [],
  });

  useEffect(() => {
    if (!portal || !node_elements?.length) return;

    // Rotation is ignored for groups
    const rotation = 0;

    const scale = cmath.transform.getScale(transform);

    const updateTransform = () => {
      const portal_rect = portal.getBoundingClientRect();

      // Collect bounding rectangles for all node elements
      const items: SelectionItem[] = node_elements.map((el) => {
        const cr = el.getBoundingClientRect();
        return {
          id: el.id,
          boundingRect: {
            x: cr.x,
            y: cr.y,
            width: cr.width,
            height: cr.height,
          },
        };
      });

      // Calculate the bounding rectangle that encloses all node elements
      const boundingRect = cmath.rect.union(items.map((it) => it.boundingRect));

      // Center of the bounding rect relative to the portal
      const centerX =
        boundingRect.x + boundingRect.width / 2 - portal_rect.left;
      const centerY =
        boundingRect.y + boundingRect.height / 2 - portal_rect.top;

      setData({
        selection: stableNodeIds,
        boundingRect: boundingRect,
        size: [
          boundingRect.width * (1 / scale[0]),
          boundingRect.height * (1 / scale[1]),
        ],
        style: {
          top: centerY,
          left: centerX,
          transform: `translate(-50%, -50%) rotate(${rotation}deg)`,
          width: boundingRect.width,
          height: boundingRect.height,
        },
        items,
      });
    };

    // Observe size changes using ResizeObserver
    const resizeObservers = node_elements.map((el) => {
      const observer = new ResizeObserver(() => updateTransform());
      el && observer.observe(el);
      return observer;
    });

    // Observe position changes using MutationObserver
    const mutationObserver = new MutationObserver(() => updateTransform());
    node_elements.forEach((el) => {
      if (el)
        mutationObserver.observe(el, {
          attributes: true,
          attributeFilter: ["style", "transform"],
        });
    });

    // Trigger initial update
    updateTransform();

    return () => {
      resizeObservers.forEach((observer) => observer.disconnect());
      mutationObserver.disconnect();
    };
  }, [
    stableNodeIds,
    node_elements,
    portal,
    // recompute when viewport changes
    transform,
  ]);

  return data;
}
