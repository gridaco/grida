"use client";

import { useMemo } from "react";
import useSWR from "swr";

export interface FontAxis {
  tag: string;
  start: number;
  end: number;
}

export interface FontFile {
  [variant: string]: string;
}

export interface GridaFont {
  family: string;
  variants: string[];
  subsets: string[];
  version: string;
  lastModified: string;
  files: FontFile;
  category: "sans-serif" | "serif" | "display" | "monospace" | "handwriting";
  kind: string;
  axes?: FontAxis[];
}

export interface GridaFontsSearchFilters {
  category?: "sans-serif" | "serif" | "display" | "monospace";
  property?: "variable" | "static";
}

export interface GridaFontsSearchResponse {
  fonts: GridaFont[];
  total: number;
  fontlist_count: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  query?: string;
  sort: "popular" | "alphabetical";
  filters: GridaFontsSearchFilters;
}

export interface UseGridaFontsSearchOptions {
  q?: string;
  category?: "sans-serif" | "serif" | "display" | "monospace";
  property?: "variable" | "static";
  sort?: "popular" | "alphabetical";
  page?: number;
  limit?: number;
}

export interface UseGridaFontsSearchResult {
  fonts: GridaFont[];
  total: number;
  fontlist_count: number;
  page: number;
  limit: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
  query?: string;
  sort: "popular" | "alphabetical";
  filters: GridaFontsSearchFilters;
  isLoading: boolean;
  error: Error | null;
}

/**
 * Core function to search and filter Google Fonts using the Grida Fonts Search API.
 * This is a pure async function that can be used outside of React components.
 *
 * API Documentation:
 * https://github.com/gridaco/fonts/blob/005ef0ee21c304e135189a5b7f51f9952a041f43/www/app/api/search/README.md
 *
 * @param options - Search options matching the API spec
 * @returns Promise resolving to the search results
 */
export async function searchGridaFonts(
  options: UseGridaFontsSearchOptions = {}
): Promise<GridaFontsSearchResponse> {
  const {
    q,
    category,
    property,
    sort = "popular",
    page = 1,
    limit = 100,
  } = options;

  // Build query parameters
  const params = new URLSearchParams();
  if (q) params.append("q", q);
  if (category) params.append("category", category);
  if (property) params.append("property", property);
  if (sort) params.append("sort", sort);
  if (page) params.append("page", page.toString());
  if (limit) params.append("limit", limit.toString());

  const response = await fetch(
    `https://fonts.grida.co/api/search?${params.toString()}`
  );

  if (!response.ok) {
    throw new Error(`Failed to fetch fonts: ${response.statusText}`);
  }

  const data: GridaFontsSearchResponse = await response.json();
  return data;
}

/**
 * Hook to search and filter Google Fonts using the Grida Fonts Search API.
 * Supports searching, filtering by category/property, sorting, and pagination.
 *
 * API Documentation:
 * https://github.com/gridaco/fonts/blob/005ef0ee21c304e135189a5b7f51f9952a041f43/www/app/api/search/README.md
 *
 * @param options - Search options matching the API spec
 * @returns Object containing the search results, pagination info, loading state, and error state
 */
export function useGridaFontsSearch(
  options: UseGridaFontsSearchOptions = {}
): UseGridaFontsSearchResult {
  // Create a stable key for SWR caching
  const key = useMemo(
    () => ["grida-fonts-search", options],
    [
      options.q,
      options.category,
      options.property,
      options.sort,
      options.page,
      options.limit,
    ]
  );

  const { data, error, isLoading } = useSWR<GridaFontsSearchResponse>(
    key,
    async ([, opts]: [string, UseGridaFontsSearchOptions]) =>
      searchGridaFonts(opts)
  );

  // Transform SWR result to match the expected interface
  return useMemo(() => {
    if (data) {
      return {
        fonts: data.fonts,
        total: data.total,
        fontlist_count: data.fontlist_count,
        page: data.page,
        limit: data.limit,
        totalPages: data.totalPages,
        hasNextPage: data.hasNextPage,
        hasPreviousPage: data.hasPreviousPage,
        query: data.query,
        sort: data.sort,
        filters: data.filters,
        isLoading,
        error: error
          ? error instanceof Error
            ? error
            : new Error("Unknown error")
          : null,
      };
    }

    // Return default values when loading or no data
    return {
      fonts: [],
      total: 0,
      fontlist_count: 0,
      page: 1,
      limit: 100,
      totalPages: 0,
      hasNextPage: false,
      hasPreviousPage: false,
      sort: "popular",
      filters: {},
      isLoading,
      error: error
        ? error instanceof Error
          ? error
          : new Error("Unknown error")
        : null,
    };
  }, [data, error, isLoading]);
}
