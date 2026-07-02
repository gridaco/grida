/**
 * Global setup for the browser-engine system harness
 * (`vitest.browser.config.ts`). Runs on the NODE side: boots two real
 * `DaemonServer`s on loopback and hands the browser-context tests
 * their coordinates via vitest's provide/inject channel.
 *
 *   - the HARNESS daemon allowlists the pinned vitest page origin — the
 *     "origin-bridged" browser path under test (WG daemon spec
 *     §the-browser-exception, path 2);
 *   - the FOREIGN daemon allowlists an unrelated origin — the negative:
 *     the browser itself must refuse the cross-origin read (CORS), which
 *     no Node-side test can prove.
 *
 * Both daemons mount the STUB TENANT (see `browser-harness.origins.ts`):
 * one POST echo route + one GET SSE route declared via
 * `sse_query_token_paths`, so the query-token carriage rule
 * (GRIDA-SEC-004) is exercised through the real tenant seam.
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { TestProject } from "vitest/node";
import { DaemonServer } from "../daemon-server";
import type { DaemonTenant } from "../http/server";
import { DaemonTransport } from "../transport";
import {
  BROWSER_HARNESS_ORIGINS,
  STUB_ECHO_PATH,
  STUB_SSE_EVENT,
  STUB_STREAM_PATH,
} from "./browser-harness.origins";

declare module "vitest" {
  export interface ProvidedContext {
    /** Base URL of the harness daemon (page origin allowlisted). */
    daemon_url: string;
    /** The harness daemon's credential. */
    daemon_password: string;
    /** Base URL of the foreign daemon (page origin NOT allowlisted). */
    daemon_foreign_url: string;
  }
}

/** Minimal tenant: an authenticated mutating route + a long-lived SSE
 *  stream route that opts into `auth_token` query carriage. */
const stubTenant: DaemonTenant = {
  sse_query_token_paths: [
    new RegExp(`^${STUB_STREAM_PATH}/[^/]+$`.replace(/\//g, "\\/")),
  ],
  register: (app) => {
    app.post(STUB_ECHO_PATH, (c) => c.json({ ok: true }));
    app.get(`${STUB_STREAM_PATH}/:id`, (c) => {
      const id = c.req.param("id");
      const body = new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(
            new TextEncoder().encode(
              `event: ${STUB_SSE_EVENT}\ndata: ${JSON.stringify({
                id,
                state: "idle",
              })}\n\n`
            )
          );
          // Deliberately left open: EventSource clients stay attached
          // until they close; the socket teardown ends the stream.
        },
      });
      return new Response(body, {
        headers: {
          "content-type": "text/event-stream",
          "cache-control": "no-cache",
        },
      });
    });
    return { capabilities: {} };
  },
};

export default async function setup(project: TestProject) {
  const password = crypto.randomBytes(32).toString("base64url");
  const harnessDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "grida-daemon-browser-harness-")
  );
  const foreignDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "grida-daemon-browser-foreign-")
  );

  const harness = new DaemonServer({
    password,
    user_data_path: harnessDir,
    tenants: [stubTenant],
    http_access: {
      allowed_origins: BROWSER_HARNESS_ORIGINS,
      // The vitest page paths are an implementation detail of the runner;
      // the origin pin is the boundary under test here.
      allowed_referer_paths: ["/"],
    },
  });
  const foreign = new DaemonServer({
    password,
    user_data_path: foreignDir,
    tenants: [stubTenant],
    http_access: {
      allowed_origins: ["https://allowlisted.example"],
      allowed_referer_paths: ["/"],
    },
  });
  const cleanup = async () => {
    await harness.stop();
    await foreign.stop();
    await fs.rm(harnessDir, { recursive: true, force: true });
    await fs.rm(foreignDir, { recursive: true, force: true });
  };

  // Partial startup (e.g. the second daemon failing to bind) must not
  // leak the first daemon or the temp dirs — `stop()` and rm are no-ops
  // for resources that never came up.
  try {
    await harness.start();
    await foreign.start();

    project.provide("daemon_url", DaemonTransport.baseUrl(harness.port));
    project.provide("daemon_password", password);
    project.provide(
      "daemon_foreign_url",
      DaemonTransport.baseUrl(foreign.port)
    );
  } catch (err) {
    await cleanup().catch(() => {});
    throw err;
  }

  return cleanup;
}
