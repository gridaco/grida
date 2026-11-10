import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const database = vi.hoisted(() => ({
  client: vi.fn<() => Promise<unknown>>(),
}));
vi.mock("@/lib/supabase/server", () => ({
  createLibraryClient: database.client,
}));
vi.mock("@/lib/library/embedding", () => ({
  embedLibraryQuery: vi.fn<(query: string) => Promise<number[]>>(async () => [
    0,
  ]),
}));

import { _getObject, _similar, browse, random, search } from "./actions";

const object = {
  id: "97eaa44d-848b-4101-9cf8-88325f1c2bf0",
  path: "legacy/example.png",
  sha256: "a".repeat(64),
  mimetype: "image/png",
  title: "Existing title",
  license: "CC0-1.0",
  author: null,
};

class CatalogQuery {
  readonly select = vi.fn<(columns: string, options?: unknown) => CatalogQuery>(
    () => this
  );
  readonly eq = vi.fn<() => CatalogQuery>(() => this);
  readonly not = vi.fn<() => CatalogQuery>(() => this);
  readonly order = vi.fn<() => CatalogQuery>(() => this);
  readonly range = vi.fn<() => CatalogQuery>(() => this);
  readonly single = vi.fn<() => Promise<{ data: typeof object; error: null }>>(
    async () => ({ data: object, error: null })
  );

  // oxlint-disable-next-line unicorn/no-thenable -- Supabase builders are awaitable.
  then(
    resolve: (value: {
      data: (typeof object)[];
      error: null;
      count: number;
    }) => unknown
  ) {
    return Promise.resolve({ data: [object], error: null, count: 1 }).then(
      resolve
    );
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_GRIDA_LIBRARY_ASSET_ORIGIN", undefined);
  vi.stubEnv("UPSTASH_REDIS_REST_URL", "");
  vi.stubEnv("UPSTASH_REDIS_REST_TOKEN", "");
});

afterEach(() => vi.unstubAllEnvs());

describe("Library read URL projections", () => {
  it.each(["supabase", "tigris"])(
    "preserves metadata and projects every result through %s storage",
    async (provider) => {
      vi.stubEnv("NEXT_PUBLIC_GRIDA_LIBRARY_STORAGE_PROVIDER", provider);
      const query = new CatalogQuery();
      // No Storage client: reads only need catalog data and the URL projection.
      database.client.mockResolvedValue({
        from: () => query,
        rpc: () => query,
      });

      const detail = await _getObject(object.id);
      const listing = await browse();
      const related = await _similar(object.id);
      const picked = await random({});
      const results = await search({ text: "example" });
      const url =
        provider === "tigris"
          ? `https://library.grida.co/${object.sha256}.png`
          : `https://project.supabase.co/storage/v1/object/public/library/${object.path}`;
      const download = provider === "tigris" ? url : `${url}?download=`;
      const expected = { ...object, url, download };

      expect(detail).toEqual(expected);
      expect(listing).toEqual({ data: [expected], count: 1 });
      expect(related).toEqual({ data: [expected], error: null });
      expect(picked).toEqual(expected);
      expect(results).toEqual({ data: [expected], count: 1 });
      const objectSelections = query.select.mock.calls
        .map(([columns]) => columns)
        .filter((columns) => columns.includes("author(*)"));
      expect(objectSelections).toHaveLength(4);
      for (const columns of objectSelections) {
        expect(columns).toMatch(/\bsha256\b/);
      }
    }
  );
});
