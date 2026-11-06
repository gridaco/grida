import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({
  form: null as Record<string, unknown> | null,
  lookupError: null as { message: string } | null,
  reads: [] as unknown[],
  managedBuckets: [] as string[],
  connectedClients: [] as unknown[],
  connectedBuckets: [] as string[],
  bucket: { public: false } as { public: boolean } | null,
  storageError: false,
  signed: [] as unknown[],
  publicUrls: [] as unknown[],
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
            createSignedUrl: async (path: string, expiresIn: number) => {
              h.signed.push({ bucket, path, expiresIn });
              return {
                data: h.storageError
                  ? null
                  : { signedUrl: `https://storage.example.test/${path}` },
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
        getBucket: async (bucket: string) => {
          h.connectedBuckets.push(bucket);
          return { data: h.bucket, error: null };
        },
        from: (bucket: string) => ({
          createSignedUrl: async (path: string, expiresIn: number) => {
            h.signed.push({ bucket, path, expiresIn });
            return {
              data: h.storageError
                ? null
                : { signedUrl: `https://connected.example.test/${path}` },
            };
          },
          getPublicUrl: (path: string) => {
            h.publicUrls.push({ bucket, path });
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
    `https://grida.example.test/private/editor/${form_id}/fields/${field}/file/preview/src`
  );
  if (path !== undefined) url.searchParams.set("path", path);
  return GET(new NextRequest(url), {
    params: Promise.resolve({ form_id, field_id: field }),
  });
}

function expectNoStorageAccess() {
  expect(h.managedBuckets).toEqual([]);
  expect(h.connectedClients).toEqual([]);
  expect(h.signed).toEqual([]);
  expect(h.publicUrls).toEqual([]);
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
  h.connectedBuckets = [];
  h.bucket = { public: false };
  h.storageError = false;
  h.signed = [];
  h.publicUrls = [];
});
afterEach(() => vi.restoreAllMocks());

describe("form field file preview (src)", () => {
  it("redirects a member to the signed url of the field's response file", async () => {
    const response = await invoke(filepath);
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      `https://storage.example.test/${filepath}`
    );
    expect(response.headers.get("cache-control")).toBe("private, max-age=3600");
    expect(h.reads).toEqual([{ table: "form", column: "id", value: form_id }]);
    expect(h.signed).toEqual([
      { bucket: expect.any(String), path: filepath, expiresIn: 3600 },
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

  it.each([false, true])(
    "previews configured connected storage with public=%s",
    async (isPublic) => {
      h.form = {
        fields: [
          { id: field_id, storage: { type: "x-supabase", bucket: "uploads" } },
        ],
        supabase_connection: { supabase_project_id: 73 },
      };
      h.bucket = { public: isPublic };
      const path = "customers/42/documents/photo.png";
      const response = await invoke(path);
      expect(response.status).toBe(302);
      expect(response.headers.get("location")).toBe(
        `https://connected.example.test/${path}`
      );
      expect(response.headers.get("cache-control")).toBe(
        "private, max-age=3600"
      );
      expect(h.connectedClients).toEqual([
        { project: 73, options: { service_role: true } },
      ]);
      expect(h.connectedBuckets).toEqual(["uploads"]);
      expect(h.managedBuckets).toEqual([]);
      expect(h.signed).toEqual(
        isPublic ? [] : [{ bucket: "uploads", path, expiresIn: 3600 }]
      );
      expect(h.publicUrls).toEqual(
        isPublic ? [{ bucket: "uploads", path }] : []
      );
    }
  );

  it("returns not found when managed storage cannot sign the file", async () => {
    h.storageError = true;
    await expect(invoke(filepath)).rejects.toThrow("not_found");
  });
});
