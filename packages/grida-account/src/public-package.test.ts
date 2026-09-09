import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { build } from "tsdown";
import { execFile } from "node:child_process";
import {
  chmod,
  cp,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  writeFile,
} from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execute = promisify(execFile);
const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
let owned: string | undefined;

describe("copied public AccountClient", () => {
  beforeAll(async () => {
    owned = await mkdtemp(join(tmpdir(), "grida-account-public-"));
    await chmod(owned, 0o700);
    const exported = join(owned, "node_modules/@grida/account");
    const auth = join(owned, "node_modules/@grida/auth");
    await mkdir(exported, { recursive: true, mode: 0o700 });
    await mkdir(auth, { recursive: true, mode: 0o700 });
    // Build current sources into the private consumer; never rely on stale dist.
    await build({
      cwd: packageRoot,
      config: join(packageRoot, "tsdown.config.mts"),
      outDir: join(exported, "dist"),
      logLevel: "silent",
    });
    await cp(join(packageRoot, "package.json"), join(exported, "package.json"));
    // Consume only the auth producer's shipped package exports and declarations.
    const producer = resolve(dirname(require.resolve("@grida/auth")), "..");
    await cp(join(producer, "package.json"), join(auth, "package.json"));
    await cp(join(producer, "dist"), join(auth, "dist"), { recursive: true });
    for (const format of ["mjs", "cjs"]) {
      const imports =
        format === "mjs"
          ? `import assert from 'node:assert/strict';\nimport { AccountClient } from '@grida/account';\nimport { AuthClient } from '@grida/auth';`
          : `const assert = require('node:assert/strict');\nconst { AccountClient } = require('@grida/account');\nconst { AuthClient } = require('@grida/auth');`;
      await writeFile(
        join(owned, `probe.${format}`),
        `${imports}
(async () => {
  const calls = [];
  const row = {id: 2, name: 'studio', display_name: 'Studio'};
  const auth = {async requestAccount(operation, input) {
    calls.push([operation, input ?? null]);
    if (operation === 'organizations.list') return {organizations: [row], next_cursor: null};
    return {organization: row, account_present: true, state: 'cached', source: 'cache', currency: 'USD', balance_cents: 0, cache_updated_at: '2026-09-07T00:00:00Z', billing_gate: {allowed: false, reason: 'below_floor'}};
  }};
  const account = new AccountClient(auth);
  const result = await account.credits({name: 'studio'});
  assert.equal(result.balance_cents, 0);
  assert.equal(result.organization.id, 2);
  assert.deepEqual(calls, [['organizations.list', null], ['credits.read', {organization_id: 2}]]);
  const rejected = new AuthClient.Failure('forbidden');
  const failing = new AccountClient({async requestAccount() {throw rejected;}});
  await assert.rejects(failing.organizations(), error => error === rejected);
  process.stdout.write(JSON.stringify({selected: result.organization.id, balance: result.balance_cents}));
})().catch(() => { process.stderr.write('Public account probe failed'); process.exitCode = 1; });
`,
        { mode: 0o600 }
      );
    }
  }, 30_000);

  afterAll(async () => {
    if (owned) await rm(owned, { recursive: true, force: true });
  });

  it.each(["mjs", "cjs"])(
    "runs %s outside the workspace and preserves external auth failure identity",
    async (format) => {
      const { stdout, stderr } = await execute(
        process.execPath,
        [join(owned!, `probe.${format}`)],
        {
          cwd: owned,
          env: { PATH: dirname(process.execPath) },
          timeout: 10_000,
          maxBuffer: 16_384,
        }
      );
      expect(JSON.parse(stdout)).toEqual({ selected: 2, balance: 0 });
      expect(stderr).toBe("");
      const artifact = await readFile(
        join(owned!, `node_modules/@grida/account/dist/index.${format}`),
        "utf8"
      );
      expect(artifact).toContain("@grida/auth");
      expect(artifact).not.toContain("node:");
    }
  );
});
