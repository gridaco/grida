// GRIDA-SEC-010 — source handoff contract and actual form handler authority.
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import cases from "./__fixtures__/console-destinations.json";
import { destination } from "./console-destination";
import {
  consoleReturnURL,
  currentConsoleOrganization,
  manageInput,
  managePath,
} from "./console-manage";
const state = vi.hoisted(() => ({
  user: { id: "user-a" } as { id: string } | null,
  role: "owner",
  canonicalError: null as { code: string } | null,
  subject: "user-a",
  writes: [] as Record<string, unknown>[],
  updates: [] as Record<string, unknown>[],
  insertError: null as unknown,
}));
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: {
      getUser: async () => ({ data: { user: state.user }, error: null }),
    },
    rpc: async (_name: string, args: { organization_id: string }) => ({
      data: {
        subject: { id: state.subject },
        role: state.role,
        organization: {
          id: args.organization_id,
          name: "acme",
          state: "active",
        },
      },
      error: state.canonicalError,
    }),
    from: () => ({
      update: (value: Record<string, unknown>) => {
        state.updates.push(value);
        return { eq: async () => ({ error: null }) };
      },
    }),
  }),
  service_role: {
    workspace: {
      from: () => ({
        insert: (value: Record<string, unknown>) => {
          state.writes.push(value);
          return {
            select: () => ({
              single: async () => ({
                data: { id: 91, name: "new-org" },
                error: state.insertError,
              }),
            }),
          };
        },
      }),
    },
  },
}));
import { POST as create } from "@/app/(api)/private/accounts/organizations/new/route";
import { POST as profile } from "@/app/(api)/private/accounts/organizations/[org]/profile/route";
vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new Error(`redirect:${url}`);
  },
  notFound: () => {
    throw new Error("not_found");
  },
}));
vi.mock("@/app/(site)/organizations/new/form", () => ({ default: () => null }));
vi.mock(
  "@/app/(site)/organizations/[organization_name]/settings/profile/view",
  () => ({ default: () => null })
);
vi.mock("@/app/(site)/organizations/[organization_name]/people/page", () => ({
  default: () => null,
}));
import ManagePage from "@/app/(site)/gateway/manage/page";
const source = "https://grida.example.test",
  consoleOrigin = "https://console.example.test";
const target = "/organizations/42/gateway/requests/req_test1234";
beforeEach(() => {
  vi.stubEnv("GRIDA_BILLING_OWNER", "infra");
  vi.stubEnv("GRIDA_OAUTH_ORIGIN", source);
  vi.stubEnv("GRIDA_PLATFORM_CONSOLE_ORIGIN", consoleOrigin);
  state.user = { id: "user-a" };
  state.role = "owner";
  state.subject = "user-a";
  state.canonicalError = null;
  state.writes = [];
  state.updates = [];
  state.insertError = null;
});
afterEach(() => vi.unstubAllEnvs());
function request(
  kind: "new" | "profile",
  fields: Record<string, string>,
  origin = source
) {
  return new NextRequest(
    `${source}/private/accounts/organizations/${kind === "new" ? "new" : "acme/profile"}`,
    {
      method: "POST",
      headers: { origin, host: new URL(source).host },
      body: new URLSearchParams(fields),
    }
  );
}
describe("reviewed console destination mirror", () => {
  it.each(cases.valid)("accepts $input", ({ input, canonical }) =>
    expect(destination(input)).toBe(canonical)
  );
  it.each(cases.invalid)("refuses %s", (input) =>
    expect(destination(input)).toBeNull()
  );
});
it("retains exact organization/resource through the finite management envelope", () => {
  expect(
    manageInput({ intent: "settings", org_id: "42", return_to: target })
  ).toMatchObject({
    intent: "settings",
    organizationId: "42",
    returnTo: target,
  });
  expect(
    new URL(managePath("settings", target, "42"), source).searchParams.get(
      "return_to"
    )
  ).toBe(target);
  expect(consoleReturnURL(target)).toBe(consoleOrigin + target);
});
it.each([
  { intent: "settings", org_id: "43", return_to: target },
  { intent: "settings", org_id: "42", return_to: "/" },
  { intent: "organization", org_id: "042", return_to: target },
  { intent: "organization", org_id: "42", return_to: target, project_id: "7" },
  { intent: "settings", org_id: ["42", "43"], return_to: target },
  { intent: "create-organization", org_id: "42", return_to: target },
  { intent: "create-organization", return_to: "https://evil.test" },
  {
    intent: "create-organization",
    return_to: "/",
    error: "private diagnostic",
  },
])("refuses unsafe or ambiguous management envelope %#", (input) =>
  expect(() => manageInput(input)).toThrow(
    "Unable to open organization management."
  )
);
it("requires a current canonical member and settings owner independently of the return path", async () => {
  const read = vi.fn<(id: string) => Promise<{ data: unknown; error: null }>>(
    async (id) => ({
      data: {
        subject: { id: "user-a" },
        organization: { id, name: "acme", state: "active" },
        role: "member",
      },
      error: null,
    })
  );
  expect(await currentConsoleOrganization(read, "user-a", "42")).toEqual({
    id: "42",
    name: "acme",
  });
  await expect(
    currentConsoleOrganization(read, "user-a", "42", true)
  ).rejects.toMatchObject({ code: "forbidden" });
  await expect(
    currentConsoleOrganization(read, "user-b", "42")
  ).rejects.toMatchObject({ code: "forbidden" });
});
it("uses the existing real creation writer then returns the exact retained target", async () => {
  const response = await create(
    request("new", {
      name: "new-org",
      email: "owner@example.test",
      console_return_to: target,
    })
  );
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe(consoleOrigin + target);
  expect(state.writes).toEqual([
    { name: "new-org", email: "owner@example.test", owner_id: "user-a" },
  ]);
});
it("anonymous creation preserves the exact management continuation and performs no write", async () => {
  state.user = null;
  const response = await create(
    request("new", {
      name: "new-org",
      email: "owner@example.test",
      console_return_to: target,
    })
  );
  const login = new URL(response.headers.get("location")!);
  expect(response.status).toBe(303);
  expect(login.origin + login.pathname).toBe(source + "/sign-in");
  expect(login.searchParams.get("next")).toBe(
    managePath("create-organization", target)
  );
  expect(state.writes).toEqual([]);
});
it.each([
  "https://evil.test/",
  "/organizations/42/gateway/keys?token=secret",
  "/organizations/42/gateway/keys/byok_test1234",
])("rejects malformed creation return %s before writing", async (returnTo) => {
  const response = await create(
    request("new", {
      name: "new-org",
      email: "owner@example.test",
      console_return_to: returnTo,
    })
  );
  expect(response.status).toBe(400);
  expect(state.writes).toEqual([]);
});
it("rejects foreign-origin and no-longer-member creation returns before writing", async () => {
  expect(
    (
      await create(
        request(
          "new",
          {
            name: "new-org",
            email: "owner@example.test",
            console_return_to: target,
          },
          "https://evil.test"
        )
      )
    ).status
  ).toBe(403);
  state.canonicalError = { code: "42501" };
  expect(
    (
      await create(
        request("new", {
          name: "new-org",
          email: "owner@example.test",
          console_return_to: target,
        })
      )
    ).status
  ).toBe(403);
  expect(state.writes).toEqual([]);
});
it("creation failure retains the original resource without claiming creation succeeded", async () => {
  state.insertError = { message: "private database diagnostics" };
  const response = await create(
    request("new", {
      name: "new-org",
      email: "owner@example.test",
      console_return_to: target,
    })
  );
  const retry = new URL(response.headers.get("location")!);
  expect(retry.origin + retry.pathname).toBe(source + "/gateway/manage");
  expect(retry.searchParams.get("return_to")).toBe(target);
  expect(retry.searchParams.get("error")).toBe("create_failed");
});
it("ordinary released creation retains its original source destination", async () => {
  vi.stubEnv("GRIDA_BILLING_OWNER", "grida");
  const response = await create(
    request("new", { name: "new-org", email: "owner@example.test" })
  );
  expect(response.headers.get("location")).toBe(source + "/new-org");
  expect(state.writes).toHaveLength(1);
});
it("settings preserves current owner authority and exact continuation after an update", async () => {
  const fields = {
    display_name: "Acme",
    email: "owner@example.test",
    description: "",
    blog: "",
    console_return_to: target,
    console_organization_id: "42",
  };
  state.role = "member";
  expect(
    (
      await profile(request("profile", fields), {
        params: Promise.resolve({ org: "acme" }),
      })
    ).status
  ).toBe(403);
  expect(state.updates).toEqual([]);
  state.role = "owner";
  const response = await profile(request("profile", fields), {
    params: Promise.resolve({ org: "acme" }),
  });
  expect(response.status).toBe(303);
  expect(response.headers.get("location")).toBe(
    source + managePath("settings", target, "42")
  );
  expect(state.updates).toHaveLength(1);
});

it("signed-out management preserves the exact typed return across source sign-in", async () => {
  state.user = null;
  await expect(
    ManagePage({
      searchParams: Promise.resolve({
        intent: "settings",
        org_id: "42",
        return_to: target,
      }),
    })
  ).rejects.toThrow(
    `redirect:/sign-in?next=${encodeURIComponent(managePath("settings", target, "42"))}`
  );
  expect(state.writes).toEqual([]);
});
it("management entry denies inaccessible organizations and member settings before rendering", async () => {
  state.role = "member";
  await expect(
    ManagePage({
      searchParams: Promise.resolve({
        intent: "settings",
        org_id: "42",
        return_to: target,
      }),
    })
  ).rejects.toThrow("not_found");
  state.canonicalError = { code: "42501" };
  await expect(
    ManagePage({
      searchParams: Promise.resolve({
        intent: "organization",
        org_id: "42",
        return_to: target,
      }),
    })
  ).rejects.toThrow("not_found");
});
