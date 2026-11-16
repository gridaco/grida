"use client";

import { createContext, useContext, type ComponentProps } from "react";
import { defaultRehypePlugins, type StreamdownProps } from "streamdown";

/**
 * Links in agent replies that point at files in the person's workspace: a
 * relative path such as `poster.svg` or `kit/index.html`, or a `file:` URL.
 *
 * The markdown renderer's link hardening blocks those (it cannot resolve a
 * relative path, and refuses `file:`), showing "[blocked]". This marks them
 * before hardening as links on a reserved, non-routable origin carrying the
 * original path, and renders them as links that open the file in the
 * workspace. The opener validates the path against the workspace; with no
 * opener, the link text is shown without a link. Web links are unchanged.
 */
export namespace workspace_links {
  /** A reserved origin (`.invalid` never resolves) for marked links. */
  const ORIGIN = "https://workspace.invalid/";
  const SCHEME = /^[a-z][a-z0-9+.-]*:/i;

  /** The workspace path a reply's link names, or null for other links. */
  export function path(href: string): string | null {
    const value = href.trim();
    if (!value || value.startsWith("#") || value.startsWith("//")) return null;
    if (/^file:/i.test(value)) {
      try {
        return decodeURIComponent(new URL(value).pathname) || null;
      } catch {
        return null;
      }
    }
    return SCHEME.test(value) ? null : value;
  }

  /**
   * A link path in the agent's workspace form, where `/` is the workspace
   * root: `kit/a.svg` and `./kit/a.svg` become `/kit/a.svg`. A path that
   * climbs out with `..` has none.
   */
  export function workspacePath(path: string): string | null {
    const relative = path.startsWith("/") ? path.slice(1) : path;
    const parts = relative.split("/").filter((part) => part && part !== ".");
    if (parts.length === 0 || parts.includes("..")) return null;
    return "/" + parts.join("/");
  }

  /** The path a marked link carries, after rendering. */
  export function marked(href: string | undefined): string | null {
    if (!href?.startsWith(ORIGIN)) return null;
    try {
      return decodeURIComponent(href.slice(ORIGIN.length));
    } catch {
      return null;
    }
  }

  type Element = {
    type: string;
    tagName?: string;
    properties?: Record<string, unknown>;
    children?: Element[];
  };

  function mark(node: Element) {
    if (node.type === "element" && node.tagName === "a") {
      const href = node.properties?.href;
      const target = typeof href === "string" ? path(href) : null;
      if (target !== null)
        node.properties = {
          ...node.properties,
          href: ORIGIN + encodeURIComponent(target),
        };
    }
    node.children?.forEach(mark);
  }

  /** Marks workspace links; runs before sanitizing and hardening. */
  function markWorkspaceLinks() {
    return (tree: Element) => mark(tree);
  }

  /** The renderer's own plugins, with workspace links marked first. */
  export const rehypePlugins: NonNullable<StreamdownProps["rehypePlugins"]> = [
    defaultRehypePlugins.raw,
    markWorkspaceLinks,
    defaultRehypePlugins.sanitize,
    defaultRehypePlugins.harden,
  ];

  /** Opens a workspace path, when the host has a workspace. */
  export const Opener = createContext<((path: string) => void) | null>(null);

  /** The link renderer for agent replies. */
  export function Link({
    href,
    children,
    className,
    node: _node,
    ...props
  }: ComponentProps<"a"> & { node?: unknown }) {
    const open = useContext(Opener);
    const target = marked(href);
    const style = "wrap-anywhere font-medium text-primary underline";
    if (target === null)
      return (
        <a
          {...props}
          href={href}
          className={className ?? style}
          rel="noreferrer"
          target="_blank"
        >
          {children}
        </a>
      );
    if (!open) return <span>{children}</span>;
    return (
      <a
        {...props}
        href={href}
        title={target}
        className={className ?? style}
        onClick={(event) => {
          event.preventDefault();
          open(target);
        }}
      >
        {children}
      </a>
    );
  }

  export const components = { a: Link };
}
