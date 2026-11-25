"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import type { StreamdownProps } from "streamdown";
import { FullscreenImagePreview } from "@/kits/image-preview";
import {
  BrowserOpen,
  handleBrowserLinkClick,
} from "@/lib/desktop/browser-open-context";
import { DesktopImagePolicy } from "@/lib/desktop/image-policy";
import { WorkspaceArtifact } from "@/lib/desktop/workspace-artifact";
import { workspace_links } from "./workspace-links";

type Node = {
  type: string;
  tagName?: string;
  properties?: Record<string, unknown>;
  children?: Node[];
};

/** Desktop assistant Markdown images and their loading fallbacks. */
export namespace reply_images {
  type Resolve = (reference: string) => string | undefined;
  const MEDIA_MARKER = "https://reply-image.invalid/";
  const RASTER = /\.(?:png|jpe?g|gif|webp|avif|bmp|ico)$/i;
  const FILE_URL = /^file:\/\/(?:localhost)?(\/[^/].*)$/i;
  const WINDOWS_DRIVE = /^[a-z]:\//i;
  const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

  export const Workspace = createContext<Resolve | undefined>(undefined);
  export const WebSources = createContext<readonly string[] | undefined>(
    undefined
  );

  function isWorkspaceReference(src: string) {
    return (
      /^file:/i.test(src) ||
      WINDOWS_DRIVE.test(src) ||
      (!SCHEME.test(src) && !src.startsWith("//"))
    );
  }

  /** The host still checks canonical containment before reading the file. */
  export function workspaceResolver(root: string, mediaUrl: Resolve): Resolve {
    const directory = root.replaceAll("\\", "/").replace(/\/+$/, "");
    const prefix = `${directory}/`;
    return (reference) => {
      if (!isWorkspaceReference(reference) || /[?#]/.test(reference)) return;
      const file = FILE_URL.exec(reference);
      if (!file && /^file:/i.test(reference)) return;

      let path: string;
      try {
        // Decode once, before checking dot segments. URL parsing would hide
        // traversal by normalizing those segments before we can reject them.
        path = decodeURIComponent(file?.[1] ?? reference);
      } catch {
        return;
      }
      if (WINDOWS_DRIVE.test(directory) && /^\/[a-z]:\//i.test(path)) {
        path = path.slice(1);
      }
      if (file || path.startsWith("/") || WINDOWS_DRIVE.test(path)) {
        if (!root || !path.startsWith(prefix)) return;
        path = path.slice(prefix.length);
      } else {
        path = path.replace(/^(?:\.\/)+/, "");
      }

      const relative = WorkspaceArtifact.normalizeRelativePath(path);
      if (relative && RASTER.test(relative)) return mediaUrl(relative);
    };
  }

  function visitImages(
    node: Node,
    visit: (image: Node, src: string, linked: boolean) => void,
    linked = false
  ) {
    if (node.type === "element" && node.tagName === "img") {
      const src = node.properties?.src;
      if (typeof src === "string") visit(node, src, linked);
    }
    node.children?.forEach((child) =>
      visitImages(child, visit, linked || node.tagName === "a")
    );
  }

  function markReplyImages() {
    return (tree: Node) =>
      visitImages(tree, (node, src) => {
        if (isWorkspaceReference(src) || /^(?:https?:|\/\/)/i.test(src)) {
          node.properties = {
            src:
              MEDIA_MARKER +
              (src.isWellFormed() ? encodeURIComponent(src) : ""),
            alt: node.properties?.alt,
          };
        }
      });
  }

  function renderReplyImages() {
    return (tree: Node) =>
      visitImages(tree, (node, src, linked) => {
        if (!src.startsWith(MEDIA_MARKER)) return;
        let reference = "";
        try {
          reference = decodeURIComponent(src.slice(MEDIA_MARKER.length));
        } catch {
          // Keep an unavailable label for a malformed marker.
        }
        // The reserved URL passes hardening, then disappears before rendering.
        // The renderer resolves local paths or admits the actual web URL.
        node.tagName = "grida-reply-image";
        node.properties = { reference, alt: node.properties?.alt, linked };
      });
  }

  function Unavailable({
    alt,
    web,
    blocked = false,
    linked = false,
  }: {
    alt: string;
    web?: URL;
    blocked?: boolean;
    linked?: boolean;
  }) {
    const open = useContext(BrowserOpen);
    const status = blocked ? "External image" : "Image unavailable";
    const label = alt || web?.hostname;
    return (
      <span className="text-muted-foreground">
        {label ? `${status}: ${label}` : status}
        {web && !linked && (
          <>
            {" · "}
            <a
              href={web.href}
              target="_blank"
              rel="noreferrer"
              className="text-primary underline underline-offset-2"
              onClick={(event) => handleBrowserLinkClick(event, open)}
            >
              Open image
            </a>
          </>
        )}
      </span>
    );
  }

  function Preview({
    src,
    alt,
    linked,
    web,
  }: {
    src: string;
    alt: string;
    linked: boolean;
    web?: URL;
  }) {
    const [failed, setFailed] = useState(false);
    if (failed) return <Unavailable alt={alt} web={web} linked={linked} />;
    const image = (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={src}
        alt={alt}
        loading="lazy"
        decoding="async"
        referrerPolicy="no-referrer"
        className="max-h-[28rem] max-w-full rounded-md object-contain"
        onError={() => setFailed(true)}
      />
    );
    return linked ? (
      image
    ) : (
      <FullscreenImagePreview
        src={src}
        alt={alt}
        title={alt || "Open image preview"}
        allowTransfer={false}
        referrerPolicy="no-referrer"
      >
        {image}
      </FullscreenImagePreview>
    );
  }

  function Image({ reference, alt, linked }: Record<string, unknown>) {
    const resolve = useContext(Workspace);
    const sources = useContext(WebSources);
    const label = typeof alt === "string" ? alt : "";
    const inLink = linked === true;
    if (typeof reference !== "string") return <Unavailable alt={label} />;
    const web = DesktopImagePolicy.webUrl(reference);
    if (
      web &&
      (!sources ||
        !DesktopImagePolicy.allows(web, sources, globalThis.location?.origin))
    ) {
      return <Unavailable alt={label} web={web} blocked linked={inLink} />;
    }
    const src = web?.href ?? resolve?.(reference);
    return src ? (
      <Preview key={src} src={src} alt={label} linked={inLink} web={web} />
    ) : (
      <Unavailable alt={label} />
    );
  }

  /** Assistant-only opt-in, with Streamdown handling other image schemes. */
  export const markdown = {
    rehypePlugins: [
      // Insert after raw HTML expansion, before link marking and sanitizing.
      ...workspace_links.rehypePlugins.slice(0, 1),
      markReplyImages,
      ...workspace_links.rehypePlugins.slice(1),
      renderReplyImages,
    ],
    components: {
      ...workspace_links.components,
      "grida-reply-image": Image,
    },
  } satisfies Pick<StreamdownProps, "rehypePlugins" | "components">;
}

/** Desktop routes pass the exact server-side sources used to build their CSP. */
export function ReplyImageSourceProvider({
  sources,
  children,
}: {
  sources: readonly string[];
  children: ReactNode;
}) {
  return (
    <reply_images.WebSources value={sources}>
      {children}
    </reply_images.WebSources>
  );
}
