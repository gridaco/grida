/* eslint-disable jest/no-standalone-expect */
/**
 * Contract pins — streamed media route `GET /workspaces/file` (#924,
 * GRIDA-SEC-004).
 *
 * The desktop media viewer streams workspace images/videos through this route
 * (proxied by the `grida-workspace://` privileged scheme) instead of inlining
 * base64. What must hold: it streams the right bytes, honors HTTP Range (so
 * video seeking works), sets a server-side Content-Type, enforces the same
 * containment as every other read, and — unlike the buffered base64 reader — is
 * NOT subject to the 1 MiB cap.
 *
 * Routes are registered onto a bare Hono app and driven via `app.request()`;
 * the global Auth/Origin/Referer middleware (added in `http/server.ts`) is out
 * of scope here — this pins the route's own behavior.
 */
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import fs from "node:fs/promises";
import path from "node:path";
import { Hono } from "hono";
import {
  createAgentHostFixture,
  type AgentHostFixture,
} from "../../test/agent-host-fixture";
import { workspaceFs } from "../../workspaces/fs";
import { registerWorkspacesRoutes } from "./workspaces";

const symlinkIt = process.platform === "win32" ? it.skip : it;

describe("GET /workspaces/file (#924)", () => {
  let fixture: AgentHostFixture;
  let app: Hono;

  beforeEach(async () => {
    fixture = await createAgentHostFixture("grida-agent-file-route-");
    app = new Hono();
    registerWorkspacesRoutes(app, fixture.registry);
  });
  afterEach(async () => {
    await fixture.cleanup();
  });

  const url = (relPath: string) =>
    `/workspaces/file?workspace_id=${encodeURIComponent(
      fixture.workspace.id
    )}&rel_path=${encodeURIComponent(relPath)}`;

  it("streams the full file as 200 with Content-Type + Accept-Ranges", async () => {
    const bytes = Buffer.from("PNGDATA".repeat(10));
    await fixture.write_workspace_file("pic.png", bytes.toString("binary"));

    const res = await app.request(url("pic.png"));

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("accept-ranges")).toBe("bytes");
    expect(res.headers.get("content-length")).toBe(String(bytes.length));
    const body = Buffer.from(await res.arrayBuffer());
    expect(body.equals(bytes)).toBe(true);
  });

  it("honors a byte Range with 206 + Content-Range (video seeking)", async () => {
    const bytes = Buffer.from("0123456789ABCDEF");
    await fixture.write_workspace_file("clip.mp4", bytes.toString("binary"));

    const res = await app.request(url("clip.mp4"), {
      headers: { range: "bytes=4-9" },
    });

    expect(res.status).toBe(206);
    expect(res.headers.get("content-type")).toBe("video/mp4");
    expect(res.headers.get("content-range")).toBe(`bytes 4-9/${bytes.length}`);
    expect(res.headers.get("content-length")).toBe("6");
    const body = Buffer.from(await res.arrayBuffer());
    expect(body.toString("latin1")).toBe("456789");
  });

  it("clamps an open-ended Range to the last byte", async () => {
    const bytes = Buffer.from("0123456789");
    await fixture.write_workspace_file("a.bin", bytes.toString("binary"));

    const res = await app.request(url("a.bin"), {
      headers: { range: "bytes=7-" },
    });

    expect(res.status).toBe(206);
    expect(res.headers.get("content-range")).toBe("bytes 7-9/10");
    expect(Buffer.from(await res.arrayBuffer()).toString("latin1")).toBe("789");
  });

  it("rejects an unsatisfiable Range with 416", async () => {
    await fixture.write_workspace_file("a.bin", "0123456789");

    const res = await app.request(url("a.bin"), {
      headers: { range: "bytes=999-1000" },
    });

    expect(res.status).toBe(416);
    expect(res.headers.get("content-range")).toBe("bytes */10");
  });

  it("serves a zero-byte file as 200 with an empty body", async () => {
    // The route has a dedicated size===0 branch (an empty stream would try to
    // read 1 byte of a 0-byte file) — pin it.
    await fixture.write_workspace_file("empty.png", "");

    const res = await app.request(url("empty.png"));

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("content-length")).toBe("0");
    expect((await res.arrayBuffer()).byteLength).toBe(0);
  });

  it("infers application/octet-stream for unknown extensions", async () => {
    await fixture.write_workspace_file("data.xyz", "abc");

    const res = await app.request(url("data.xyz"));

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/octet-stream");
  });

  it("enforces containment — a path escaping the workspace is 403", async () => {
    const res = await app.request(url("../escape.txt"));
    expect(res.status).toBe(403);
  });

  symlinkIt(
    "rejects a symlink whose target escapes the workspace",
    async () => {
      // resolveInside realpaths the link before opening — an escaping target is a
      // containment failure, never served.
      const outside = path.join(fixture.base_dir, "secret.txt");
      await fs.writeFile(outside, "top secret");
      await fs.symlink(outside, path.join(fixture.workspace_root, "leak.png"));

      const res = await app.request(url("leak.png"));
      expect(res.status).toBe(403);
    }
  );

  symlinkIt(
    "streams through a symlink that stays inside the workspace",
    async () => {
      // The realpath'd target is a regular file, so the O_NOFOLLOW open of it
      // succeeds — the hardening rejects swapped links, not legitimate ones.
      await fixture.write_workspace_file("real/pic.png", "PNGBYTES");
      await fs.symlink(
        path.join(fixture.workspace_root, "real/pic.png"),
        path.join(fixture.workspace_root, "alias.png")
      );

      const res = await app.request(url("alias.png"));
      expect(res.status).toBe(200);
      expect(await res.text()).toBe("PNGBYTES");
    }
  );

  it("is NOT subject to the 1 MiB base64 cap — streams a large file", async () => {
    // A file well past MAX_FILE_BYTES (the buffered readers' cap) streams fine,
    // because the streaming path has constant memory. This is the bug #924
    // fixes: the base64 reader rejected this with file-too-large.
    const big = Buffer.alloc(workspaceFs.MAX_FILE_BYTES + 4096, 0x61); // 'a'
    await fixture.write_workspace_file("big.png", big.toString("binary"));

    const res = await app.request(url("big.png"));

    expect(res.status).toBe(200);
    expect(res.headers.get("content-length")).toBe(String(big.length));
    expect((await res.arrayBuffer()).byteLength).toBe(big.length);
  });

  it("requires workspace_id and rel_path", async () => {
    const res = await app.request("/workspaces/file?workspace_id=x");
    expect(res.status).toBe(400);
  });

  it("404s an unknown workspace id", async () => {
    const res = await app.request(
      "/workspaces/file?workspace_id=deadbeef&rel_path=a.png"
    );
    expect(res.status).toBe(404);
  });
});
