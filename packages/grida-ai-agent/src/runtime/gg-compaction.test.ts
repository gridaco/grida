// GRIDA-SEC-006 — auxiliary hosted work uses live GG limits and the original provider.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  AuthStore,
  SecretsStore,
  WorkspaceRegistry,
} from "@grida/daemon/server";
import { catalog, TIER_MODEL_IDS } from "@grida/ai/catalogue";
import { ggDiscoveryFixture } from "../providers/gg-discovery.fixture";
import { GridaGatewaySessionStore } from "../providers/gg-session";
import { AGENT_SESSION_AGENT } from "../protocol/run";
import { openSessionsDb } from "../session/db";
import { SessionsStore } from "../session/store";
import { clampSummarizerCap, estimateTokens } from "../session/compaction";
import { AgentRuntime } from ".";

let baseDir: string;
let store: SessionsStore;
let runtime: AgentRuntime | undefined;
beforeEach(async () => {
  baseDir = await fs.mkdtemp(path.join(os.tmpdir(), "grida-gg-compaction-"));
  store = new SessionsStore(openSessionsDb({ user_data_path: baseDir }));
});
afterEach(async () => {
  runtime?.dispose();
  runtime = undefined;
  store.close();
  await fs.rm(baseDir, { recursive: true, force: true });
});

describe("manual GG compaction uses the served summarizer's current window", () => {
  it("chunks history against live nano limits rather than the pinned factual window", async () => {
    const gg = new GridaGatewaySessionStore();
    gg.set({
      access_token: "synthetic-scoped-token",
      expires_at: Date.now() + 900_000,
    });
    const gg_catalog = ggDiscoveryFixture();
    const histories: string[] = [];
    const models: string[] = [];
    runtime = new AgentRuntime({
      secrets: new SecretsStore(new AuthStore(baseDir)),
      gg,
      gg_base_url: "https://grida.test",
      gg_catalog,
      sessions_store: store,
      workspace_registry: new WorkspaceRegistry(baseDir),
      compaction: {
        summarize: async ({ history, model_factory }) => {
          histories.push(history);
          models.push((model_factory("nano") as { modelId: string }).modelId);
          return "Short retained summary.";
        },
      },
    });
    const session = await store.create({
      agent: AGENT_SESSION_AGENT,
      model: { provider_id: "gg", tier: "pro", model_id: TIER_MODEL_IDS.pro },
    });
    for (let index = 0; index < 12; index++) {
      const message = await store.appendMessage(session.id, {
        role: index % 2 === 0 ? "user" : "assistant",
      });
      await store.upsertPart(message.id, {
        index: 0,
        type: "text",
        data: { type: "text", text: `turn ${index} ` + "word ".repeat(400) },
      });
    }
    expect(gg_catalog.view()).toBeNull();
    const response = await runtime.compact(session.id);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({
      compacted: true,
      strategy: "chunked",
    });
    const currentNano = gg_catalog.model(TIER_MODEL_IDS.nano)!;
    const liveCap = clampSummarizerCap(currentNano.limits.context_tokens);
    expect(liveCap).toBeLessThan(catalog.text.byTier.nano.contextWindow);
    expect(histories.length).toBeGreaterThan(1);
    expect(
      histories.every((history) => estimateTokens(history) <= liveCap)
    ).toBe(true);
    expect(models.every((id) => id === TIER_MODEL_IDS.nano)).toBe(true);
  });
});
