import { EventEmitter } from "node:events";
import { Readable } from "node:stream";
import { beforeEach, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({
  request:
    vi.fn<
      (options: Electron.ClientRequestConstructorOptions) => EventEmitter
    >(),
}));
vi.mock("electron", () => ({ net: mock }));

import { requestDesktopCompatibility } from "./desktop-compatibility-request";

const url = "https://grida.co/desktop/compatibility";

function incomingRequest() {
  const request = Object.assign(new EventEmitter(), {
    end: vi.fn<() => void>(),
    abort: vi.fn<() => void>(),
  });
  mock.request.mockReturnValueOnce(request);
  return request;
}

beforeEach(() => mock.request.mockReset());

it("exposes a legacy redirect without following it or sending cookies", async () => {
  const request = incomingRequest();
  const result = requestDesktopCompatibility(url, new AbortController().signal);
  const location = "https://grida.co/sign-in?next=/desktop";
  request.emit("redirect", 307, "GET", location);

  expect(mock.request).toHaveBeenCalledExactlyOnceWith({
    url,
    credentials: "omit",
    cache: "no-store",
    redirect: "manual",
    headers: { Accept: "application/json" },
  });
  const response = await result;
  expect(response.status).toBe(307);
  expect(response.headers.get("location")).toBe(location);
  expect(request.abort).toHaveBeenCalledOnce();
});

it("returns a successful Chromium response as a readable body", async () => {
  const request = incomingRequest();
  const result = requestDesktopCompatibility(url, new AbortController().signal);
  const incoming = Object.assign(
    Readable.from([Buffer.from('{"desktopVersion":"0.7.0"}')]),
    { statusCode: 200, headers: { "content-type": "application/json" } }
  );
  request.emit("response", incoming);

  const response = await result;
  expect(response.headers.get("content-type")).toBe("application/json");
  await expect(response.json()).resolves.toEqual({ desktopVersion: "0.7.0" });
});

it("aborts a stalled request when the handshake deadline expires", async () => {
  const request = incomingRequest();
  const controller = new AbortController();
  const result = requestDesktopCompatibility(url, controller.signal);
  controller.abort();

  await expect(result).rejects.toThrow(/aborted/i);
  expect(request.abort).toHaveBeenCalledOnce();
});

it("rejects an oversized JSON response across chunks", async () => {
  const request = incomingRequest();
  const result = requestDesktopCompatibility(url, new AbortController().signal);
  const incoming = Object.assign(
    Readable.from([Buffer.alloc(4096), Buffer.alloc(1)]),
    { statusCode: 200, headers: { "content-type": "application/json" } }
  );
  request.emit("response", incoming);

  await expect(result).rejects.toThrow(/too large/i);
  expect(request.abort).toHaveBeenCalledOnce();
});
