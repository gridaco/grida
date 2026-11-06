import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({
  form: null as Record<string, unknown> | null,
  lookupError: null as { message: string } | null,
  reads: [] as unknown[],
  managedBuckets: [] as string[],
  connectedClients: [] as unknown[],
  resolved: [] as unknown[],
}));
vi.mock("@/lib/supabase/server", () => ({
  createFormsClient: async () => ({
    from: (table: string) => ({
      select: () => ({
        eq: (column: string, value: string) => ({
          single: async () => {
            h.reads.push({ table, column, value });
            return { data: h.form, error: h.lookupError };
          },
        }),
      }),
    }),
  }),
  service_role: {
    forms: {
      from: () => {
        throw new Error("form lookup must not bypass RLS");
      },
      storage: {
        from: (bucket: string) => {
          h.managedBuckets.push(bucket);
          return {
            getPublicUrl: (path: string) => {
              h.resolved.push({ bucket, path });
              return {
                data: { publicUrl: `https://storage.example.test/${path}` },
              };
            },
          };
        },
      },
    },
  },
}));
vi.mock("@/services/x-supabase", () => ({
  createXSupabaseClient: async (project: number, options: unknown) => {
    h.connectedClients.push({ project, options });
    return {
      storage: {
        from: (bucket: string) => ({
          getPublicUrl: (path: string) => {
            h.resolved.push({ bucket, path });
            return {
              data: { publicUrl: `https://connected.example.test/${path}` },
            };
          },
        }),
      },
    };
  },
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("not_found");
  },
}));
import { GET } from "./route";

const form_id = "33333333-3333-4333-8333-333333333333";
const field_id = "11111111-1111-4111-8111-111111111111";
const response_id = "22222222-2222-4222-8222-222222222222";
const filepath = `response/${response_id}/${field_id}/photo.png`;

function invoke(path?: string, field = field_id) {
  const url = new URL(
    `https://grida.example.test/private/editor/${form_id}/fields/${field}/file/preview/public-url`
  );
  if (path !== undefined) url.searchParams.set("path", path);
  return GET(new NextRequest(url), {
    params: Promise.resolve({ form_id, field_id: field }),
  });
}

function expectNoStorageAccess() {
  expect(h.managedBuckets).toEqual([]);
  expect(h.connectedClients).toEqual([]);
  expect(h.resolved).toEqual([]);
}

beforeEach(() => {
  h.form = {
    fields: [{ id: field_id, storage: null }],
    supabase_connection: null,
  };
  h.lookupError = null;
  h.reads = [];
  h.managedBuckets = [];
  h.connectedClients = [];
  h.resolved = [];
});
afterEach(() => vi.restoreAllMocks());

describe("form field file preview (public-url)", () => {
  it("returns the public url of the field's response file to a member", async () => {
    const response = await invoke(filepath);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({
      data: { publicUrl: `https://storage.example.test/${filepath}` },
      error: null,
    });
    expect(h.reads).toEqual([{ table: "form", column: "id", value: form_id }]);
    expect(h.resolved).toEqual([
      { bucket: expect.any(String), path: filepath },
    ]);
    expect(h.connectedClients).toEqual([]);
  });

  it("denies a caller who cannot read the form before accessing storage", async () => {
    h.form = null;
    await expect(invoke(filepath)).rejects.toThrow("not_found");
    expectNoStorageAccess();
  });

  it("denies a failed form lookup before accessing storage", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    h.lookupError = { message: "lookup failed" };
    h.form = null;
    await expect(invoke(filepath)).rejects.toThrow("not_found");
    expectNoStorageAccess();
  });

  it("denies a field outside the form before accessing storage", async () => {
    await expect(invoke(filepath, "other-field")).rejects.toThrow("not_found");
    expectNoStorageAccess();
  });

  it.each([
    undefined,
    "",
    `response/${response_id}/other-field/photo.png`,
    `tmp/session/${field_id}/photo.png`,
    `response/${response_id}/${field_id}/..\\..\\other-response\\other-field\\photo.png`,
  ])(
    "denies an invalid managed path %s before accessing storage",
    async (path) => {
      await expect(invoke(path)).rejects.toThrow("not_found");
      expectNoStorageAccess();
    }
  );

  it("resolves the configured connected bucket without imposing managed paths", async () => {
    h.form = {
      fields: [
        { id: field_id, storage: { type: "x-supabase", bucket: "uploads" } },
      ],
      supabase_connection: { supabase_project_id: 73 },
    };
    const path = "customers/42/documents/photo.png";
    const response = await invoke(path);
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(await response.json()).toEqual({
      data: { publicUrl: `https://connected.example.test/${path}` },
      error: null,
    });
    expect(h.connectedClients).toEqual([
      { project: 73, options: { service_role: true } },
    ]);
    expect(h.resolved).toEqual([{ bucket: "uploads", path }]);
    expect(h.managedBuckets).toEqual([]);
  });
});
