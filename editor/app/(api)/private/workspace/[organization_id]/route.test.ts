// GRIDA-EE: billing — passive workspace plans preserve caller authority and unknowns.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const h = vi.hoisted(() => ({
  organizations: [] as Record<string, unknown>[] | null,
  projects: [] as Record<string, unknown>[] | null,
  documents: [] as Record<string, unknown>[] | null,
  session: { access_token: "current.user.token" } as {
    access_token: string;
  } | null,
  sessionError: null as Error | null,
  reads: [] as unknown[],
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getSession: async () => ({
        data: { session: h.session },
        error: h.sessionError,
      }),
    },
    from: (table: string) => {
      h.reads.push({ table });
      if (table === "organization")
        return {
          select: () => Promise.resolve({ data: h.organizations, error: null }),
        };
      if (table === "project")
        return {
          select: () => ({
            eq: (column: string, id: number) => {
              h.reads.push({ column, id });
              return Promise.resolve({ data: h.projects, error: null });
            },
          }),
        };
      throw new Error(`Unexpected source read: ${table}`);
    },
    rpc: (name: string, args: unknown, options: unknown) => {
      h.reads.push({ name, args, options });
      return {
        order: (column: string, options: unknown) => {
          h.reads.push({ column, options });
          return Promise.resolve({ data: h.documents, error: null });
        },
      };
    },
  }),
}));
vi.mock("@/services/public-urls", () => ({
  PublicUrls: {
    organization_avatar_url: () => (path: string) =>
      `https://assets.example.test/${path}`,
  },
}));
vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("not_found");
  },
}));
import { GET } from "./route";

const origin = "https://platform.example.test";
const organization = (id: number, is_enterprise = false) => ({
  id,
  name: `org-${id}`,
  display_name: `Organization ${id}`,
  avatar_path: id === 1 ? "org-1.png" : null,
  is_enterprise,
});
const invoke = (id = "1") =>
  GET(new NextRequest(`https://grida.example.test/private/workspace/${id}`), {
    params: Promise.resolve({ organization_id: id }),
  });
const summary = (id: number, plan: "free" | "pro" | "team" | "custom") => ({
  organization_id: String(id),
  plan,
  managed_contract: plan === "custom",
  account_present: plan !== "free",
});
const configured = () => {
  vi.stubEnv("GRIDA_PLATFORM_BILLING_ORIGIN", origin);
  vi.stubEnv("GRIDA_PLATFORM_SSR_KEY_ID", "workspace-test");
  vi.stubEnv("GRIDA_PLATFORM_SSR_TOKEN", "x".repeat(43));
};
const fetchSummaries = (
  plans: Record<number, "free" | "pro" | "team" | "custom">
) => {
  const fetcher = vi.fn<typeof fetch>(async (input) => {
    const id = Number(new URL(String(input)).pathname.split("/").at(-2));
    return Response.json(summary(id, plans[id]));
  });
  vi.stubGlobal("fetch", fetcher);
  return fetcher;
};
beforeEach(() => {
  h.organizations = [organization(1)];
  h.projects = [{ id: 4, organization_id: 1, name: "project" }];
  h.documents = [{ id: "document", project_id: 4 }];
  h.session = { access_token: "current.user.token" };
  h.sessionError = null;
  h.reads = [];
  vi.stubEnv("GRIDA_PLATFORM_BILLING_ORIGIN", "");
  vi.stubEnv("GRIDA_PLATFORM_SSR_KEY_ID", "");
  vi.stubEnv("GRIDA_PLATFORM_SSR_TOKEN", "");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("workspace Platform plan projection", () => {
  it("reads each RLS-visible org with the current browser bearer and preserves workspace data", async () => {
    configured();
    h.organizations = [organization(1), organization(2), organization(3)];
    const fetcher = fetchSummaries({ 1: "free", 2: "pro", 3: "team" });
    const response = await invoke();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      data: {
        organizations: h.organizations.map((org, i) => ({
          ...org,
          avatar_url: org.avatar_path
            ? `https://assets.example.test/${org.avatar_path}`
            : null,
          plan: ["free", "pro", "team"][i],
        })),
        projects: h.projects,
        documents: h.documents,
      },
      error: null,
    });
    expect(fetcher).toHaveBeenCalledTimes(3);
    for (const [i, [target, init]] of fetcher.mock.calls.entries()) {
      expect(target).toBe(
        `${origin}/platform/v1/billing/organizations/${i + 1}/summary`
      );
      expect(init).toMatchObject({
        method: "GET",
        credentials: "omit",
        redirect: "error",
        cache: "no-store",
      });
      const headers = new Headers(init?.headers);
      expect(headers.get("X-Grida-Account-Token")).toBe("current.user.token");
      expect(headers.get("Authorization")).toBe(`Bearer ${"x".repeat(43)}`);
      expect(headers.has("X-Grida-Native-Token")).toBe(false);
      expect(headers.has("Cookie")).toBe(false);
    }
    expect(h.reads).toEqual([
      { table: "organization" },
      { table: "project" },
      { column: "organization_id", id: 1 },
      {
        name: "workspace_documents",
        args: { p_organization_id: 1 },
        options: { get: true },
      },
      { column: "updated_at", options: { ascending: false } },
    ]);
  });

  it("observes Custom without overwriting the canonical enterprise property", async () => {
    configured();
    h.organizations = [organization(1), organization(2, true)];
    fetchSummaries({ 1: "custom", 2: "pro" });
    const { data } = await (await invoke()).json();
    expect(
      data.organizations.map(
        ({ plan, is_enterprise }: Record<string, unknown>) => ({
          plan,
          is_enterprise,
        })
      )
    ).toEqual([
      { plan: "custom", is_enterprise: false },
      { plan: "pro", is_enterprise: true },
    ]);
  });

  it.each(["missing_config", "missing_session", "session_error"])(
    "serves workspace with an unknown plan and no financial read when %s",
    async (reason) => {
      if (reason !== "missing_config") configured();
      if (reason === "missing_session") h.session = null;
      if (reason === "session_error") h.sessionError = new Error("unavailable");
      h.organizations = [organization(1, true)];
      const fetcher = vi.fn<typeof fetch>();
      vi.stubGlobal("fetch", fetcher);
      const response = await invoke();
      expect(response.status).toBe(200);
      const { data } = await response.json();
      expect(data.organizations[0]).toMatchObject({
        plan: null,
        is_enterprise: true,
      });
      expect(data.projects).toEqual(h.projects);
      expect(data.documents).toEqual(h.documents);
      expect(fetcher).not.toHaveBeenCalled();
    }
  );

  it.each([403, 503])(
    "keeps a denied/unavailable projection (%s) unknown for only that org",
    async (status) => {
      configured();
      h.organizations = [organization(1), organization(2)];
      const fetcher = vi.fn<typeof fetch>(async (input) =>
        String(input).includes("/1/")
          ? new Response(null, { status })
          : Response.json(summary(2, "pro"))
      );
      vi.stubGlobal("fetch", fetcher);
      const { data } = await (await invoke()).json();
      expect(
        data.organizations.map((org: { plan: unknown }) => org.plan)
      ).toEqual([null, "pro"]);
      expect(fetcher).toHaveBeenCalledTimes(2);
    }
  );

  it("keeps mismatched projection authority unknown instead of inventing Free", async () => {
    configured();
    vi.stubGlobal(
      "fetch",
      vi.fn<typeof fetch>(async () => Response.json(summary(2, "free")))
    );
    const { data } = await (await invoke()).json();
    expect(data.organizations[0].plan).toBeNull();
  });

  it.each(["organizations", "projects", "documents"] as const)(
    "retains the source %s guard before billing reads",
    async (source) => {
      configured();
      h[source] = null;
      const fetcher = vi.fn<typeof fetch>();
      vi.stubGlobal("fetch", fetcher);
      await expect(invoke()).rejects.toThrow("not_found");
      expect(fetcher).not.toHaveBeenCalled();
    }
  );

  it("retains the invalid organization guard before source or billing reads", async () => {
    const fetcher = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetcher);
    await expect(invoke("invalid")).rejects.toThrow("not_found");
    expect(h.reads).toEqual([]);
    expect(fetcher).not.toHaveBeenCalled();
  });
});
