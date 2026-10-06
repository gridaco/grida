export type WorkflowEdge = {
  from: string;
  to: string;
  /** Route above sibling outputs on wide layouts; direct when stacked. */
  route?: "direct" | "above";
};

type Box = { x: number; y: number; width: number; height: number };
type Point = { x: number; y: number };
type Port = Point & { side: "left" | "right" | "top" | "bottom" };

/** Layout-aware SVG connectors. The React layer only owns its lifetime. */
export class WorkflowEdges {
  static layout(
    from: Box,
    to: Box,
    route: WorkflowEdge["route"],
    laneY: number
  ) {
    const center = (box: Box) => ({
      x: box.x + box.width / 2,
      y: box.y + box.height / 2,
    });
    const a = center(from);
    const b = center(to);
    const horizontal = to.x >= from.x + from.width || from.x >= to.x + to.width;
    const forward = horizontal ? b.x >= a.x : b.y >= a.y;
    const source: Port = horizontal
      ? {
          x: from.x + (forward ? from.width : 0),
          y: a.y,
          side: forward ? "right" : "left",
        }
      : {
          x: a.x,
          y: from.y + (forward ? from.height : 0),
          side: forward ? "bottom" : "top",
        };
    const target: Port = horizontal
      ? {
          x: to.x + (forward ? 0 : to.width),
          y: b.y,
          side: forward ? "left" : "right",
        }
      : {
          x: b.x,
          y: to.y + (forward ? 0 : to.height),
          side: forward ? "top" : "bottom",
        };
    if (route === "above" && horizontal && forward) {
      target.x = b.x;
      target.y = to.y;
      target.side = "top";
      const gutter = Math.min(24, (to.x - source.x) / 2);
      return {
        source,
        target,
        path: this.roundedPath([
          source,
          { x: source.x + gutter, y: source.y },
          { x: source.x + gutter, y: laneY },
          { x: target.x, y: laneY },
          target,
        ]),
      };
    }
    const distance = horizontal
      ? Math.abs(target.x - source.x)
      : Math.abs(target.y - source.y);
    const bend = Math.min(100, distance * 0.5);
    const sign = forward ? 1 : -1;
    const c1 = horizontal
      ? { x: source.x + sign * bend, y: source.y }
      : { x: source.x, y: source.y + sign * bend };
    const c2 = horizontal
      ? { x: target.x - sign * bend, y: target.y }
      : { x: target.x, y: target.y - sign * bend };
    return {
      source,
      target,
      path: `M ${source.x} ${source.y} C ${c1.x} ${c1.y} ${c2.x} ${c2.y} ${target.x} ${target.y}`,
    };
  }

  private static roundedPath(points: Point[]) {
    let path = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length - 1; i++) {
      const previous = points[i - 1];
      const corner = points[i];
      const next = points[i + 1];
      const before = Math.hypot(corner.x - previous.x, corner.y - previous.y);
      const after = Math.hypot(next.x - corner.x, next.y - corner.y);
      if (!before || !after) continue;
      const radius = Math.min(12, before / 2, after / 2);
      const a = {
        x: corner.x + ((previous.x - corner.x) * radius) / before,
        y: corner.y + ((previous.y - corner.y) * radius) / before,
      };
      const b = {
        x: corner.x + ((next.x - corner.x) * radius) / after,
        y: corner.y + ((next.y - corner.y) * radius) / after,
      };
      path += ` L ${a.x} ${a.y} Q ${corner.x} ${corner.y} ${b.x} ${b.y}`;
    }
    const last = points[points.length - 1];
    return `${path} L ${last.x} ${last.y}`;
  }

  private readonly root: HTMLElement;
  private readonly events = new AbortController();
  private readonly observer: ResizeObserver;
  private readonly mutations: MutationObserver;
  private readonly animatedNodes = new Set<HTMLElement>();
  private readonly nodes = new Map<string, HTMLElement>();
  private readonly paths: {
    edge: WorkflowEdge;
    path: SVGPathElement;
    source: SVGCircleElement;
    target: SVGCircleElement;
  }[];
  private frame: number | null = null;
  private progress = 1;
  private disposed = false;

  constructor(
    private readonly svg: SVGSVGElement,
    edges: readonly WorkflowEdge[]
  ) {
    this.root = svg.parentElement!;
    for (const node of this.root.querySelectorAll<HTMLElement>(
      "[data-workflow-node]"
    )) {
      this.nodes.set(node.dataset.workflowNode!, node);
    }
    this.paths = edges.map((edge) => {
      const path = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "path"
      );
      path.setAttribute("fill", "none");
      path.setAttribute("stroke", "currentColor");
      path.setAttribute("stroke-width", "1.2");
      path.setAttribute("vector-effect", "non-scaling-stroke");
      path.setAttribute("pathLength", "1");
      path.setAttribute("stroke-dasharray", "1");
      const source = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "circle"
      );
      const target = document.createElementNS(
        "http://www.w3.org/2000/svg",
        "circle"
      );
      for (const port of [source, target]) {
        port.setAttribute("r", "2.5");
        port.setAttribute("fill", "currentColor");
      }
      svg.append(path, source, target);
      return { edge, path, source, target };
    });
    this.observer = new ResizeObserver(this.update);
    this.observer.observe(this.root);
    for (const node of this.nodes.values()) this.observer.observe(node);
    this.mutations = new MutationObserver(this.update);
    for (const node of this.nodes.values()) {
      for (
        let ancestor: HTMLElement | null = node;
        ancestor;
        ancestor = ancestor.parentElement
      ) {
        this.mutations.observe(ancestor, {
          attributes: true,
          attributeFilter: ["style", "class", "data-state"],
        });
        if (this.root.contains(ancestor)) this.animatedNodes.add(ancestor);
        if (ancestor.tagName === "SECTION") break;
      }
    }
    const { signal } = this.events;
    window.addEventListener("resize", this.update, { passive: true, signal });
    this.root.addEventListener("scroll", this.update, {
      passive: true,
      capture: true,
      signal,
    });
    this.root.addEventListener("animationstart", this.onAnimation, {
      capture: true,
      signal,
    });
    this.root.addEventListener("transitionrun", this.onAnimation, {
      capture: true,
      signal,
    });
    this.render();
    this.update();
  }

  setProgress(value: number) {
    this.progress = Math.max(0, Math.min(1, value));
    this.update();
  }

  update = () => {
    if (this.disposed || this.frame !== null) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = null;
      this.render();
      // Follow entrance transforms on the connected nodes, never their endlessly
      // animated artwork. No persistent frame loop once the nodes settle.
      if (
        [...this.animatedNodes].some((node) =>
          node
            .getAnimations()
            .some((animation) => animation.playState === "running")
        )
      )
        this.update();
    });
  };

  private onAnimation = (event: Event) => {
    if ([...this.animatedNodes].some((node) => node === event.target))
      this.update();
  };

  private render() {
    const rootBox = this.root.getBoundingClientRect();
    if (!rootBox.width || !rootBox.height) return;
    this.svg.setAttribute("viewBox", `0 0 ${rootBox.width} ${rootBox.height}`);
    const boxes = new Map<string, Box>();
    for (const [id, node] of this.nodes) {
      const rect = node.getBoundingClientRect();
      boxes.set(id, {
        x: rect.left - rootBox.left,
        y: rect.top - rootBox.top,
        width: rect.width,
        height: rect.height,
      });
    }
    const laneY = Math.max(
      8,
      Math.min(
        ...this.paths.map(({ edge }) => boxes.get(edge.to)?.y ?? Infinity)
      ) - 22
    );
    for (const { edge, path, source, target } of this.paths) {
      const a = boxes.get(edge.from);
      const b = boxes.get(edge.to);
      if (!a || !b || !a.width || !b.width) {
        path.setAttribute("d", "");
        source.style.display = target.style.display = "none";
        continue;
      }
      const layout = WorkflowEdges.layout(a, b, edge.route, laneY);
      path.setAttribute("d", layout.path);
      path.setAttribute("stroke-dashoffset", String(1 - this.progress));
      for (const [circle, port] of [
        [source, layout.source],
        [target, layout.target],
      ] as const) {
        circle.style.display = "";
        circle.setAttribute("cx", String(port.x));
        circle.setAttribute("cy", String(port.y));
      }
    }
  }

  dispose() {
    this.disposed = true;
    this.events.abort();
    this.observer.disconnect();
    this.mutations.disconnect();
    if (this.frame !== null) cancelAnimationFrame(this.frame);
    this.svg.replaceChildren();
  }
}
