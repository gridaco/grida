// GRIDA-SEC-010 / GRIDA-SEC-011 — synthetic runner checks for the isolated native OAuth proof.
import assert from "node:assert/strict";
import { test } from "node:test";
import { fixture } from "../auth-local/guards.mjs";
import {
  authorizationUrl,
  fixtureUrl,
  nativeCommand,
  validateRegistration,
} from "./native-proof.mjs";

const registration = {
  clientId: "synthetic-test-client",
  publishableKey: "sb_publishable_synthetic",
  issuer: fixture.issuer,
  apiOrigin: fixture.editorOrigin,
  redirectUris: fixture.redirectUris,
};
const setup = {
  apiUrl: fixture.apiUrl,
  editorOrigin: fixture.editorOrigin,
  publishableKey: registration.publishableKey,
};
function authorization() {
  const url = new URL(fixture.issuer + "/oauth/authorize");
  url.search = new URLSearchParams({
    client_id: registration.clientId,
    response_type: "code",
    scope: "email profile",
    redirect_uri: fixture.redirectUris[0],
    state: "s".repeat(43),
    code_challenge: "c".repeat(43),
    code_challenge_method: "S256",
  }).toString();
  return url;
}
test("native acceptance requires the exact fixture issuer, origin, admission key and callbacks", () => {
  validateRegistration(setup, registration);
  for (const change of [
    { issuer: "https://example.com/auth/v1" },
    { apiOrigin: fixture.apiUrl },
    { publishableKey: "sb_publishable_other" },
    { redirectUris: ["http://127.0.0.1:45678/callback"] },
  ])
    assert.throws(() =>
      validateRegistration(setup, { ...registration, ...change })
    );
});
test("browser admission rejects hosted URLs, credentials, fragments and unrelated loopback ports", () => {
  assert.equal(fixtureUrl(fixture.editorOrigin).origin, fixture.editorOrigin);
  for (const value of [
    "https://grida.co",
    "http://127.0.0.1:45678",
    fixture.editorOrigin + "#token",
    fixture.editorOrigin.replace("//", "//user:password@"),
  ])
    assert.throws(() => fixtureUrl(value));
});
test("manual authorization admission checks PKCE, registration and duplicates", () => {
  const valid = authorization();
  assert.equal(authorizationUrl(valid.href, registration), valid.href);
  const native = new URL(valid);
  native.searchParams.set("state", "s".repeat(22));
  assert.equal(authorizationUrl(native.href, registration), native.href);
  for (const [field, value] of [
    ["client_id", "other"],
    ["code_challenge_method", "plain"],
    ["code_challenge", "short"],
    ["state", "short"],
    ["scope", "admin"],
    ["redirect_uri", "https://example.com"],
  ]) {
    const invalid = new URL(valid);
    invalid.searchParams.set(field, value);
    assert.throws(() => authorizationUrl(invalid.href, registration));
  }
  const duplicate = new URL(valid);
  duplicate.searchParams.append("state", "other");
  assert.throws(() => authorizationUrl(duplicate.href, registration));
});
function child(source) {
  return nativeCommand({
    executable: process.execPath,
    args: ["-e", source],
    cwd: process.cwd(),
    env: { PATH: process.env.PATH },
    registration,
    timeoutMs: 1000,
  });
}
test("direct runner preserves separate output and unsuccessful exit", async () => {
  const result = await child(
    'process.stdout.write("safe-output");process.stderr.write("safe-error");process.exitCode=2'
  ).done;
  assert.deepEqual(result, {
    code: 2,
    stdout: "safe-output",
    stderr: "safe-error",
  });
});
test("direct runner rejects credential-bearing output and excessive output", async () => {
  await assert.rejects(
    child('process.stdout.write("eyJabc.abc.abc")').done,
    /output or lifetime/
  );
  await assert.rejects(
    child('process.stdout.write("x".repeat(70000))').done,
    /output or lifetime/
  );
});
test("invalid manual destinations fail closed without returning the URL", async () => {
  const job = child(
    'process.stderr.write("Open this URL in your browser:\\nhttps://example.com/oauth/authorize\\n");setTimeout(()=>{},5000)'
  );
  await assert.rejects(job.url, /Invalid manual/);
  await assert.rejects(job.done, /output or lifetime/);
});
test("pending manual login can be cancelled and awaited", async () => {
  const message = JSON.stringify(
    `Open this URL in your browser:\n${authorization().href}\n`
  );
  const job = child(
    `process.on("SIGINT",()=>{process.stderr.write("cancelled");process.exit(1)});process.stderr.write(${message});setTimeout(()=>{},5000)`
  );
  await job.url;
  job.child.kill("SIGINT");
  const result = await job.done;
  assert.equal(result.code, 1);
  assert.match(result.stderr, /cancelled/);
});
