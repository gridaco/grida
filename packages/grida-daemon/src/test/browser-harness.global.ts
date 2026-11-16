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
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { TestProject } from "vitest/node";
import { DaemonServer } from "../daemon-server";
import { DaemonTransport } from "../transport";
import { BROWSER_HARNESS_ORIGINS } from "./browser-harness.origins";

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
