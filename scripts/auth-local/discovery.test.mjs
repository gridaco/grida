import assert from "node:assert/strict";
import test from "node:test";
import { createRequire } from "node:module";
import { startAuthDiscovery } from "./discovery.mjs";
const require = createRequire(
  new URL("../../packages/grida-ai/package.json", import.meta.url)
);
const { GGDiscoveryStore } = require("@grida/ai/discovery");

test("OAuth fixture serves the real anonymous discovery reader on loopback", async () => {
  const fixture = await startAuthDiscovery({ port: 0 });
  const store = new GGDiscoveryStore({ origin: fixture.origin });
  try {
    const snapshot = await store.ready();
    assert.deepEqual(
      snapshot.models.map((model) => model.id),
      ["fixture/auth-text"]
    );
    assert.equal(
      snapshot.models[0].interfaces.includes("chat.completions"),
      true
    );
    assert.equal(
      (await fetch(fixture.origin + "/v1/models?ignored=1")).status,
      404
    );
    assert.equal((await fetch(fixture.origin + "/v1/paid")).status, 404);
    fixture.assertClean();
    assert.equal(
      (await fetch(fixture.origin + "/__fixture/verify")).status,
      204
    );
  } finally {
    store.dispose();
    await fixture.close();
  }
});
test("fixture rejects and records credential/body/method violations without reflecting secrets", async () => {
  const fixture = await startAuthDiscovery({ port: 0 });
  try {
    const response = await fetch(fixture.origin + "/v1/models", {
      headers: { authorization: "Bearer synthetic" },
    });
    assert.equal(response.status, 400);
    assert.equal(await response.text(), "");
    assert.equal(
      (
        await fetch(fixture.origin + "/v1/models", {
          method: "POST",
          body: "{}",
        })
      ).status,
      400
    );
    // A later successful anonymous read must not clear the CI verdict.
    assert.equal((await fetch(fixture.origin + "/v1/models")).status, 200);
    const verdict = await fetch(fixture.origin + "/__fixture/verify");
    assert.equal(verdict.status, 500);
    assert.equal(await verdict.text(), "");
    assert.throws(
      fixture.assertClean,
      /Discovery credential boundary violated/
    );
  } finally {
    await fixture.close();
  }
});
