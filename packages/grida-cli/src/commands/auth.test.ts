import { AuthClient } from "@grida/auth";
import { describe, expect, it, vi } from "vitest";
import { AuthCommands } from "./auth";

const config: AuthClient.Config = {
  clientId: "synthetic-public-client",
  issuer: "https://issuer.invalid/auth/v1",
  apiOrigin: "https://grida.invalid",
  redirectUris: ["http://127.0.0.1:55435/callback"],
};
const identity = { id: "synthetic-user", email: null, display_name: "Insider" };
const now = 1_800_000_000_000;

function setup() {
  let session: AuthClient.Session | null = null;
  const read = vi.fn<AuthClient.Custody["read"]>(async () => session);
  const close = vi.fn<() => Promise<void>>(async () => {});
  const openBrowser = vi.fn<(url: string) => Promise<void>>(async () => {});
  const send = vi.fn<
    (request: AuthClient.Request) => Promise<AuthClient.Response>
  >(async (request) => {
    if (request.url.endsWith("/oauth/token")) {
      return {
        status: 200,
        body: {
          access_token: "synthetic-access",
          refresh_token: "synthetic-refresh",
          expires_in: 3600,
          token_type: "bearer",
        },
      };
    }
    if (request.url.endsWith("/logout?scope=local"))
      return { status: 204, body: null };
    return { status: 200, body: identity };
  });
  const client = new AuthClient(config, {
    custody: {
      read,
      async write(value) {
        session = value;
      },
      async clear() {
        session = null;
      },
    },
    now: () => now,
    async pkce() {
      return {
        verifier: "v".repeat(43),
        state: "s".repeat(43),
        challenge: "c".repeat(43),
      };
    },
    async listen(redirectUris, state) {
      return {
        redirectUri: redirectUris[0]!,
        result: Promise.resolve({ state, code: "synthetic-code" }),
        cancel() {},
        close,
      };
    },
    openBrowser,
    request(request) {
      return { result: send(request), cancel() {} };
    },
  });
  const info = {
    backend: "keyring" as const,
    profile: "opaque-profile",
    initialized: true,
    migration: null,
  };
  const storage = {
    info: vi.fn<AuthCommands.Runtime["storage"]["info"]>(async () => info),
    migrate: vi.fn<AuthCommands.Runtime["storage"]["migrate"]>(
      async (backend) => ({ ...info, backend })
    ),
  };
  const runtime: AuthCommands.Runtime = { client, storage };
  return { runtime, send, read, close, openBrowser };
}

describe("AuthCommands", () => {
  it("returns safe login metadata and observes the saved session locally", async () => {
    const { runtime, send, close, openBrowser } = setup();
    expect(await AuthCommands.login(runtime)).toEqual({
      state: "signed-in",
      identity,
      expiresAt: now + 3_600_000,
    });
    expect(openBrowser).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
    const beforeStatus = send.mock.calls.length;
    const local = await AuthCommands.status(runtime);
    expect(local).toEqual({
      state: "signed-in",
      identity,
      expiresAt: now + 3_600_000,
    });
    expect(JSON.stringify(local)).not.toMatch(
      /synthetic-access|synthetic-refresh|synthetic-code/
    );
    expect(send).toHaveBeenCalledTimes(beforeStatus);
  });

  it("preserves offline logout's unconfirmed revocation and the local clear", async () => {
    const { runtime, send } = setup();
    await AuthCommands.login(runtime);
    send.mockRejectedValueOnce(new Error("Synthetic network failure"));
    expect(await AuthCommands.logout(runtime)).toEqual({
      state: "signed-out",
      revocation: "unconfirmed",
    });
    expect(await AuthCommands.status(runtime)).toEqual({ state: "signed-out" });
    expect(await AuthCommands.logout(runtime)).toEqual({
      state: "signed-out",
      revocation: "not-needed",
    });
    expect(send).toHaveBeenCalledTimes(3);
  });

  it("preserves a safe producer failure without retry or inventing a session", async () => {
    const { runtime, send, close } = setup();
    const failure = new AuthClient.Failure("token_rejected");
    send.mockRejectedValueOnce(failure);
    await expect(AuthCommands.login(runtime)).rejects.toBe(failure);
    expect(send).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
    expect(await AuthCommands.status(runtime)).toEqual({ state: "signed-out" });
  });

  it("uses safe storage controls without reading credentials or starting authentication", async () => {
    const { runtime, read, send, openBrowser } = setup();
    expect(await AuthCommands.storageShow(runtime)).toEqual({
      backend: "keyring",
      profile: "opaque-profile",
      initialized: true,
      migration: null,
    });
    expect(await AuthCommands.storageMigrate(runtime, "file")).toMatchObject({
      backend: "file",
      migration: null,
    });
    const failure = new AuthClient.Failure("custody_failed");
    runtime.storage.migrate = async () => {
      throw failure;
    };
    await expect(AuthCommands.storageMigrate(runtime, "keyring")).rejects.toBe(
      failure
    );
    expect(read).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
    expect(openBrowser).not.toHaveBeenCalled();
  });
});
