"use client";

import {
  createContext,
  useContext,
  useMemo,
  useSyncExternalStore,
  type MouseEvent,
} from "react";
import type { Browser } from "./browser";
import { PagePreviews } from "./page-previews";

/** The browser destination policy supplied by the Desktop surface. */
export const BrowserOpen = createContext<Browser.OpenHandler | null>(null);

/** Use Desktop routing for ordinary clicks and preserve native anchor gestures. */
export function handleBrowserLinkClick(
  event: MouseEvent<HTMLAnchorElement>,
  open: Browser.OpenHandler | null
): boolean {
  if (
    !open ||
    event.defaultPrevented ||
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey ||
    event.currentTarget.hasAttribute("download")
  ) {
    return false;
  }
  const href = event.currentTarget.getAttribute("href");
  if (!href || !open(href)) return false;
  event.preventDefault();
  return true;
}

/** Optional page metadata lookup for all link previews in this surface. */
export const BrowserPreview = createContext<PagePreviews.Controller | null>(
  null
);

const noSubscription = () => () => {};
const emptyPreview = () => PagePreviews.empty;

export function usePagePreview(
  url: string | undefined
): PagePreviews.Source | null {
  const previews = useContext(BrowserPreview);
  return useMemo(
    () => (url ? (previews?.forUrl(url) ?? null) : null),
    [previews, url]
  );
}

export function usePagePreviewSnapshot(preview: PagePreviews.Source | null) {
  return useSyncExternalStore(
    preview?.subscribe ?? noSubscription,
    preview?.getSnapshot ?? emptyPreview,
    emptyPreview
  );
}
