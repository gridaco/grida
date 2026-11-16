// GRIDA-SEC-008 — host-owned ceremony: direct calls, bounded input, closed refusal.
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  ChatGptSubscriptionHost,
  type ChatGptProviderConfig,
} from "./chatgpt-host";

const REDIRECT = "http://localhost:1455/auth/callback";
const CONFIG: ChatGptProviderConfig = {
  oauth: {
    authorize_url: "https://auth.example.test/oauth/authorize",
    token_url: "https://auth.example.test/oauth/token",
    client_id: "grida-test-client",
    redirect_uris: [REDIRECT],
    scopes: ["openid", "offline_access"],
  },
  responses_url: "https://chatgpt.example.test/backend-api/agent/responses",
  originator: "grida-test",
  default_model_id: "openai/gpt-5.6-terra",
};

let root: string;
beforeEach(async () => {
  root = await fs.realpath(
    await fs.mkdtemp(path.join(os.tmpdir(), "grida-chatgpt-host-"))
  );
});
afterEach(async () => {
  await fs.rm(root, { recursive: true, force: true });
});

type Post = ConstructorParameters<typeof ChatGptSubscriptionHost>[0]["post"];

function host(post: Post = async () => null) {
  return new ChatGptSubscriptionHost({
    userDataPath: root,
    configuration: CONFIG,
    post,
  });
}

it("runs the sign-in ceremony through direct calls and persists the account", async () => {
  const post = vi.fn<Post>(async () =>
    Response.json({
      access_token: "fixture-access",
      refresh_token: "fixture-refresh",
      account_id: "fixture-account",
      expires_in: 3600,
    })
  );
  const owner = host(post);
  expect(await owner.status()).toMatchObject({ signed_in: false });
  const start = await owner.start(REDIRECT);
  expect(new URL(start.authorization_url).searchParams.get("state")).toBe(
    start.state
  );
  const status = await owner.complete({
    attempt_id: start.attempt_id,
    code: "synthetic-code",
    state: start.state,
  });
  expect(status).toMatchObject({ ready: true });
  expect(JSON.stringify(status)).not.toContain("fixture-access");
  await owner.signOut();
  expect(await owner.status()).toMatchObject({ signed_in: false });
  await owner.close();
});

it("refuses empty or oversized ceremony input before the credential owner", async () => {
  const owner = host();
  await expect(owner.start("")).rejects.toMatchObject({
    code: "chatgpt_oauth_attempt_invalid",
  });
  await expect(
    owner.complete({
      attempt_id: "a",
      code: "x".repeat(33 * 1024),
      state: "s",
    })
  ).rejects.toMatchObject({ code: "chatgpt_oauth_attempt_invalid" });
  await expect(owner.start("http://localhost:9/other")).rejects.toMatchObject({
    code: "chatgpt_oauth_attempt_invalid",
  });
});

it("admits no ceremony after close", async () => {
  const owner = host();
  await owner.close();
  await expect(owner.status()).rejects.toThrow("chatgpt_host_closed");
  await expect(owner.start(REDIRECT)).rejects.toThrow("chatgpt_host_closed");
});
