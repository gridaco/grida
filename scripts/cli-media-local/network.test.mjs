// GRIDA-SEC-013 — synthetic guard positive controls cannot make external connections.
// GRIDA-SEC-006 — proof instrumentation retains the scoped GG network perimeter.
// GRIDA-GG: token — guard controls use no provider or account credentials.
import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { cp, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { test } from "node:test";
const execute = promisify(execFile);
async function run(source, fixture) {
  const root = await mkdtemp(path.join(tmpdir(), "grida-cli-media-guard-"));
  try {
    await cp(
      fileURLToPath(new URL("./network.cjs", import.meta.url)),
      path.join(root, "network.cjs")
    );
    await cp(
      fileURLToPath(new URL("../cli-local/network.cjs", import.meta.url)),
      path.join(root, "auth-network.cjs")
    );
    await writeFile(path.join(root, "fixture.json"), JSON.stringify(fixture));
    await execute(
      process.execPath,
      [
        "--require",
        path.join(root, "network.cjs"),
        "--input-type=module",
        "-e",
        source,
      ],
      {
        cwd: root,
        env: {
          HOME: root,
          GRIDA_CLI_PROOF_ROOT: root,
          GRIDA_CLI_PROOF_REPORT: path.join(root, "base.json"),
          GRIDA_MEDIA_PROOF_FIXTURE: path.join(root, "fixture.json"),
          GRIDA_MEDIA_PROOF_REPORT: path.join(root, "media.json"),
        },
        timeout: 10_000,
        maxBuffer: 64 * 1024,
      }
    );
    return {
      base: JSON.parse(await readFile(path.join(root, "base.json"), "utf8")),
      media: JSON.parse(await readFile(path.join(root, "media.json"), "utf8")),
    };
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}
test("media extension retains raw network/process denial and exact synthetic DNS", async () => {
  const result = await run(
    `
    import assert from 'node:assert/strict';
    import net from 'node:net';
    import tls from 'node:tls';
    import https from 'node:https';
    import dns from 'node:dns';
    import dnsPromises from 'node:dns/promises';
    import {spawn} from 'node:child_process';
    await assert.rejects(fetch('https://example.invalid'));
    assert.throws(() => tls.connect({host:'example.invalid',port:443}));
    assert.throws(() => dns.resolveTxt('example.invalid'));
    assert.throws(() => spawn('/not-an-executable'));
    process.env.GRIDA_CLI_PROOF_OFFLINE = '1';
    assert.throws(() => net.connect({host:'127.0.0.1',port:3041}));
    assert.throws(() => net.connect({host:'127.0.0.1',port:55431}));
    assert.throws(() => net.connect({path:'/not-a-socket'}));
    assert.throws(() => https.request({hostname:'unreviewed.invalid'}));
    await assert.rejects(dnsPromises.lookup('unreviewed.invalid',{all:true,verbatim:true}));
    assert.deepEqual(await dnsPromises.lookup('asset.example',{all:true,verbatim:true}),[{address:'93.184.216.34',family:4}]);
  `,
    {
      requests: [],
      dns: { "asset.example": [{ address: "93.184.216.34", family: 4 }] },
    }
  );
  assert.equal(result.base.denied, 5);
  assert.equal(result.media.violations, 4);
  assert.deepEqual(result.media.requests, []);
  assert.deepEqual(result.media.dns, ["asset.example"]);
});
test("a caught synthetic body assertion is recorded and never counted as a verified request", async () => {
  const result = await run(
    `
    import assert from 'node:assert/strict';
    import https from 'node:https';
    const request = https.request({protocol:'https:',hostname:'openrouter.ai',port:443,path:'/api/v1/images',method:'POST',agent:false,autoSelectFamily:false,rejectUnauthorized:true,servername:'openrouter.ai',family:4,headers:{'accept-encoding':'identity',authorization:'Bearer synthetic'},signal:new AbortController().signal,lookup(host,options,callback){callback(null,'93.184.216.34',4);}},()=>{});
    assert.throws(()=>request.end(Buffer.from('{}')));
    request.destroy();
  `,
    {
      requests: [
        {
          hostname: "openrouter.ai",
          path: "/api/v1/images",
          method: "POST",
          headers: { authorization: "Bearer synthetic" },
          json: { prompt: "expected" },
        },
      ],
      dns: {},
    }
  );
  assert.equal(result.media.violations, 1);
  assert.deepEqual(result.media.requests, []);
  assert.equal(result.media.destroyed, 1);
  assert.equal(result.base.denied, 0);
});
