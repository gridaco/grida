"use client";

import { createContext } from "react";
import type { Browser } from "./browser";

/** The browser destination policy supplied by the Desktop surface. */
export const BrowserOpen = createContext<Browser.OpenHandler | null>(null);

/** Optional metadata lookup for preview cards in this Desktop surface. */
export const BrowserPreview = createContext<Browser.PreviewLoader | null>(null);
