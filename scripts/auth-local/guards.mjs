// GRIDA-SEC-011 — fixed fixture authority and constructed child environments.
import assert from "node:assert/strict";
import path from "node:path";

export const fixture = Object.freeze({
  version: 1,
  projectId: "grida_auth_test",
  cliVersion: "2.116.0",
  authVersion: "2.196.0",
  apiUrl: "http://127.0.0.1:55431",
  editorOrigin: "http://127.0.0.1:3041",
  issuer: "http://127.0.0.1:55431/auth/v1",
  redirectUris: [
    "http://127.0.0.1:55435/callback",
    "http://127.0.0.1:55436/callback",
  ],
  ports: [
    3041, 55430, 55431, 55432, 55433, 55434, 55435, 55436, 55437, 55438, 55439,
  ],
});

export const guards = {
  images({ auth, postgres }) {
    // The pinned CLI can fall back between Supabase-owned image registries.
    // Admit exact repositories; retain the Auth release and PostgreSQL major.
    // https://github.com/supabase/cli/blob/v2.116.0/apps/cli-go/internal/utils/docker.go
    assert.match(
      auth,
      /^(?:supabase\/gotrue|public\.ecr\.aws\/supabase\/gotrue|ghcr\.io\/supabase\/(?:gotrue|cli\/auth)):v2\.196\.0$/
    );
    assert.match(
      postgres,
      /^(?:supabase\/postgres|public\.ecr\.aws\/supabase\/postgres|ghcr\.io\/supabase\/postgres):15\./
    );
  },

  localUrl(value, origin = fixture.apiUrl) {
    const url = new URL(value);
    assert.equal(
      url.origin,
      origin,
      "Only the fixed fixture origin is allowed"
    );
    assert.equal(url.username, "", "URL credentials are forbidden");
    assert.equal(url.password, "", "URL credentials are forbidden");
    assert.equal(url.hash, "", "URL fragments are forbidden");
    return url;
  },

  socketPath(value) {
    assert.equal(
      typeof value,
      "string",
      "An explicit local Docker socket is required"
    );
    assert(
      path.isAbsolute(value),
      "Docker socket must be an absolute filesystem path"
    );
    assert(!value.includes("://"), "Remote Docker endpoints are forbidden");
    return path.resolve(value);
  },

  sourcePath(value) {
    assert(
      value === "supabase/seed.sql" ||
        /^supabase\/migrations\/[^/]+\.sql$/.test(value),
      "Only repository migrations and the seed may be copied"
    );
    assert(
      !value.split("/").some((part) => part.startsWith(".")),
      "Hidden paths are forbidden"
    );
    return value;
  },

  oauthClients(value) {
    assert(
      value && typeof value === "object" && !Array.isArray(value),
      "Invalid OAuth client list response"
    );
    // Auth 2.196.0 marks clients as omitempty: an empty collection is {}.
    const clients = value.clients === undefined ? [] : value.clients;
    assert(Array.isArray(clients), "Invalid OAuth client list response");
    return clients;
  },

  state(value, statePath, repoRoot) {
    assert.equal(value.version, fixture.version, "Unsupported fixture state");
    assert.equal(value.projectId, fixture.projectId, "Unexpected project ID");
    assert.equal(
      value.cliVersion,
      fixture.cliVersion,
      "Unexpected CLI version"
    );
    assert.equal(
      value.authVersion,
      fixture.authVersion,
      "Unexpected Auth version"
    );
    assert.equal(
      value.repoRoot,
      repoRoot,
      "Fixture belongs to another checkout"
    );
    assert.match(path.basename(value.root), /^grida-auth-test-[A-Za-z0-9]+$/);
    assert.equal(
      path.resolve(statePath),
      path.join(value.root, "fixture.json")
    );
    assert.equal(value.workdir, path.join(value.root, "workdir"));
    assert.equal(value.home, path.join(value.root, "home"));
    assert.match(value.id, /^[0-9a-f-]{36}$/);
    assert(
      path.isAbsolute(value.supabaseBin),
      "CLI executable must be absolute"
    );
    assert.equal(
      value.supabaseGoBin,
      path.join(path.dirname(value.supabaseBin), "supabase-go"),
      "CLI sidecar must belong to the same release bundle"
    );
    this.socketPath(value.dockerSocket);
    return value;
  },

  childEnv(state) {
    // Construct from scratch: no tokens, project refs, proxies, Docker contexts,
    // Node preload hooks, or credentials from the invoking shell survive.
    return {
      PATH: [
        path.dirname(state.supabaseBin),
        "/usr/local/bin",
        "/usr/bin",
        "/bin",
      ].join(path.delimiter),
      HOME: state.home,
      XDG_CONFIG_HOME: path.join(state.home, ".config"),
      XDG_CACHE_HOME: path.join(state.home, ".cache"),
      DOCKER_CONFIG: path.join(state.home, ".docker"),
      DOCKER_HOST: `unix://${this.socketPath(state.dockerSocket)}`,
      TMPDIR: path.join(state.root, "tmp"),
      NO_PROXY: "127.0.0.1,localhost,::1",
      no_proxy: "127.0.0.1,localhost,::1",
      DO_NOT_TRACK: "1",
      CI: "true",
      TERM: "dumb",
    };
  },

  redact(value) {
    return value
      .replace(
        /\beyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\b/g,
        "[redacted JWT]"
      )
      .replace(
        /\bsb_(?:secret|publishable)_[A-Za-z0-9_-]+\b/g,
        "[redacted key]"
      )
      .replace(/postgres(?:ql)?:\/\/[^\s"']+/g, "[redacted database URL]")
      .replace(
        /((?:[A-Z_]*(?:KEY|TOKEN|SECRET|PASSWORD))\s*["']?\s*[:=]\s*)[^\n]+/gi,
        "$1[redacted]"
      );
  },
};
