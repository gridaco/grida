// GRIDA-SEC-010, GRIDA-SEC-011 — guard positive controls use no external connections.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { test } from "node:test";

const execute = promisify(execFile);
const guard = fileURLToPath(new URL("./network.cjs", import.meta.url));
test("CLI proof blocks remote, unexpected loopback, socket, subprocess and offline traffic", async () => {
  const root = await mkdtemp(path.join(tmpdir(), "grida-cli-guard-"));
  const report = path.join(root, "report.json");
  try {
    await execute(
      process.execPath,
      [
        "--require",
        guard,
        "--input-type=module",
        "-e",
        `
      import assert from 'node:assert/strict';
      import net from 'node:net';
      import { spawn } from 'node:child_process';
      import { lookup } from 'node:dns/promises';
      import dns from 'node:dns';
      import dnsPromises from 'node:dns/promises';
      await assert.rejects(fetch('https://example.invalid'));
      assert.throws(() => net.connect({host:'127.0.0.1',port:1}));
      assert.throws(() => net.connect({path:'/not-a-socket'}));
      assert.throws(() => net.createServer().listen(0,'127.0.0.1'));
      assert.throws(() => net.createServer().listen({host:'127.0.0.1',port:55435,path:'/not-a-socket'}));
      assert.throws(() => spawn('/not-an-executable'));
      await assert.rejects(lookup('example.invalid'));
      assert.throws(() => dns.resolveTxt('example.invalid'));
      await assert.rejects(dnsPromises.reverse('192.0.2.1'));
      assert.throws(() => new dns.Resolver());
      process.env.GRIDA_CLI_PROOF_OFFLINE='1';
      await assert.rejects(fetch('http://127.0.0.1:3041/api/v1/auth/me'));
    `,
      ],
      {
        cwd: root,
        env: { GRIDA_CLI_PROOF_ROOT: root, GRIDA_CLI_PROOF_REPORT: report },
        timeout: 10_000,
      }
    );
    assert.deepEqual(JSON.parse(await readFile(report, "utf8")), {
      denied: 11,
      requests: [],
    });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test(
  "macOS custody ACL checks retain the real execFile promise result",
  { skip: process.platform !== "darwin" },
  async () => {
    const root = await mkdtemp(path.join(tmpdir(), "grida-cli-guard-"));
    const report = path.join(root, "report.json");
    try {
      await execute(
        process.execPath,
        [
          "--require",
          guard,
          "--input-type=module",
          "-e",
          `
      import assert from 'node:assert/strict';
      import { execFile } from 'node:child_process';
      import { promisify } from 'node:util';
      const options={env:{LC_ALL:'C',LANG:'C'},timeout:2000,maxBuffer:65536};
      const result=await promisify(execFile)('/bin/ls',['-lde',process.env.GRIDA_CLI_PROOF_ROOT],options);
      assert.equal(typeof result.stdout,'string');
      assert(result.stdout.includes(process.env.GRIDA_CLI_PROOF_ROOT));
      assert.equal(result.stderr,'');
      await assert.rejects(promisify(execFile)('/bin/ls',['-lde','/not-owned'],options));
    `,
        ],
        {
          cwd: root,
          env: { GRIDA_CLI_PROOF_ROOT: root, GRIDA_CLI_PROOF_REPORT: report },
          timeout: 10_000,
        }
      );
      assert.deepEqual(JSON.parse(await readFile(report, "utf8")), {
        denied: 1,
        requests: [],
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  }
);
