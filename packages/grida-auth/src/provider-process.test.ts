// GRIDA-SEC-014 — copied public package interoperability and crash-released authority.
import { execFile, spawn, type ChildProcess } from "node:child_process";
import { randomUUID } from "node:crypto";
import * as fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

const worker = String.raw`
import { createRequire } from 'node:module';
import { ProviderCredentialStore } from '@grida/auth/providers';
const require = createRequire(import.meta.url);
const CommonJS = require('@grida/auth/providers');
const home = process.argv[2];
const input = JSON.parse(process.argv[3]);
const store = new ProviderCredentialStore({home});
process.on('message', () => {});
try {
  let result;
  switch (input.action) {
    case 'set': await store.set(input.provider, input.key); result = true; break;
    case 'read': result = await store.read(input.provider); break;
    case 'list': result = await store.list(); break;
    case 'remove': await store.remove(input.provider); result = true; break;
    case 'mixed':
      await Promise.all([store.set('esm', 'synthetic-esm'), new CommonJS.ProviderCredentialStore({home}).set('cjs', 'synthetic-cjs')]);
      result = await store.list(); break;
    case 'pending':
      await store.migrate({
        async read() {return [{provider:'imported',apiKey:'synthetic-imported'}]},
        async retire() {process.send({type:'ready'}); await new Promise(() => {});}
      }); break;
    case 'resume':
      result = await store.migrate({
        async read() {throw new Error('Source must never be reread')},
        async retire() {}
      }); break;
    default: throw new Error('Unsupported synthetic operation');
  }
  process.send({type:'result',ok:true,result}, () => process.exit(0));
} catch (error) {
  process.send({type:'result',ok:false,code:error instanceof ProviderCredentialStore.Failure ? error.code : 'consumer_failed'}, () => process.exit(0));
}
`;

describe.skipIf(!["darwin", "linux"].includes(process.platform))(
  "copied provider credential package",
  () => {
    let root: string;
    const children = new Set<ChildProcess>();
    beforeAll(async () => {
      const packageRoot = fileURLToPath(new URL("../", import.meta.url));
      root = await fs.realpath(
        await fs.mkdtemp(path.join(os.tmpdir(), "provider-public-"))
      );
      const copied = path.join(root, "node_modules/@grida/auth");
      await fs.mkdir(copied, { recursive: true, mode: 0o700 });
      await promisify(execFile)(
        path.join(packageRoot, "node_modules/.bin/tsdown"),
        ["--out-dir", path.join(copied, "dist"), "--logLevel", "silent"],
        {
          cwd: packageRoot,
          env: {
            PATH: `${path.dirname(process.execPath)}:/usr/bin:/bin`,
            CI: "1",
          },
          timeout: 30_000,
          maxBuffer: 1_048_576,
        }
      );
      await fs.copyFile(
        path.join(packageRoot, "package.json"),
        path.join(copied, "package.json")
      );
      await fs.writeFile(path.join(root, "consumer.mjs"), worker, {
        mode: 0o600,
      });
    }, 40_000);
    afterEach(async () => {
      await Promise.all(
        [...children].map(
          (child) =>
            new Promise<void>((resolve) => {
              child.once("exit", () => resolve());
              child.kill("SIGKILL");
            })
        )
      );
      children.clear();
    });
    afterAll(async () => {
      if (root) await fs.rm(root, { recursive: true, force: true });
    });

    function start(home: string, input: object) {
      const child = spawn(
        process.execPath,
        [path.join(root, "consumer.mjs"), home, JSON.stringify(input)],
        { env: {}, stdio: ["ignore", "ignore", "ignore", "ipc"] }
      );
      children.add(child);
      const exit = new Promise<void>((resolve) =>
        child.once("exit", () => {
          children.delete(child);
          resolve();
        })
      );
      const message = new Promise<{
        type: string;
        ok?: boolean;
        result?: unknown;
        code?: string;
      }>((resolve, reject) => {
        child.once("message", (value) => resolve(value as { type: string }));
        child.once("error", () =>
          reject(new Error("Synthetic provider process failed"))
        );
        child.once("exit", () =>
          reject(new Error("Synthetic provider process exited before result"))
        );
      });
      return { child, exit, message };
    }
    async function run(home: string, input: object) {
      const child = start(home, input);
      const message = await child.message;
      await child.exit;
      return message;
    }

    it("preserves updates from concurrent independent processes and restart deletion", async () => {
      const home = path.join(root, randomUUID());
      const results = await Promise.all(
        Array.from({ length: 6 }, (_, index) =>
          run(home, {
            action: "set",
            provider: `example-${index}`,
            key: `synthetic-${index}`,
          })
        )
      );
      expect(results.every((value) => value.ok)).toBe(true);
      expect((await run(home, { action: "list" })).result).toHaveLength(6);
      expect(
        (await run(home, { action: "read", provider: "example-2" })).result
      ).toBe("synthetic-2");
      expect(
        (await run(home, { action: "remove", provider: "example-2" })).ok
      ).toBe(true);
      expect(
        (await run(home, { action: "read", provider: "example-2" })).result
      ).toBeNull();
      expect(
        (await run(home, { action: "read", provider: "example-3" })).result
      ).toBe("synthetic-3");
    }, 20_000);

    it("coordinates separately loaded ESM and CommonJS package copies", async () => {
      const result = await run(path.join(root, randomUUID()), {
        action: "mixed",
      });
      expect(result).toMatchObject({
        ok: true,
        result: [{ provider: "cjs" }, { provider: "esm" }],
      });
    });

    it("releases crashed migration authority and resumes retirement without rereading the source", async () => {
      const home = path.join(root, randomUUID());
      const held = start(home, { action: "pending" });
      expect(await held.message).toEqual({ type: "ready" });
      held.child.kill("SIGKILL");
      await held.exit;
      expect(
        await run(home, { action: "read", provider: "imported" })
      ).toMatchObject({ ok: false, code: "migration_pending" });
      expect(await run(home, { action: "resume" })).toMatchObject({
        ok: true,
        result: { state: "complete" },
      });
      expect(
        await run(home, { action: "read", provider: "imported" })
      ).toMatchObject({ ok: true, result: "synthetic-imported" });
    }, 15_000);
  }
);
