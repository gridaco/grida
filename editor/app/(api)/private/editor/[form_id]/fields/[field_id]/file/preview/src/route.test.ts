// GRIDA-SEC-016 — response file previews are authorized as the caller.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({
  form: null as Record<string, unknown> | null,
  reads: [] as unknown[],
  signed: [] as unknown[],
}));
vi.mock("@/lib/supabase/server", () => ({
  createFormsClient: async () => ({
    from: (table: string) => ({
      select: () => ({
        eq: (column: string, value: string) => ({
          maybeSingle: async () => {
            h.reads.push({ table, column, value });
            return { data: h.form, error: null };
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
        from: (bucket: string) => ({
          createSignedUrl: async (path: string) => {
            h.signed.push({ bucket, path });
            return {
              data: { signedUrl: `https://storage.example.test/${path}` },
            };
          },
        }),
      },
    },
  },
}));
vi.mock("@/services/x-supabase", () => ({
  createXSupabaseClient: () => {
    throw new Error("unexpected x-supabase client");
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

const invoke = (path: string, field = field_id) =>
  GET(
    new NextRequest(
      `https://grida.example.test/private/editor/${form_id}/fields/${field}/file/preview/src?path=${encodeURIComponent(path)}`
    ),
    { params: Promise.resolve({ form_id, field_id: field }) }
  );

beforeEach(() => {
  h.form = {
    fields: [{ id: field_id, storage: null }],
    supabase_connection: null,
  };
  h.reads = [];
  h.signed = [];
});

describe("form field file preview (src)", () => {
  it("redirects a member to the signed url of the field's response file", async () => {
    const response = await invoke(filepath);
    expect(response.status).toBe(302);
    expect(response.headers.get("location")).toBe(
      `https://storage.example.test/${filepath}`
    );
    expect(response.headers.get("cache-control")).toBe("private, max-age=3600");
    expect(h.reads).toEqual([{ table: "form", column: "id", value: form_id }]);
    expect(h.signed).toEqual([{ bucket: expect.any(String), path: filepath }]);
  });

  it("does not sign when the caller cannot read the form", async () => {
    h.form = null;
    await expect(invoke(filepath)).rejects.toThrow("not_found");
    expect(h.signed).toEqual([]);
  });

  it("does not sign for a field outside the form", async () => {
    const other_field = "44444444-4444-4444-8444-444444444444";
    await expect(
      invoke(`response/${response_id}/${other_field}/photo.png`, other_field)
    ).rejects.toThrow("not_found");
    expect(h.signed).toEqual([]);
  });

  it.each([
    `response/${response_id}/44444444-4444-4444-8444-444444444444/photo.png`,
    `tmp/session/${field_id}/photo.png`,
    `response/../${field_id}/photo.png`,
  ])("does not sign %s outside the field's response files", async (path) => {
    await expect(invoke(path)).rejects.toThrow("not_found");
    expect(h.signed).toEqual([]);
  });
});
