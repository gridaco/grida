// GRIDA-EE: entitlement — hosted AI recovery context tests.

import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUser: vi.fn<() => Promise<{ data: { user: { id: string } | null } }>>(),
  resolveSessionOrganization:
    vi.fn<(userId: string) => Promise<{ id: number; name: string } | null>>(),
  getEntitlement: vi.fn<
    (organizationId: number) => Promise<{
      allowed: boolean;
      reason?: "no_balance" | "below_floor" | "not_provisioned";
      cachedBalanceCents: number;
      cachedAt: string | null;
    }>
  >(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({ auth: { getUser: mocks.getUser } }),
}));

vi.mock("@/lib/auth/organization", () => ({
  resolveSessionOrganization: mocks.resolveSessionOrganization,
}));

vi.mock("@/lib/billing/metronome", () => ({
  getEntitlement: mocks.getEntitlement,
}));

import { resolveSessionAiRunRemedy } from "./server";

describe("resolveSessionAiRunRemedy", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
  });

  it("requires sign-in when the server session is absent", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });

    await expect(resolveSessionAiRunRemedy()).resolves.toEqual({
      kind: "signed_out",
      href: "/sign-in",
    });
    expect(mocks.resolveSessionOrganization).not.toHaveBeenCalled();
  });

  it("routes a member without an organization to setup", async () => {
    mocks.resolveSessionOrganization.mockResolvedValue(null);

    await expect(resolveSessionAiRunRemedy()).resolves.toEqual({
      kind: "organization_required",
      href: "/organizations/new",
    });
  });

  it("reports ready without exposing billing context", async () => {
    mocks.resolveSessionOrganization.mockResolvedValue({
      id: 7,
      name: "acme",
    });
    mocks.getEntitlement.mockResolvedValue({
      allowed: true,
      cachedBalanceCents: 500,
      cachedAt: null,
    });

    await expect(resolveSessionAiRunRemedy()).resolves.toEqual({
      kind: "ready",
    });
    expect(mocks.getEntitlement).toHaveBeenCalledWith(7);
  });

  it("builds billing recovery from the verified session organization", async () => {
    mocks.resolveSessionOrganization.mockResolvedValue({
      id: 7,
      name: "acme-studio",
    });
    mocks.getEntitlement.mockResolvedValue({
      allowed: false,
      reason: "below_floor",
      cachedBalanceCents: 0,
      cachedAt: null,
    });

    await expect(resolveSessionAiRunRemedy()).resolves.toEqual({
      kind: "credit_required",
      organizationName: "acme-studio",
      href: "/organizations/acme-studio/settings/billing",
    });
  });

  it("fails to a non-authorizing generic remedy", async () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.resolveSessionOrganization.mockRejectedValue(new Error("db down"));

    await expect(resolveSessionAiRunRemedy()).resolves.toEqual({
      kind: "unavailable",
    });
    expect(log).toHaveBeenCalledOnce();
    log.mockRestore();
  });
});
