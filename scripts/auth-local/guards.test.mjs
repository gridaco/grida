// GRIDA-SEC-011 — local authority, environment, state, and redaction regressions.
import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture, guards } from "./guards.mjs";

test("fixture images admit pinned versions from Supabase registry fallbacks", () => {
  for (const auth of [
    "supabase/gotrue:v2.196.0",
    "public.ecr.aws/supabase/gotrue:v2.196.0",
    "ghcr.io/supabase/cli/auth:v2.196.0",
    "ghcr.io/supabase/gotrue:v2.196.0",
  ]) {
    for (const postgres of [
      "supabase/postgres:15.8.1.085",
      "public.ecr.aws/supabase/postgres:15.8.1.085",
      "ghcr.io/supabase/postgres:15.8.1.085",
    ]) {
      guards.images({ auth, postgres });
    }
  }
});

test("fixture image checks reject other publishers and versions", () => {
  for (const auth of [
    "ghcr.io/other/gotrue:v2.196.0",
    "ghcr.io/supabase/gotrue:v2.195.0",
    "ghcr.io/supabase/gotrue:latest",
    "ghcr.io/supabase/gotrue:v2.196.0-extra",
    "evil.example/ghcr.io/supabase/gotrue:v2.196.0",
    "ghcr.io/supabase/gotrue:v2.196.0@sha256:unreviewed",
  ]) {
    assert.throws(() =>
      guards.images({ auth, postgres: "supabase/postgres:15.8.1.085" })
    );
  }
  for (const postgres of [
    "other/postgres:15.8.1.085",
    "supabase/postgres:17.6.1.054",
    "supabase/postgres:latest",
    "ghcr.io/other/postgres:15.8.1.085",
    "ghcr.io/supabase/postgres:17.6.1.054",
    "ghcr.io/supabase/postgres:latest",
  ]) {
    assert.throws(() =>
      guards.images({ auth: "supabase/gotrue:v2.196.0", postgres })
    );
  }
});

test("a fresh Auth server omits the empty client collection", () => {
  assert.deepEqual(guards.oauthClients({}), []);
  const client = {
    client_id: "fixture",
    client_name: "Grida CLI auth fixture",
  };
  assert.deepEqual(guards.oauthClients({ clients: [client] }), [client]);
  for (const value of [null, [], { clients: null }, { clients: {} }])
    assert.throws(() => guards.oauthClients(value));
});

test("fixed origin rejects hosted, shared-stack, credentials, and normalized remote redirects", () => {
  assert.equal(
    guards.localUrl(`${fixture.apiUrl}/auth/v1/health`).hostname,
    "127.0.0.1"
  );
  for (const value of [
    "https://project.supabase.co/auth/v1/token",
    "http://127.0.0.1:54321/auth/v1/token",
    "http://localhost:55431/auth/v1/token",
    "http://secret@127.0.0.1:55431/auth/v1/token",
    "http://127.0.0.1:55431@evil.example/token",
    "http://127.0.0.1:55431/auth/v1/token#secret",
  ])
    assert.throws(() => guards.localUrl(value));
});

test("Docker requires a filesystem socket, never a context or remote host", () => {
  assert.equal(
    guards.socketPath("/var/run/docker.sock"),
    "/var/run/docker.sock"
  );
  for (const value of [
    undefined,
    "docker.sock",
    "tcp://127.0.0.1:2375",
    "ssh://server",
    "unix:///var/run/docker.sock",
  ])
    assert.throws(() => guards.socketPath(value));
});

test("copy allowlist excludes linked metadata, private env, and path traversal", () => {
  assert.equal(
    guards.sourcePath("supabase/migrations/20260101000000_test.sql"),
    "supabase/migrations/20260101000000_test.sql"
  );
  assert.equal(guards.sourcePath("supabase/seed.sql"), "supabase/seed.sql");
  for (const value of [
    "supabase/.env",
    "supabase/.temp/project-ref",
    "supabase/migrations/../seed.sql",
    "supabase/migrations/.hidden.sql",
    "supabase/config.toml",
  ])
    assert.throws(() => guards.sourcePath(value));
});

test("subprocess environment cannot inherit hosted credentials, remote Docker, or preload hooks", () => {
  const before = { ...process.env };
  process.env.SUPABASE_ACCESS_TOKEN = "must-not-inherit";
  process.env.DOCKER_HOST = "ssh://production";
  process.env.NODE_OPTIONS = "--require=/untrusted/preload.cjs";
  try {
    const env = guards.childEnv({
      root: "/tmp/fixture",
      home: "/tmp/fixture/home",
      supabaseBin: "/tmp/tools/supabase",
      dockerSocket: "/var/run/docker.sock",
    });
    assert.equal(env.DOCKER_HOST, "unix:///var/run/docker.sock");
    assert.equal(env.HOME, "/tmp/fixture/home");
    assert.equal(env.SUPABASE_ACCESS_TOKEN, undefined);
    assert.equal(env.NODE_OPTIONS, undefined);
    assert.equal(env.DOCKER_CONTEXT, undefined);
    assert.equal(env.HTTPS_PROXY, undefined);
  } finally {
    for (const key of [
      "SUPABASE_ACCESS_TOKEN",
      "DOCKER_HOST",
      "NODE_OPTIONS",
    ]) {
      if (before[key] === undefined) delete process.env[key];
      else process.env[key] = before[key];
    }
  }
});

test("state refuses the shared project and paths outside its owned fixture", () => {
  const state = {
    version: 1,
    projectId: fixture.projectId,
    cliVersion: fixture.cliVersion,
    authVersion: fixture.authVersion,
    repoRoot: "/repo",
    root: "/tmp/grida-auth-test-abc123",
    workdir: "/tmp/grida-auth-test-abc123/workdir",
    home: "/tmp/grida-auth-test-abc123/home",
    id: "00000000-0000-0000-0000-000000000000",
    supabaseBin: "/tools/supabase",
    supabaseGoBin: "/tools/supabase-go",
    dockerSocket: "/var/run/docker.sock",
  };
  const statePath = `${state.root}/fixture.json`;
  assert.equal(guards.state(state, statePath, "/repo"), state);
  for (const patch of [
    { projectId: "sb" },
    { workdir: "/repo" },
    { root: "/repo" },
    { cliVersion: "2.72.7" },
    { supabaseGoBin: "/other/supabase-go" },
    { dockerSocket: "tcp://host:2375" },
  ])
    assert.throws(() =>
      guards.state({ ...state, ...patch }, statePath, "/repo")
    );
});

test("logs redact Supabase tokens, database URLs, and credential fields", () => {
  const output = guards.redact(
    'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiJ1c2VyIn0.signature sb_secret_abcdef sb_publishable_abc postgres://postgres:password@127.0.0.1:55432/postgres\nANON_KEY="private"\n"SERVICE_ROLE_KEY": "another-private"'
  );
  for (const secret of [
    "eyJhbGci",
    "sb_secret_abcdef",
    "sb_publishable_abc",
    "postgres:password",
    "private",
  ])
    assert(!output.includes(secret));
});
