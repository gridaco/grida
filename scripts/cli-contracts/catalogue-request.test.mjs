import assert from "node:assert/strict";
import test from "node:test";
import { expectedFaultRequest, projectRequest } from "./catalogue-request.mjs";

test("request projection preserves headers and JSON escaping", () => {
  const expected = {
    lane: "provider",
    method: "POST",
    url: "https://ai-gateway.vercel.sh/v3/ai/video-model",
    headers: {
      accept: "text/event-stream",
      authorization: "Bearer synthetic-key",
      "content-type": "application/json",
    },
    body: { prompt: 'quoted "text"\n\\ Unicode 😀' },
  };
  const init = {
    method: "POST",
    headers: expected.headers,
    body: JSON.stringify(expected.body),
  };
  assert.deepEqual(projectRequest("provider", expected.url, init), expected);
  for (const headers of [
    { ...init.headers, accept: "application/json" },
    { ...init.headers, authorization: "Bearer wrong-key" },
    { ...init.headers, cookie: "unexpected=credential" },
  ]) {
    assert.notDeepEqual(
      projectRequest("provider", expected.url, { ...init, headers }),
      expected
    );
  }
  const headers = { ...init.headers };
  delete headers["content-type"];
  assert.throws(() =>
    projectRequest("provider", expected.url, { ...init, headers })
  );
});

test("only the two Vercel model routes exclude the SDK user-agent", () => {
  const headers = {
    "ai-gateway-auth-method": "api-key",
    "ai-gateway-protocol-version": "0.0.1",
    "user-agent": "synthetic-sdk-version",
  };
  for (const model of ["image-model", "video-model"]) {
    assert.deepEqual(
      projectRequest(
        "provider",
        `https://ai-gateway.vercel.sh/v3/ai/${model}`,
        { headers }
      ).headers,
      {
        "ai-gateway-auth-method": "api-key",
        "ai-gateway-protocol-version": "0.0.1",
      }
    );
  }
  assert.deepEqual(
    projectRequest("provider", "https://other.example/video-model", { headers })
      .headers,
    headers
  );
});

test("multipart normalizes only a boundary that frames the actual body", () => {
  const url = "https://openapi.tripo3d.ai/v3/files";
  const init = {
    method: "POST",
    headers: {
      "content-type": "multipart/form-data; boundary=typescript-boundary",
    },
    body: Buffer.from(
      '--typescript-boundary\r\nContent-Disposition: form-data; name="file"; filename="mesh.glb"\r\nContent-Type: model/gltf-binary\r\n\r\nraw\r\n--typescript-boundary--\r\n'
    ),
  };
  const projected = projectRequest("provider", url, init);
  assert.equal(
    projected.headers["content-type"],
    "multipart/form-data; boundary=<boundary>"
  );
  assert.deepEqual(projected.body, {
    multipart: {
      name: "file",
      filename: "mesh.glb",
      media_type: "model/gltf-binary",
      base64: "cmF3",
    },
  });
  for (const [label, from, to] of [
    ["missing disposition", "Content-Disposition:", "X-Unrelated:"],
    ["wrong disposition", "form-data;", "attachment;"],
    ["unknown header", "Content-Type:", "X-Unrelated: value\r\nContent-Type:"],
    [
      "duplicate disposition",
      "Content-Disposition:",
      'content-disposition: form-data; name="file"; filename="mesh.glb"\r\nContent-Disposition:',
    ],
    [
      "duplicate content type",
      "Content-Type:",
      "content-type: model/gltf-binary\r\nContent-Type:",
    ],
    ["missing content type", "Content-Type: model/gltf-binary\r\n", ""],
    [
      "duplicate parameter",
      'filename="mesh.glb"',
      'filename="mesh.glb"; filename="other.glb"',
    ],
  ]) {
    assert.throws(
      () =>
        projectRequest("provider", url, {
          ...init,
          body: Buffer.from(init.body.toString().replace(from, to)),
        }),
      undefined,
      label
    );
  }
  assert.throws(() =>
    projectRequest("provider", url, {
      ...init,
      headers: {
        "content-type": "multipart/form-data; boundary=wrong-boundary",
      },
    })
  );
  assert.throws(() =>
    projectRequest("provider", url, {
      ...init,
      body: init.body.subarray(0, init.body.length - 4),
    })
  );
});

test("fault URLs affect only later requests selected by the replaced response", () => {
  const submission = {
    request: { url: "https://queue.fal.run/submit", method: "POST" },
    response: {
      base64: Buffer.from(
        JSON.stringify({ status_url: "https://queue.fal.run/status" })
      ).toString("base64"),
    },
  };
  const polling = {
    request: {
      url: "https://queue.fal.run/status",
      method: "GET",
      headers: { authorization: "Key synthetic-key" },
    },
  };
  const transcript = [submission, polling];
  const fault = {
    step: 0,
    body_json: { status_url: "https://sub.queue.fal.run/status" },
  };
  assert.deepEqual(
    expectedFaultRequest(transcript, fault, 0),
    submission.request
  );
  assert.deepEqual(expectedFaultRequest(transcript, fault, 1), {
    ...polling.request,
    url: fault.body_json.status_url,
  });
  assert.equal(polling.request.url, "https://queue.fal.run/status");
  assert.deepEqual(
    expectedFaultRequest(transcript, { step: 0, status: 403 }, 1),
    polling.request
  );
});
