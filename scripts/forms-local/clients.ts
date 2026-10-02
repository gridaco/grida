/** Real editor clients against the owned Nitro process; no mocked transport. */
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { submitFormToDefaultEndpoint } from "../../editor/grida-forms-hosted/internal-sdk/submit";
import { createRow } from "../../editor/scaffolds/panels/row-create";
import {
  makeResolver,
  makeUploader,
} from "../../editor/components/formfield/file-upload-field/uploader";
import { createHttpEmailChallengeProvider } from "../../editor/components/formfield/email-challenge";

type Submission = {
  formId: string;
  sessionId: string;
  values: Record<string, string>;
};

export interface ClientProofInput {
  apiOrigin: string;
  storageOrigin: string;
  sdk: Submission;
  manual: Submission;
  missingFormId: string;
  file: {
    sessionId: string;
    fieldId: string;
    name: string;
    bytesBase64: string;
  };
  challenge: {
    sessionId: string;
    fieldId: string;
    email: string;
  };
}

export interface ClientProofOutput {
  sdk: { id: string; customer_id: string | null };
  manual: { completed: true };
  denied: { sdk: true; manual: true };
  file: { path: string; publicUrl: string };
  challenge: {
    challengeId: string;
    state: "challenge-session-started";
    invalidVerifyRejected: true;
  };
}

function loopbackOrigin(value: string): string {
  const url = new URL(value);
  assert.equal(url.protocol, "http:");
  assert.equal(url.hostname, "127.0.0.1");
  assert.equal(url.origin, value);
  return url.origin;
}

function submissionBody(input: Submission): FormData {
  const body = new FormData();
  body.set("__gf_session", input.sessionId);
  body.set("__gf_utcoffset", "0");
  for (const [name, value] of Object.entries(input.values)) {
    assert(!name.startsWith("__gf_"));
    assert.equal(typeof value, "string");
    body.set(name, value);
  }
  return body;
}

let phase = "input";

async function main() {
  const [inputPath, outputPath, ...extra] = process.argv.slice(2);
  assert(inputPath && outputPath && extra.length === 0);
  assert(path.isAbsolute(inputPath) && path.isAbsolute(outputPath));
  assert.notEqual(inputPath, outputPath);
  const source = await readFile(inputPath, "utf8");
  assert(source.length < 64 * 1024);
  const input: ClientProofInput = JSON.parse(source);
  const apiOrigin = loopbackOrigin(input.apiOrigin);
  const storageOrigin = loopbackOrigin(input.storageOrigin);
  assert.equal(process.env.NEXT_PUBLIC_GRIDA_OPEN_API_ORIGIN, apiOrigin);
  // This process is an anonymous client, never the fixture's database owner.
  assert.equal(process.env.SUPABASE_SECRET_KEY, undefined);
  assert.equal(process.env.SUPABASE_SERVICE_ROLE_KEY, undefined);

  phase = "SDK submission";
  // Deliberately omit the optional host override: exercise editor configuration.
  const accepted = await submitFormToDefaultEndpoint(
    input.sdk.formId,
    submissionBody(input.sdk)
  );
  assert.equal(accepted.error, null);
  assert(accepted.data);
  assert.deepEqual(Object.keys(accepted.data).sort(), ["customer_id", "id"]);
  assert.equal(typeof accepted.data.id, "string");
  assert(
    accepted.data.customer_id === null ||
      typeof accepted.data.customer_id === "string"
  );

  phase = "manual row submission";
  await createRow(input.manual.formId, submissionBody(input.manual));

  phase = "missing form refusals";
  const refused = await submitFormToDefaultEndpoint(
    input.missingFormId,
    new FormData()
  );
  // The SDK returns an error envelope rather than throwing on HTTP failure.
  // Its DOM callback wrapper calls onSuccess only when response.data exists.
  assert(!refused.data);
  assert(refused.error);
  await assert.rejects(
    createRow(input.missingFormId, new FormData()),
    /^Error: Failed to save row \(404\)\.$/
  );

  phase = "file upload and resolution";
  const filePath = `${apiOrigin}/v1/session/${encodeURIComponent(input.file.sessionId)}/field/${encodeURIComponent(input.file.fieldId)}/file`;
  const upload = makeUploader({
    type: "requesturl",
    request_url: `${filePath}/upload/signed-url`,
  });
  const resolve = makeResolver({
    type: "requesturl",
    resolve_url: `${filePath}/preview/public-url`,
  });
  assert(upload && resolve);
  const bytes = Buffer.from(input.file.bytesBase64, "base64");
  assert(bytes.length > 0);
  // The real uploader sends name+size, then PUTs the actual File bytes.
  const uploaded = await upload(
    new File([bytes], input.file.name, { type: "image/png" })
  );
  assert(uploaded.path);
  assert(
    uploaded.path.startsWith(
      `tmp/${input.file.sessionId}/${input.file.fieldId}/`
    )
  );
  const resolved = await resolve({ path: uploaded.path });
  assert(resolved);
  assert.equal(new URL(resolved.publicUrl).origin, storageOrigin);
  const downloaded = await fetch(resolved.publicUrl, {
    redirect: "error",
    signal: AbortSignal.timeout(15_000),
  });
  assert.equal(downloaded.status, 200);
  assert.deepEqual(Buffer.from(await downloaded.arrayBuffer()), bytes);

  phase = "email challenge client";
  const challenge = createHttpEmailChallengeProvider({});
  const challengeTarget = {
    sessionId: input.challenge.sessionId,
    fieldId: input.challenge.fieldId,
  };
  const idle = await challenge.getState(challengeTarget);
  assert.equal(idle.state, "idle");
  const started = await challenge.start({
    ...challengeTarget,
    email: input.challenge.email,
  });
  assert.equal(started.state, "challenge-session-started");
  assert.equal(started.email, input.challenge.email);
  assert(started.challenge_id);
  assert.equal(started.customer_uid, null);
  assert.deepEqual(await challenge.getState(challengeTarget), started);
  // A different challenge ID deterministically refuses verification; no real
  // OTP leaves the parent recorder or risks an accidental successful guess.
  let missingChallenge = randomUUID();
  while (missingChallenge === started.challenge_id)
    missingChallenge = randomUUID();
  await assert.rejects(
    challenge.verify({
      ...challengeTarget,
      challengeId: missingChallenge,
      otp: "000000",
    }),
    /^Error: invalid or expired OTP$/
  );
  assert.deepEqual(await challenge.getState(challengeTarget), started);

  phase = "private output";
  const result: ClientProofOutput = {
    sdk: accepted.data,
    manual: { completed: true },
    denied: { sdk: true, manual: true },
    file: { path: uploaded.path, publicUrl: resolved.publicUrl },
    challenge: {
      challengeId: started.challenge_id,
      state: "challenge-session-started",
      invalidVerifyRejected: true,
    },
  };
  await writeFile(outputPath, JSON.stringify(result) + "\n", {
    mode: 0o600,
    flag: "wx",
  });
}

main().catch(() => {
  // Assertion diffs can contain respondent capabilities; keep them private.
  console.error(`Forms client acceptance failed during ${phase}.`);
  process.exitCode = 1;
});
