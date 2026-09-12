// GRIDA-SEC-006 — see /SECURITY.md
// GRIDA-GG: desktop — chosen funding and accepted-task recovery boundaries.
import { describe, expect, it, vi } from "vitest";
import { GridaGatewayTripo } from "./gg-tripo";
import type { GridaGatewaySessionState } from "./gg-session";

const active = {
  kind: "active",
  expires_at: 1_000_000,
  organization: { id: 7, name: "Studio" },
} as const;
const deps = () => ({
  ensureFresh: vi
    .fn<() => Promise<GridaGatewaySessionState>>()
    .mockResolvedValue(active),
  forceRefresh: vi
    .fn<() => Promise<GridaGatewaySessionState>>()
    .mockResolvedValue(active),
});

describe("GridaGatewayTripo.execute", () => {
  it("runs BYOK without preparing or spending a Grida session", async () => {
    const session = deps();
    const operation = vi.fn<() => Promise<string>>().mockResolvedValue("byok");
    expect(await GridaGatewayTripo.execute("tripo", operation, session)).toBe(
      "byok"
    );
    expect(operation).toHaveBeenCalledOnce();
    expect(session.ensureFresh).not.toHaveBeenCalled();
    expect(session.forceRefresh).not.toHaveBeenCalled();
  });

  it.each(["signed_out", "no_organization", "unsupported", "error"] as const)(
    "refuses a %s GG session before provider submission",
    async (kind) => {
      const session = deps();
      session.ensureFresh.mockResolvedValue({ kind });
      const operation = vi.fn<() => Promise<unknown>>();
      await expect(
        GridaGatewayTripo.execute("gg", operation, session)
      ).rejects.toThrow(/Grida|Desktop/);
      expect(operation).not.toHaveBeenCalled();
    }
  );

  it("refreshes once for pre-acceptance expiry and retains the selected operation", async () => {
    const session = deps();
    const receipt = { task: { id: "accepted-once" } };
    const operation = vi.fn<() => Promise<typeof receipt>>();
    operation
      .mockRejectedValueOnce(new Error("gg_token_expired"))
      .mockResolvedValue(receipt);
    expect(await GridaGatewayTripo.execute("gg", operation, session)).toBe(
      receipt
    );
    expect(session.forceRefresh).toHaveBeenCalledOnce();
    expect(operation).toHaveBeenCalledTimes(2);
  });

  it.each([
    new Error("gg_token_expired Tripo task: already-accepted."),
    Object.assign(new Error("gg_token_expired"), {
      task_id: "already-accepted",
    }),
    new Error("insufficient_credits"),
    new Error("provider_unavailable"),
    new Error(
      "The Tripo service is currently unavailable. Tripo task: already-accepted."
    ),
    new Error("network unavailable"),
  ])(
    "preserves failed or accepted requests without a paid retry: %s",
    async (failure) => {
      const session = deps();
      const operation = vi
        .fn<() => Promise<unknown>>()
        .mockRejectedValue(failure);
      await expect(
        GridaGatewayTripo.execute("gg", operation, session)
      ).rejects.toBe(failure);
      expect(operation).toHaveBeenCalledOnce();
      expect(session.forceRefresh).not.toHaveBeenCalled();
    }
  );

  it("does not repeat a failed recovery or submit after sign-out during refresh", async () => {
    const session = deps();
    const failure = new Error("gg_token_expired");
    const operation = vi
      .fn<() => Promise<unknown>>()
      .mockRejectedValue(failure);
    await expect(
      GridaGatewayTripo.execute("gg", operation, session)
    ).rejects.toBe(failure);
    expect(operation).toHaveBeenCalledTimes(2);
    operation.mockClear();
    session.forceRefresh.mockResolvedValue({ kind: "signed_out" });
    await expect(
      GridaGatewayTripo.execute("gg", operation, session)
    ).rejects.toThrow("Sign in");
    expect(operation).toHaveBeenCalledOnce();
  });
});

describe("GridaGatewayTripo.Access", () => {
  it("keeps a keyless funded session ready independently from BYOK", async () => {
    const access = new GridaGatewayTripo.Access(true, {
      hasKey: async () => false,
      ensureFresh: async () => active,
    });
    await access.refresh();
    expect(GridaGatewayTripo.connection("gg", access.getSnapshot())).toEqual({
      ready: true,
      label: "Grida credits · Studio",
    });
    expect(
      GridaGatewayTripo.connection("tripo", access.getSnapshot())
    ).toMatchObject({ ready: false, href: "/desktop/settings#provider-tripo" });
  });

  it("does not mint a session on an older BYOK-only host", async () => {
    const ensureFresh = vi.fn<() => Promise<GridaGatewaySessionState>>();
    const access = new GridaGatewayTripo.Access(false, {
      hasKey: async () => true,
      ensureFresh,
    });
    await access.refresh();
    expect(ensureFresh).not.toHaveBeenCalled();
    expect(
      GridaGatewayTripo.connection("tripo", access.getSnapshot()).ready
    ).toBe(true);
    expect(GridaGatewayTripo.connection("gg", access.getSnapshot()).ready).toBe(
      false
    );
  });

  it("ignores stale refreshes so a late key/session result cannot undo sign-out", async () => {
    let resolveOld!: (state: GridaGatewaySessionState) => void;
    const old = new Promise<GridaGatewaySessionState>((resolve) => {
      resolveOld = resolve;
    });
    const ensureFresh = vi.fn<() => Promise<GridaGatewaySessionState>>();
    ensureFresh
      .mockReturnValueOnce(old)
      .mockResolvedValue({ kind: "signed_out" });
    const access = new GridaGatewayTripo.Access(true, {
      hasKey: async () => false,
      ensureFresh,
    });
    const first = access.refresh();
    await Promise.resolve();
    await access.refresh();
    resolveOld(active);
    await first;
    expect(access.getSnapshot().hosted).toEqual({ kind: "signed_out" });
  });

  it("keeps BYOK runnable when GG refresh fails", async () => {
    const access = new GridaGatewayTripo.Access(true, {
      hasKey: async () => true,
      ensureFresh: async () => {
        throw new Error("offline");
      },
    });
    await access.refresh();
    expect(
      GridaGatewayTripo.connection("tripo", access.getSnapshot()).ready
    ).toBe(true);
    expect(
      GridaGatewayTripo.connection("gg", access.getSnapshot())
    ).toMatchObject({ ready: false, retry: true });
  });
});
