/** GRIDA-SEC-016 — native dialog sessions have bounded names and cleanup gates. */
import { expect, it, vi } from "vitest";
import type { Session } from "electron";
const mock = vi.hoisted(() => ({
  fromPartition:
    vi.fn<(partition: string, options: { cache: boolean }) => unknown>(),
  clear: vi.fn<() => Promise<void>>(async () => {}),
  before:
    vi.fn<
      (
        filter: { urls: string[] },
        listener: (
          details: { url: string },
          callback: (response: { cancel: boolean }) => void
        ) => void
      ) => void
    >(),
  protocol:
    vi.fn<(scheme: string, handler: (request: Request) => Response) => void>(),
}));
vi.mock("electron", () => ({
  session: {
    fromPartition: mock.fromPartition.mockImplementation(() => ({
      setPermissionRequestHandler:
        vi.fn<Session["setPermissionRequestHandler"]>(),
      setPermissionCheckHandler: vi.fn<Session["setPermissionCheckHandler"]>(),
      clearStorageData: mock.clear,
      protocol: { handle: mock.protocol },
      webRequest: { onBeforeRequest: mock.before },
    })),
  },
}));
import { BrowserDialogSessions } from "./browser-dialog-sessions";

it("bounds concurrent native challenges and reuses their partition names after cleanup", async () => {
  const leases = Array.from(
    { length: 8 },
    () => BrowserDialogSessions.acquire("auth")!
  );
  expect(leases.every(Boolean)).toBe(true);
  expect(BrowserDialogSessions.acquire("auth")).toBeNull();
  expect(
    new Set(mock.fromPartition.mock.calls.map(([name]) => name)).size
  ).toBe(8);
  leases[0].release();
  expect(BrowserDialogSessions.acquire("auth")).toBeNull();
  await Promise.resolve();
  const reused = BrowserDialogSessions.acquire("auth")!;
  expect(mock.fromPartition).toHaveBeenCalledTimes(8);
  expect(mock.fromPartition.mock.calls.at(-1)![1]).toEqual({ cache: false });
  leases.slice(1).forEach((lease) => lease.release());
  reused.release();
  await Promise.resolve();
});

it("replaces request handlers before cleanup and never reuses failed-cleanup slots", async () => {
  mock.clear.mockRejectedValueOnce(new Error("cleanup failed"));
  const first = BrowserDialogSessions.acquire("find")!;
  const name = mock.fromPartition.mock.calls.at(-1)![0];
  first.release();
  const handler = mock.before.mock.calls.at(-1)![1];
  const done = vi.fn<(response: { cancel: boolean }) => void>();
  handler({ url: "https://website.test" }, done);
  expect(done).toHaveBeenCalledWith({ cancel: true });
  await Promise.resolve();
  const second = BrowserDialogSessions.acquire("find")!;
  expect(mock.fromPartition.mock.calls.at(-1)![0]).not.toBe(name);
  first.release();
  second.release();
  await Promise.resolve();
});

it("keeps a local responder while retiring or reusing a session without retaining old routes", async () => {
  const lease = BrowserDialogSessions.acquire("find")!;
  const responder = mock.protocol.mock.calls.at(-1)![1] as (
    request: Request
  ) => Response;
  lease.answerPost("https://browser-find.invalid/old", () => true);
  const request = (token: string) =>
    new Request(`https://browser-find.invalid/${token}`, { method: "POST" });
  expect(responder(request("old")).status).toBe(204);
  lease.release();
  expect(responder(request("old")).status).toBe(403);
  await Promise.resolve();
  const reused = BrowserDialogSessions.acquire("find")!;
  expect(reused.session).toBe(lease.session);
  reused.answerPost("https://browser-find.invalid/new", () => true);
  expect(responder(request("old")).status).toBe(403);
  expect(responder(request("new")).status).toBe(204);
  reused.release();
  await Promise.resolve();
});
