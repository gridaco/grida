"use client";

import { workspaces as workspacesNs } from "@/lib/desktop/bridge";

type ReadFileBytes = (
  workspaceId: string,
  relPath: string
) => Promise<{ base64: string }>;

type SvgResourceAttribute = {
  value: string;
  set(value: string): void;
};

type SvgResourceDocument = {
  attributes(): SvgResourceAttribute[];
  serialize(): string;
};
type PendingSvgResource = {
  attr: SvgResourceAttribute;
  href: string;
  relPath: string;
  sequence: number;
};
type SvgHrefAttributeSpec = {
  name: string;
  namespace?: string;
  localName?: string;
};

export type MaterializedSlideSvg = {
  svg: string;
  restore(serialized: string): string;
};

export type MaterializeSlideSvgResourcesOptions = {
  workspaceId: string;
  /** Workspace-relative directory of the `.canvas` bundle. */
  bundleBasePath: string;
  /** Workspace-relative path of the slide SVG being materialized. */
  slideRelPath: string;
  /**
   * Optional work budget for read-only projections such as small thumbnails.
   * The live editor intentionally leaves this unlimited.
   */
  maxResourceAttributes?: number;
  readFileBytes?: ReadFileBytes;
  xml?: {
    parse(svg: string): SvgResourceDocument | null;
  };
};

const IMAGE_MIME: Record<string, string> = {
  svg: "image/svg+xml",
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  avif: "image/avif",
  bmp: "image/bmp",
  ico: "image/x-icon",
  tiff: "image/tiff",
  tif: "image/tiff",
};
const SVG_XLINK_NS = "http://www.w3.org/1999/xlink";

/**
 * Desktop slides workaround for gridaco/grida#960.
 *
 * `@grida/svg-editor` currently receives SVG text, not a document URL, so a
 * bundle-relative image href has no natural browser base. This host projection
 * makes the live editor/thumbnail SVG renderable while keeping saves portable.
 */
export async function materializeSlideSvgResources(
  svg: string,
  options: MaterializeSlideSvgResourcesOptions
): Promise<MaterializedSlideSvg> {
  const xml = options.xml ?? DOM_XML;
  const doc = xml.parse(svg);
  if (!doc) return identity(svg);

  const readFileBytes = options.readFileBytes ?? workspacesNs.readFileBytes;
  const restores = new Map<string, string>();
  const projectionId = createProjectionId();

  const resources: PendingSvgResource[] = [];
  doc.attributes().forEach((attr, sequence) => {
    const href = attr.value;
    const relPath = resolveResourceRelPath({
      href,
      bundleBasePath: options.bundleBasePath,
      slideRelPath: options.slideRelPath,
    });
    if (relPath) resources.push({ attr, href, relPath, sequence });
  });

  const resourceLimit =
    options.maxResourceAttributes === undefined
      ? resources.length
      : Math.max(0, Math.floor(options.maxResourceAttributes));

  await Promise.all(
    resources
      .slice(0, resourceLimit)
      .map(async ({ attr, href, relPath, sequence }) => {
        try {
          const { base64 } = await readFileBytes(options.workspaceId, relPath);
          const materialized = toDataUrl(
            relPath,
            base64,
            projectionId,
            sequence
          );
          restores.set(materialized, escapeXmlAttribute(href));
          attr.set(materialized);
        } catch {
          // Per #960 this is a render projection, not document validation. A
          // missing/oversized/binary asset should leave only that image broken.
        }
      })
  );

  const materialized = doc.serialize();
  return {
    svg: materialized,
    restore(serialized) {
      let restored = serialized;
      for (const [materializedHref, originalHref] of restores) {
        restored = restored.split(materializedHref).join(originalHref);
      }
      return restored;
    },
  };
}

function identity(svg: string): MaterializedSlideSvg {
  return { svg, restore: (serialized) => serialized };
}

const DOM_XML = {
  parse(svg: string): SvgResourceDocument | null {
    if (
      typeof DOMParser === "undefined" ||
      typeof XMLSerializer === "undefined"
    ) {
      return null;
    }

    const document = new DOMParser().parseFromString(svg, "image/svg+xml");
    if (document.getElementsByTagName("parsererror").length > 0) return null;

    return {
      attributes() {
        const out: SvgResourceAttribute[] = [];
        const elements = document.getElementsByTagName("*");
        for (const el of Array.from(elements)) {
          const name = el.localName.toLowerCase();
          if (name !== "image" && name !== "feimage") continue;
          for (const attr of HREF_ATTRIBUTES) {
            const value = attr.namespace
              ? (el.getAttributeNS(
                  attr.namespace,
                  attr.localName ?? attr.name
                ) ?? el.getAttribute(attr.name))
              : el.getAttribute(attr.name);
            if (value === null) continue;
            out.push({
              value,
              set(next) {
                if (attr.namespace) {
                  el.setAttributeNS(attr.namespace, attr.name, next);
                } else {
                  el.setAttribute(attr.name, next);
                }
              },
            });
          }
        }
        return out;
      },
      serialize() {
        return new XMLSerializer().serializeToString(document);
      },
    };
  },
};

const HREF_ATTRIBUTES: readonly SvgHrefAttributeSpec[] = [
  { name: "href" },
  { name: "xlink:href", namespace: SVG_XLINK_NS, localName: "href" },
];

function resolveResourceRelPath({
  href,
  bundleBasePath,
  slideRelPath,
}: {
  href: string;
  bundleBasePath: string;
  slideRelPath: string;
}): string | null {
  if (!isBundleRelativeHref(href)) return null;

  const hrefPath = href.split(/[?#]/, 1)[0];
  if (!hrefPath) return null;

  const slideDir = dirname(slideRelPath);
  const resolved = normalizeRelativePath(joinPath(slideDir, hrefPath));
  if (!resolved) return null;

  const bundleRoot = normalizeRelativePath(bundleBasePath) ?? "";
  if (bundleRoot && resolved !== bundleRoot) {
    if (!resolved.startsWith(`${bundleRoot}/`)) return null;
  }
  return resolved;
}

function isBundleRelativeHref(href: string): boolean {
  const value = href.trim();
  if (!value || value.startsWith("#") || value.startsWith("//")) return false;
  if (value.startsWith("/") || /^[a-zA-Z]:/.test(value)) return false;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(value)) return false;
  return true;
}

function normalizeRelativePath(path: string): string | null {
  const normalized = path.replaceAll("\\", "/");
  if (normalized.startsWith("/") || /^[a-zA-Z]:/.test(normalized)) return null;

  const out: string[] = [];
  for (const segment of normalized.split("/")) {
    if (!segment || segment === ".") continue;
    if (segment === "..") {
      if (out.length === 0) return null;
      out.pop();
    } else {
      out.push(segment);
    }
  }
  return out.join("/");
}

function dirname(path: string): string {
  const normalized = path.replaceAll("\\", "/");
  const slash = normalized.lastIndexOf("/");
  return slash < 0 ? "" : normalized.slice(0, slash);
}

function joinPath(a: string, b: string): string {
  if (!a) return b;
  if (!b) return a;
  return `${a.replace(/\/+$/, "")}/${b.replace(/^\/+/, "")}`;
}

function toDataUrl(
  relPath: string,
  base64: string,
  projectionId: string,
  sequence: number
): string {
  return `data:${inferMime(relPath)};grida-svg-resource=${projectionId}-${sequence};base64,${base64}`;
}

function inferMime(relPath: string): string {
  const name = relPath.split("/").pop() ?? relPath;
  const dot = name.lastIndexOf(".");
  if (dot < 0) return "application/octet-stream";
  const ext = name.slice(dot + 1).toLowerCase();
  return IMAGE_MIME[ext] ?? "application/octet-stream";
}

function escapeXmlAttribute(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

function createProjectionId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ??
    `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
  );
}
