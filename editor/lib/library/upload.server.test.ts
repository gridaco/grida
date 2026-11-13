import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { S3Client } from "@aws-sdk/client-s3";
import { LibraryUpload } from "./upload.server";
import { LibraryTigris } from "./tigris.server";

const bytes = new TextEncoder().encode("abc");
const sha256 =
  "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad";
const path = `${sha256}.png`;
const storageId = "10000000-0000-4000-8000-000000000001";
const file = { mediaType: "image/png", uint8Array: bytes };
const request = {
  model: "test/image-model",
  prompt: "New generation prompt",
  width: 512,
  height: 384,
};

type Row = {
  id: string;
  path: string;
  sha256: string;
  created_at: string;
  [field: string]: unknown;
};
type Insert = Omit<Row, "created_at"> & {
  id: string;
  path: string;
  sha256: string;
};
type Failure = { code?: string; message: string };
type Result = { data: Row | null; error: Failure | null };
type StorageUpload = (
  path: string,
  data: Uint8Array,
  options: { contentType: string }
) => Promise<{ data: { id: string } | null; error: Failure | null }>;
type StorageInfo = (
  path: string
) => Promise<{ data: { id: string } | null; error: Failure | null }>;

/** Only the catalog's fixed SHA lookup and ID/path uniqueness are modeled. */
class Catalog {
  readonly rows: Row[] = [];
  readonly insertAttempts: Insert[] = [];
  readonly events: string[] = [];
  failure: Failure | null = null;
  beforeInsert: (() => void) | undefined;
  readonly upload = vi.fn<StorageUpload>();
  readonly info = vi.fn<StorageInfo>();
  readonly storage = {
    from: vi.fn<
      (bucket: string) => { upload: StorageUpload; info: StorageInfo }
    >(() => ({ upload: this.upload, info: this.info })),
  };

  constructor() {
    this.upload.mockImplementation(async () => {
      this.events.push("upload");
      return { data: { id: storageId }, error: null };
    });
    this.info.mockResolvedValue({ data: { id: storageId }, error: null });
  }

  from(table: string) {
    if (table !== "object") throw new Error("Unexpected test table");
    return new CatalogQuery(this);
  }

  async insert(value: Insert): Promise<Result> {
    this.events.push("insert");
    this.insertAttempts.push(value);
    const concurrentCommit = this.beforeInsert;
    this.beforeInsert = undefined;
    concurrentCommit?.();
    if (this.failure) {
      const error = this.failure;
      this.failure = null;
      return { data: null, error };
    }
    if (
      this.rows.some((row) => row.id === value.id || row.path === value.path)
    ) {
      return { data: null, error: { code: "23505", message: "path conflict" } };
    }
    const row: Row = {
      license: "CC0-1.0",
      public_domain: false,
      ...value,
      created_at: "2026-11-10T00:00:00Z",
    };
    this.rows.push(row);
    return { data: row, error: null };
  }

  client(): Parameters<typeof LibraryUpload.generated>[0] {
    return this as unknown as Parameters<typeof LibraryUpload.generated>[0];
  }
}

class CatalogQuery {
  private readonly filters: [string, unknown][] = [];
  private readonly ordering: string[] = [];
  private limitCount = Number.POSITIVE_INFINITY;
  private insertion: Insert | undefined;

  constructor(private readonly catalog: Catalog) {}

  select() {
    return this;
  }
  eq(column: string, value: unknown) {
    this.filters.push([column, value]);
    return this;
  }
  order(column: string) {
    this.ordering.push(column);
    return this;
  }
  limit(count: number) {
    this.limitCount = count;
    return this;
  }
  insert(value: Insert) {
    this.insertion = value;
    return this;
  }
  async maybeSingle(): Promise<Result> {
    const rows = this.catalog.rows.filter((row) =>
      this.filters.every(([column, value]) => row[column] === value)
    );
    rows.sort((left, right) => {
      for (const column of this.ordering) {
        const a = String(left[column]);
        const b = String(right[column]);
        if (a !== b) return a < b ? -1 : 1;
      }
      return 0;
    });
    return { data: rows.slice(0, this.limitCount)[0] ?? null, error: null };
  }
  async single(): Promise<Result> {
    if (!this.insertion) throw new Error("Expected a test insertion");
    return this.catalog.insert(this.insertion);
  }
}

function objectStore(catalog: Catalog) {
  const transport = {
    send: vi.fn<() => Promise<never>>(async () => {
      throw new Error("Unexpected network operation in upload test");
    }),
  };
  const store = new LibraryTigris(
    transport as unknown as S3Client,
    "test-library"
  );
  const upload = vi.spyOn(store, "upload").mockImplementation(async () => {
    catalog.events.push("upload");
    return { path, sha256 };
  });
  return { store, upload };
}

beforeEach(() => {
  vi.stubEnv("NEXT_PUBLIC_GRIDA_LIBRARY_STORAGE_PROVIDER", undefined);
  vi.stubEnv("NEXT_PUBLIC_GRIDA_LIBRARY_ASSET_ORIGIN", undefined);
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://project.supabase.co");
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
});

describe("LibraryUpload.generated", () => {
  it("keeps Supabase uploads, Storage IDs, metadata and public URLs by default", async () => {
    const catalog = new Catalog();
    const tigris = objectStore(catalog);
    const result = await LibraryUpload.generated(
      catalog.client(),
      file,
      request,
      tigris.store
    );
    expect(catalog.upload).toHaveBeenCalledWith(path, bytes, {
      contentType: "image/png",
    });
    expect(tigris.upload).not.toHaveBeenCalled();
    expect(result.object).toMatchObject({
      id: storageId,
      path,
      sha256,
      bytes: 3,
      mimetype: "image/png",
      category: "generated",
      generator: request.model,
      prompt: request.prompt,
      width: 512,
      height: 384,
    });
    expect(result.publicUrl).toBe(
      `https://project.supabase.co/storage/v1/object/public/library/${path}`
    );
    expect(catalog.events).toEqual(["upload", "insert"]);
  });

  it("recovers a duplicate Supabase blob's Storage ID before registration", async () => {
    const catalog = new Catalog();
    catalog.upload.mockResolvedValue({
      data: null,
      error: { code: "409", message: "already exists" },
    });
    const result = await LibraryUpload.generated(
      catalog.client(),
      file,
      request
    );
    expect(catalog.info).toHaveBeenCalledWith(path);
    expect(result.object.id).toBe(storageId);
    expect(catalog.rows).toHaveLength(1);
  });

  it("assigns an independent catalog UUID after confirmed Tigris storage", async () => {
    vi.stubEnv("NEXT_PUBLIC_GRIDA_LIBRARY_STORAGE_PROVIDER", "tigris");
    const catalog = new Catalog();
    const tigris = objectStore(catalog);
    const result = await LibraryUpload.generated(
      catalog.client(),
      file,
      request,
      tigris.store
    );
    expect(tigris.upload).toHaveBeenCalledWith(bytes, "image/png");
    expect(catalog.storage.from).not.toHaveBeenCalled();
    expect(result.object.id).toMatch(
      /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/
    );
    expect(result.object.id).not.toBe(storageId);
    expect(result.object).toMatchObject({
      path,
      sha256,
      prompt: request.prompt,
    });
    expect(result.publicUrl).toBe(`https://library.grida.co/${path}`);
    expect(catalog.events).toEqual(["upload", "insert"]);
  });

  it("adopts the earliest historical UUID without changing either duplicate's metadata", async () => {
    vi.stubEnv("NEXT_PUBLIC_GRIDA_LIBRARY_STORAGE_PROVIDER", "tigris");
    const catalog = new Catalog();
    const winner: Row = {
      id: "20000000-0000-4000-8000-000000000001",
      sha256,
      path: "legacy/original.jpg",
      created_at: "2025-01-01T00:00:00Z",
      mimetype: "image/png",
      title: "Original title",
      license: "CC0",
      prompt: "Original prompt",
      generator: "original-model",
    };
    catalog.rows.push(
      {
        ...winner,
        id: "10000000-0000-4000-8000-000000000001",
        path: "legacy/newer.png",
        created_at: "2026-01-01T00:00:00Z",
        title: "Newer title",
      },
      {
        ...winner,
        id: "20000000-0000-4000-8000-000000000002",
        path: "legacy/sibling.png",
        license: "CC0-1.0",
      },
      winner
    );
    const before = structuredClone(catalog.rows);
    const tigris = objectStore(catalog);
    const result = await LibraryUpload.generated(
      catalog.client(),
      file,
      request,
      tigris.store
    );
    expect(result.object).toEqual(winner);
    expect(result.publicUrl).toBe(`https://library.grida.co/${path}`);
    expect(catalog.rows).toEqual(before);
    expect(catalog.insertAttempts).toEqual([]);
  });

  it("adopts the concurrent path winner instead of overwriting its metadata", async () => {
    vi.stubEnv("NEXT_PUBLIC_GRIDA_LIBRARY_STORAGE_PROVIDER", "tigris");
    const catalog = new Catalog();
    const winner: Row = {
      id: "20000000-0000-4000-8000-000000000001",
      path,
      sha256,
      created_at: "2026-11-09T00:00:00Z",
      mimetype: "image/png",
      prompt: "Another producer's prompt",
      license: "CC0",
    };
    catalog.beforeInsert = () => catalog.rows.push(winner);
    const tigris = objectStore(catalog);
    const result = await LibraryUpload.generated(
      catalog.client(),
      file,
      request,
      tigris.store
    );
    expect(result.object).toEqual(winner);
    expect(catalog.rows).toEqual([winner]);
    expect(catalog.insertAttempts).toHaveLength(1);
  });

  it("recovers registration failure by reusing the same bytes and content address", async () => {
    vi.stubEnv("NEXT_PUBLIC_GRIDA_LIBRARY_STORAGE_PROVIDER", "tigris");
    const catalog = new Catalog();
    catalog.failure = { code: "08006", message: "catalog unavailable" };
    const tigris = objectStore(catalog);
    await expect(
      LibraryUpload.generated(catalog.client(), file, request, tigris.store)
    ).rejects.toThrow("catalog unavailable");
    expect(catalog.rows).toEqual([]);

    const result = await LibraryUpload.generated(
      catalog.client(),
      file,
      request,
      tigris.store
    );
    expect(tigris.upload.mock.calls).toEqual([
      [bytes, "image/png"],
      [bytes, "image/png"],
    ]);
    expect(result.object).toMatchObject({ path, sha256 });
    expect(catalog.rows).toHaveLength(1);
    expect(catalog.events).toEqual(["upload", "insert", "upload", "insert"]);
  });

  it("does not register or fall back to Supabase after a Tigris failure", async () => {
    vi.stubEnv("NEXT_PUBLIC_GRIDA_LIBRARY_STORAGE_PROVIDER", "tigris");
    const catalog = new Catalog();
    const tigris = objectStore(catalog);
    tigris.upload.mockRejectedValue(new Error("Tigris unavailable"));
    await expect(
      LibraryUpload.generated(catalog.client(), file, request, tigris.store)
    ).rejects.toThrow("Tigris unavailable");
    expect(catalog.storage.from).not.toHaveBeenCalled();
    expect(catalog.insertAttempts).toEqual([]);
  });

  it("fails closed when selected Tigris storage has no credentials", async () => {
    vi.stubEnv("NEXT_PUBLIC_GRIDA_LIBRARY_STORAGE_PROVIDER", "tigris");
    vi.stubEnv("GRIDA_LIBRARY_TIGRIS_BUCKET", undefined);
    vi.stubEnv("GRIDA_LIBRARY_TIGRIS_ACCESS_KEY_ID", undefined);
    vi.stubEnv("GRIDA_LIBRARY_TIGRIS_SECRET_ACCESS_KEY", undefined);
    const catalog = new Catalog();
    await expect(
      LibraryUpload.generated(catalog.client(), file, request)
    ).rejects.toThrow("Missing Library Tigris bucket or credentials");
    expect(catalog.storage.from).not.toHaveBeenCalled();
    expect(catalog.insertAttempts).toEqual([]);
  });
});
