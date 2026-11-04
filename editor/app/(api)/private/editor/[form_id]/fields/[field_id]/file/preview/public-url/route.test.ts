// GRIDA-SEC-016 — response file previews are authorized as the caller.
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({
  form: null as Record<string, unknown> | null,
  reads: [] as unknown[],
  resolved: [] as unknown[],
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
          getPublicUrl: (path: string) => {
            h.resolved.push({ bucket, path });
            return {
              data: { publicUrl: `https://storage.example.test/${path}` },
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
      `https://grida.example.test/private/editor/${form_id}/fields/${field}/file/preview/public-url?path=${encodeURIComponent(path)}`
    ),
    { params: Promise.resolve({ form_id, field_id: field }) }
  );

beforeEach(() => {
  h.form = {
    fields: [{ id: field_id, storage: null }],
    supabase_connection: null,
  };
  h.reads = [];
  h.resolved = [];
});

describe("form field file preview (public-url)", () => {
  it("returns the public url of the field's response file to a member", async () => {
    const response = await invoke(filepath);
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: { publicUrl: `https://storage.example.test/${filepath}` },
      error: null,
    });
    expect(h.reads).toEqual([{ table: "form", column: "id", value: form_id }]);
  });

  it("does not resolve when the caller cannot read the form", async () => {
    h.form = null;
    await expect(invoke(filepath)).rejects.toThrow("not_found");
    expect(h.resolved).toEqual([]);
  });

  it("does not resolve for a field outside the form", async () => {
    const other_field = "44444444-4444-4444-8444-444444444444";
    await expect(
      invoke(`response/${response_id}/${other_field}/photo.png`, other_field)
    ).rejects.toThrow("not_found");
    expect(h.resolved).toEqual([]);
  });

  it("does not resolve a path outside the field's response files", async () => {
    await expect(
      invoke(`response/${response_id}/other-field/photo.png`)
    ).rejects.toThrow("not_found");
    expect(h.resolved).toEqual([]);
  });
});
