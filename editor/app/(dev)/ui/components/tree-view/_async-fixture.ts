import type {
  AsyncChangeEvent,
  AsyncTreeEntry,
  AsyncTreeProvider,
} from "@grida/tree-view/async";
import type { NodeId } from "@grida/tree-view";
import type { DemoMeta } from "./_fixtures";

/**
 * The shape of the in-memory FS the fake provider serves. Mirrors a
 * trimmed VS Code project tree so the existing `VSCodeRow` renderer
 * has the right `meta.kind` ("folder" | "file") to switch on.
 */
interface FakeNode {
  id: NodeId;
  parent: NodeId | null;
  children: NodeId[];
  meta: DemoMeta;
}

const SEED: FakeNode[] = [
  // Root is auto-loaded; everything below it is lazy.
  {
    id: "/",
    parent: null,
    children: ["/src", "/public", "/package.json", "/README.md"],
    meta: { kind: "folder", label: "my-app" },
  },
  {
    id: "/src",
    parent: "/",
    children: ["/src/components", "/src/app", "/src/lib", "/src/index.ts"],
    meta: { kind: "folder", label: "src" },
  },
  {
    id: "/src/components",
    parent: "/src",
    children: ["/src/components/Button.tsx", "/src/components/Card.tsx"],
    meta: { kind: "folder", label: "components" },
  },
  {
    id: "/src/components/Button.tsx",
    parent: "/src/components",
    children: [],
    meta: { kind: "file", label: "Button.tsx", ext: "tsx" },
  },
  {
    id: "/src/components/Card.tsx",
    parent: "/src/components",
    children: [],
    meta: { kind: "file", label: "Card.tsx", ext: "tsx", dirty: true },
  },
  {
    id: "/src/app",
    parent: "/src",
    children: [
      "/src/app/page.tsx",
      "/src/app/layout.tsx",
      "/src/app/globals.css",
    ],
    meta: { kind: "folder", label: "app" },
  },
  {
    id: "/src/app/page.tsx",
    parent: "/src/app",
    children: [],
    meta: { kind: "file", label: "page.tsx", ext: "tsx" },
  },
  {
    id: "/src/app/layout.tsx",
    parent: "/src/app",
    children: [],
    meta: { kind: "file", label: "layout.tsx", ext: "tsx" },
  },
  {
    id: "/src/app/globals.css",
    parent: "/src/app",
    children: [],
    meta: { kind: "file", label: "globals.css", ext: "css" },
  },
  {
    id: "/src/lib",
    parent: "/src",
    children: ["/src/lib/utils.ts", "/src/lib/api.ts"],
    meta: { kind: "folder", label: "lib" },
  },
  {
    id: "/src/lib/utils.ts",
    parent: "/src/lib",
    children: [],
    meta: { kind: "file", label: "utils.ts", ext: "ts" },
  },
  {
    id: "/src/lib/api.ts",
    parent: "/src/lib",
    children: [],
    meta: { kind: "file", label: "api.ts", ext: "ts", dirty: true },
  },
  {
    id: "/src/index.ts",
    parent: "/src",
    children: [],
    meta: { kind: "file", label: "index.ts", ext: "ts" },
  },
  {
    id: "/public",
    parent: "/",
    children: ["/public/favicon.ico", "/public/vercel.svg"],
    meta: { kind: "folder", label: "public" },
  },
  {
    id: "/public/favicon.ico",
    parent: "/public",
    children: [],
    meta: { kind: "file", label: "favicon.ico", ext: "ico" },
  },
  {
    id: "/public/vercel.svg",
    parent: "/public",
    children: [],
    meta: { kind: "file", label: "vercel.svg", ext: "svg" },
  },
  {
    id: "/package.json",
    parent: "/",
    children: [],
    meta: { kind: "file", label: "package.json", ext: "json" },
  },
  {
    id: "/README.md",
    parent: "/",
    children: [],
    meta: { kind: "file", label: "README.md", ext: "md" },
  },
];

/**
 * External controls the demo panel uses to drive the fake FS — change
 * latency on the fly, force the next listing to fail, push a watcher
 * event.
 */
export interface FakeFsControls {
  setLatency(ms: number): void;
  setFailNext(fail: boolean): void;
  emitCreated(parent: NodeId, child: FakeNode): void;
  emitDeleted(parent: NodeId, child: NodeId): void;
  emitInvalidated(id: NodeId): void;
  /** A stable, browser-visible snapshot of the underlying FS state for
   *  the demo's "Create file" button to pick parent ids from. */
  listKnownFolders(): NodeId[];
}

export interface FakeFsProvider {
  provider: AsyncTreeProvider<DemoMeta>;
  controls: FakeFsControls;
}

export function createFakeFsProvider(init?: {
  latencyMs?: number;
}): FakeFsProvider {
  let latencyMs = init?.latencyMs ?? 600;
  let failNext = false;
  const nodes = new Map<NodeId, FakeNode>();
  for (const n of SEED) nodes.set(n.id, { ...n, children: [...n.children] });

  let changeHandler:
    | ((events: ReadonlyArray<AsyncChangeEvent<DemoMeta>>) => void)
    | null = null;

  const provider: AsyncTreeProvider<DemoMeta> = {
    rootId: "/",
    hasChildren(id) {
      return nodes.get(id)?.meta.kind === "folder";
    },
    listChildren(id, signal) {
      return new Promise((resolve, reject) => {
        const fail = failNext;
        if (failNext) failNext = false;
        const t = setTimeout(() => {
          if (signal.aborted) return;
          if (fail) {
            reject(new Error(`EPERM: simulated permission denied for ${id}`));
            return;
          }
          const node = nodes.get(id);
          if (!node) {
            reject(new Error(`ENOENT: ${id}`));
            return;
          }
          const entries: AsyncTreeEntry<DemoMeta>[] = node.children.map(
            (cid) => {
              const c = nodes.get(cid)!;
              return {
                id: cid,
                hasChildren: c.meta.kind === "folder",
                meta: c.meta,
              };
            }
          );
          resolve(entries);
        }, latencyMs);
        signal.addEventListener("abort", () => {
          clearTimeout(t);
          reject(new DOMException("Aborted", "AbortError"));
        });
      });
    },
    subscribeChanges(handler) {
      changeHandler = handler;
      return () => {
        if (changeHandler === handler) changeHandler = null;
      };
    },
    getRootMeta() {
      return nodes.get("/")?.meta;
    },
  };

  const controls: FakeFsControls = {
    setLatency(ms) {
      latencyMs = Math.max(0, ms);
    },
    setFailNext(fail) {
      failNext = fail;
    },
    emitCreated(parent, child) {
      nodes.set(child.id, child);
      const p = nodes.get(parent);
      if (p && !p.children.includes(child.id)) p.children.push(child.id);
      changeHandler?.([
        {
          type: "created",
          parent,
          entry: {
            id: child.id,
            hasChildren: child.meta.kind === "folder",
            meta: child.meta,
          },
        },
      ]);
    },
    emitDeleted(parent, child) {
      const prune = (id: NodeId) => {
        const node = nodes.get(id);
        if (!node) return;
        for (const cid of node.children) prune(cid);
        nodes.delete(id);
      };
      const p = nodes.get(parent);
      if (p) p.children = p.children.filter((c) => c !== child);
      prune(child);
      changeHandler?.([{ type: "deleted", parent, child }]);
    },
    emitInvalidated(id) {
      changeHandler?.([{ type: "invalidated", id }]);
    },
    listKnownFolders() {
      const out: NodeId[] = [];
      for (const [id, n] of nodes) {
        if (n.meta.kind === "folder") out.push(id);
      }
      return out;
    },
  };

  return { provider, controls };
}
