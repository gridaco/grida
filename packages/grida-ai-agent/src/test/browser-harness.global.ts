/**
 * Global setup for the browser-engine system harness
 * (`vitest.browser.config.ts`). Runs on the NODE side: boots two real
 * `AgentHost` servers on loopback and hands the browser-context tests
 * their coordinates via vitest's provide/inject channel.
 *
 *   - the HARNESS host allowlists the pinned vitest page origin — the
 *     "origin-bridged" browser path under test (WG daemon spec
 *     §the-browser-exception, path 2);
 *   - the FOREIGN host allowlists an unrelated origin — the negative:
 *     the browser itself must refuse the cross-origin read (CORS), which
 *     no Node-side test can prove.
 */
import crypto from "node:crypto";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { TestProject } from "vitest/node";
import { AgentHost } from "../agent-host";
import { AgentTransport } from "../transport";
import { BROWSER_HARNESS_ORIGINS } from "./browser-harness.origins";

declare module "vitest" {
  export interface ProvidedContext {
    /** Base URL of the harness AgentHost (page origin allowlisted). */
    agent_url: string;
    /** The harness host's credential. */
    agent_password: string;
    /** Base URL of the foreign AgentHost (page origin NOT allowlisted). */
    agent_foreign_url: string;
  }
}

export default async function setup(project: TestProject) {
  const password = crypto.randomBytes(32).toString("base64url");
  const harnessDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "grida-agent-browser-harness-")
  );
  const foreignDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "grida-agent-browser-foreign-")
  );

  const harness = new AgentHost({
    password,
    user_data_path: harnessDir,
    scratch_base: `${harnessDir}-scratch`,
    http_access: {
      allowed_origins: BROWSER_HARNESS_ORIGINS,
      // The vitest page paths are an implementation detail of the runner;
      // the origin pin is the boundary under test here.
      allowed_referer_paths: ["/"],
    },
  });
  const foreign = new AgentHost({
    password,
    user_data_path: foreignDir,
    scratch_base: `${foreignDir}-scratch`,
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
    // Also reclaim the per-host scratch bases (never created today since these
    // hosts run no turns, but keep teardown leak-free if that changes).
    await fs.rm(`${harnessDir}-scratch`, { recursive: true, force: true });
    await fs.rm(`${foreignDir}-scratch`, { recursive: true, force: true });
  };

  // Partial startup (e.g. the second host failing to bind) must not
  // leak the first host or the temp dirs — `stop()` and rm are no-ops
  // for resources that never came up.
  try {
    await harness.start();
    await foreign.start();

    project.provide("agent_url", AgentTransport.baseUrl(harness.port));
    project.provide("agent_password", password);
    project.provide("agent_foreign_url", AgentTransport.baseUrl(foreign.port));
  } catch (err) {
    await cleanup().catch(() => {});
    throw err;
  }

  return cleanup;
}
