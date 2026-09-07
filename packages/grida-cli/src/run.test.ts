// GRIDA-SEC-010 — safe command results and process lifetime around credential work.
import { AuthClient } from "@grida/auth";
import { AccountClient } from "@grida/account";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Cli } from "./cli";
import { CliHost } from "./host";
import { Output } from "./output";
import { run } from "./run";

const identity = {
  id: "synthetic-user",
  email: "user@example.invalid",
  display_name: "Insider",
};
const signedIn: AuthClient.Status = {
  state: "signed-in",
  identity,
  expiresAt: 1_900_000_000_000,
};
const info = {
  backend: "file" as const,
  profile: "opaque-profile",
  initialized: true,
  migration: null,
};

function setup(json = true) {
  const client = {
    login: vi.fn<() => Promise<AuthClient.Status>>(async () => signedIn),
    status: vi.fn<() => Promise<AuthClient.Status>>(async () => signedIn),
    logout: vi.fn<() => Promise<AuthClient.Logout>>(async () => ({
      state: "signed-out",
      revocation: "confirmed",
    })),
    verify: vi.fn<() => Promise<AuthClient.Status>>(async () => signedIn),
    cancelLogin: vi.fn<() => Promise<void>>(async () => {}),
    requestAccount: vi.fn<
      (operation: string, input?: unknown) => Promise<unknown>
    >(async () => ({ organizations: [], next_cursor: null })),
  };
  const storage = {
    info: vi.fn<CliHost.Runtime["storage"]["info"]>(async () => info),
    migrate: vi.fn<CliHost.Runtime["storage"]["migrate"]>(async (backend) => ({
      ...info,
      backend,
    })),
  };
  // Stub only the public producer methods. No auth internals or real host I/O.
  const runtime = { client, storage } as unknown as CliHost.Runtime;
  const open = vi.spyOn(CliHost, "open").mockResolvedValue(runtime);
  const stdout: string[] = [],
    stderr: string[] = [];
  const output = new Output(
    json,
    (value) => stdout.push(value),
    (value) => stderr.push(value)
  );
  const invoke = (args: string[]) => {
    const invocation = Cli.parse(args);
    if (
      invocation.command === "help" ||
      invocation.command === "docs" ||
      invocation.command === "version"
    )
      throw new Error("Fixture requires a runtime command");
    return run(invocation, output);
  };
  return { client, storage, runtime, open, stdout, stderr, invoke };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}

function signalHandler(
  signal: "SIGINT" | "SIGTERM",
  before: readonly Function[]
) {
  const handler = process
    .listeners(signal)
    .find((candidate) => !before.includes(candidate));
  if (!handler) throw new Error("Command did not own its signal handler");
  return () => handler(signal);
}

afterEach(() => vi.restoreAllMocks());

describe("run results and failures", () => {
  it("emits one local status DTO without verification or extra storage reads", async () => {
    const { client, storage, open, stdout, stderr, invoke } = setup();
    const before = process.listeners("SIGINT");
    expect(await invoke(["auth", "status", "--json"])).toBe(0);
    expect(stdout).toEqual([JSON.stringify(signedIn) + "\n"]);
    expect(stderr).toEqual([]);
    expect(open).toHaveBeenCalledExactlyOnceWith({});
    expect(client.verify).not.toHaveBeenCalled();
    expect(storage.info).not.toHaveBeenCalled();
    expect(process.listeners("SIGINT")).toEqual(before);
  });

  it("returns exit 1 with a successful signed-out status DTO", async () => {
    const { client, stdout, stderr, invoke } = setup();
    client.status.mockResolvedValueOnce({ state: "signed-out" });
    expect(await invoke(["auth", "status", "--json"])).toBe(1);
    expect(stdout).toEqual(['{"state":"signed-out"}\n']);
    expect(stderr).toEqual([]);
  });

  it.each([
    ["confirmed", 0],
    ["not-needed", 0],
    ["unconfirmed", 1],
  ] as const)(
    "reports logout %s without retrying revocation",
    async (revocation, code) => {
      const { client, stdout, invoke } = setup();
      client.logout.mockResolvedValueOnce({ state: "signed-out", revocation });
      expect(await invoke(["auth", "logout", "--json"])).toBe(code);
      expect(JSON.parse(stdout[0]!)).toEqual({
        state: "signed-out",
        revocation,
      });
      expect(client.logout).toHaveBeenCalledOnce();
      expect(client.login).not.toHaveBeenCalled();
    }
  );

  it("maps safe auth codes without printing the exception message or causes", async () => {
    const { client, stdout, stderr, invoke } = setup();
    const failure = new AuthClient.Failure("token_rejected");
    failure.message = "synthetic-refresh-secret";
    failure.cause = { access_token: "synthetic-access-secret" };
    client.status.mockRejectedValueOnce(failure);
    expect(await invoke(["auth", "status", "--json"])).toBe(1);
    expect(JSON.parse(stdout[0]!)).toEqual({
      error: {
        code: "token_rejected",
        message:
          "Grida authentication or account access failed. Run grida auth login.",
      },
    });
    expect(stdout.join("") + stderr.join("")).not.toMatch(
      /synthetic-(?:refresh|access)-secret/
    );
    expect(client.status).toHaveBeenCalledOnce();
  });

  it("contains unknown host errors without serializing credentials, bodies or stack traces", async () => {
    const { open, stdout, stderr, invoke } = setup();
    const failure = Object.assign(new Error("synthetic-secret"), {
      responseBody: "private upstream body",
      accessToken: "synthetic-token",
    });
    open.mockRejectedValueOnce(failure);
    const before = process.listeners("SIGTERM");
    expect(await invoke(["account", "view", "--json"])).toBe(1);
    expect(stdout).toEqual([
      '{"error":{"code":"unavailable","message":"Grida could not complete this command."}}\n',
    ]);
    expect(stderr).toEqual([]);
    expect(process.listeners("SIGTERM")).toEqual(before);
  });

  it("reports known host configuration failures before starting auth", async () => {
    const { open, client, stdout, invoke } = setup();
    open.mockRejectedValueOnce(new CliHost.Failure("not_configured"));
    expect(await invoke(["auth", "status", "--json"])).toBe(1);
    expect(JSON.parse(stdout[0]!)).toEqual({
      error: {
        code: "not_configured",
        message: "Local CLI authentication is not configured.",
      },
    });
    expect(client.status).not.toHaveBeenCalled();
  });

  it("keeps safe organization choices on an ambiguity failure", async () => {
    const { client, stdout, stderr, invoke } = setup();
    const rows = [
      { id: 1, name: "studio", display_name: "Studio" },
      { id: 2, name: "lab", display_name: "Lab" },
    ];
    client.requestAccount.mockResolvedValueOnce({
      organizations: rows,
      next_cursor: null,
    });
    expect(await invoke(["account", "credits", "--json"])).toBe(1);
    expect(JSON.parse(stdout[0]!)).toEqual({
      error: {
        code: "organization_required",
        message: "Select an organization with --org <slug> or --org-id <id>.",
        choices: rows,
        choices_truncated: false,
      },
    });
    expect(stderr).toEqual([]);
    expect(client.requestAccount).toHaveBeenCalledOnce();
  });

  it("escapes account-controlled terminal text while keeping errors off stdout", async () => {
    const { client, stdout, stderr, invoke } = setup(false);
    client.verify.mockResolvedValueOnce({
      ...signedIn,
      identity: { ...identity, display_name: "\u001b[2J\nInjected" },
    });
    expect(await invoke(["account", "view"])).toBe(0);
    expect(stdout.join("")).toContain("Name: �[2J�Injected");
    expect(stdout.join("")).not.toContain("\u001b");
    expect(stderr).toEqual([]);
    stdout.length = 0;
    client.status.mockRejectedValueOnce(
      new AccountClient.Failure("selection_unavailable")
    );
    expect(await invoke(["auth", "status"])).toBe(1);
    expect(stdout).toEqual([]);
    expect(stderr.join("")).toContain("selection_unavailable");
  });
});

describe("run login host options", () => {
  it("does not install manual URL output for default system-browser login", async () => {
    const { open, client, invoke } = setup(false);
    expect(await invoke(["auth", "login"])).toBe(0);
    expect(open).toHaveBeenCalledExactlyOnceWith({
      storage: undefined,
      noBrowser: false,
    });
    expect(Object.hasOwn(open.mock.calls[0]![0]!, "onAuthorizationUrl")).toBe(
      false
    );
    expect(client.login).toHaveBeenCalledOnce();
  });

  it("installs manual URL output only for explicit no-browser login", async () => {
    const { runtime, open, invoke } = setup(false);
    const manual: string[] = [];
    vi.spyOn(process.stderr, "write").mockImplementation((value) => {
      manual.push(String(value));
      return true;
    });
    open.mockImplementationOnce(async (options) => {
      expect(options?.storage).toBe("file");
      expect(options?.noBrowser).toBe(true);
      await options?.onAuthorizationUrl?.(
        "http://127.0.0.1:55431/auth/v1/oauth/authorize?synthetic-proof"
      );
      return runtime;
    });
    expect(
      await invoke(["auth", "login", "--storage", "file", "--no-browser"])
    ).toBe(0);
    expect(manual).toEqual([
      "Open this URL in your browser:\nhttp://127.0.0.1:55431/auth/v1/oauth/authorize?synthetic-proof\n",
    ]);
  });
});

describe("run cancellation", () => {
  it("waits for pending host initialization then refuses to begin a command", async () => {
    const { runtime, open, client, stdout, invoke } = setup();
    const pending = deferred<CliHost.Runtime>();
    open.mockReturnValueOnce(pending.promise);
    const before = process.listeners("SIGINT");
    const completion = invoke(["auth", "status", "--json"]);
    let settled = false;
    void completion.then(() => {
      settled = true;
    });
    signalHandler("SIGINT", before)();
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(stdout).toEqual([]);
    pending.resolve(runtime);
    expect(await completion).toBe(1);
    expect(JSON.parse(stdout[0]!).error.code).toBe("cancelled");
    expect(client.status).not.toHaveBeenCalled();
    expect(client.logout).not.toHaveBeenCalled();
    expect(process.listeners("SIGINT")).toEqual(before);
  });

  it("lets a credential migration settle before reporting cancellation, without forced exit or logout", async () => {
    const { storage, client, stdout, invoke } = setup();
    const pending = deferred<typeof info>();
    storage.migrate.mockReturnValueOnce(pending.promise);
    const exit = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("Unexpected forced process exit");
    });
    const before = process.listeners("SIGTERM");
    const completion = invoke(["auth", "storage", "migrate", "file", "--json"]);
    let settled = false;
    void completion.then(() => {
      settled = true;
    });
    await vi.waitFor(() => expect(storage.migrate).toHaveBeenCalledOnce());
    signalHandler("SIGTERM", before)();
    await Promise.resolve();
    expect(settled).toBe(false);
    expect(stdout).toEqual([]);
    expect(exit).not.toHaveBeenCalled();
    pending.resolve(info);
    expect(await completion).toBe(1);
    expect(JSON.parse(stdout[0]!).error.code).toBe("cancelled");
    expect(client.cancelLogin).not.toHaveBeenCalled();
    expect(client.logout).not.toHaveBeenCalled();
    expect(process.listeners("SIGTERM")).toEqual(before);
  });

  it("awaits active login cancellation cleanup and contains its rejected message", async () => {
    const { client, stdout, stderr, invoke } = setup(false);
    const pending = deferred<AuthClient.Status>();
    const cleanup = deferred<void>();
    client.login.mockReturnValueOnce(pending.promise);
    client.cancelLogin.mockReturnValueOnce(cleanup.promise);
    const before = process.listeners("SIGINT");
    const completion = invoke(["auth", "login"]);
    let settled = false;
    void completion.then(() => {
      settled = true;
    });
    await vi.waitFor(() => expect(client.login).toHaveBeenCalledOnce());
    signalHandler("SIGINT", before)();
    pending.resolve(signedIn);
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(settled).toBe(false);
    expect(client.cancelLogin).toHaveBeenCalledOnce();
    cleanup.reject(new Error("synthetic-cleanup-secret"));
    expect(await completion).toBe(1);
    expect(stdout).toEqual([]);
    expect(stderr.join("")).toContain("cancelled");
    expect(stderr.join("")).not.toContain("synthetic-cleanup-secret");
    expect(client.logout).not.toHaveBeenCalled();
    expect(process.listeners("SIGINT")).toEqual(before);
  });
});
