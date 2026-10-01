import assert from "node:assert/strict";

// Preserve all protocol headers. Only the pinned SDK user-agent identifies
// a different implementation; exclude it on the exact Vercel model routes.
export function projectRequest(lane, url, init = {}) {
  url = String(url);
  const method = init.method ?? "GET";
  const headers = Object.fromEntries(new Headers(init.headers));
  if (
    [
      "https://ai-gateway.vercel.sh/v3/ai/image-model",
      "https://ai-gateway.vercel.sh/v3/ai/video-model",
    ].includes(url)
  ) {
    delete headers["user-agent"];
  }
  let body = null;
  if (init.body) {
    const bytes = Buffer.from(init.body);
    const type = headers["content-type"];
    if (type?.startsWith("multipart/form-data; boundary=")) {
      const boundary = type.slice("multipart/form-data; boundary=".length);
      assert.match(boundary, /^[A-Za-z0-9'_-]+$/);
      const opening = Buffer.from(`--${boundary}\r\n`);
      const closing = Buffer.from(`\r\n--${boundary}--\r\n`);
      assert(bytes.subarray(0, opening.length).equals(opening));
      assert(bytes.subarray(-closing.length).equals(closing));
      const separator = bytes.indexOf("\r\n\r\n");
      assert(separator >= opening.length);
      const prefix = separator + 4;
      const end = bytes.length - closing.length;
      assert(prefix <= end);
      const head = bytes.subarray(opening.length, separator).toString();
      const partHeaders = new Map();
      for (const line of head.split("\r\n")) {
        const colon = line.indexOf(":");
        assert(colon > 0, "invalid multipart header");
        const name = line.slice(0, colon).toLowerCase();
        const value = line.slice(colon + 1).replace(/^[ \t]+|[ \t]+$/g, "");
        assert(
          ["content-disposition", "content-type"].includes(name),
          "unknown multipart header"
        );
        assert(!partHeaders.has(name), "duplicate multipart header");
        assert(!/[\r\n]/.test(value), "invalid multipart header value");
        partHeaders.set(name, value);
      }
      const disposition =
        /^form-data;[ \t]*name="([^"\r\n]+)";[ \t]*filename="([^"\r\n]+)"$/i.exec(
          partHeaders.get("content-disposition") ?? ""
        );
      assert(disposition, "invalid multipart form-data disposition");
      const mediaType = partHeaders.get("content-type");
      assert(mediaType, "missing multipart content-type");
      const payload = bytes.subarray(prefix, end);
      assert(!payload.includes(boundary));
      body = {
        multipart: {
          name: disposition[1],
          filename: disposition[2],
          media_type: mediaType,
          base64: payload.toString("base64"),
        },
      };
      headers["content-type"] = "multipart/form-data; boundary=<boundary>";
    } else if (type === "application/octet-stream") {
      body = { base64: bytes.toString("base64") };
    } else {
      assert.equal(type, "application/json");
      body = JSON.parse(bytes.toString());
    }
  }
  return {
    lane: method === "PUT" ? "upload" : lane,
    method,
    url,
    headers,
    body,
  };
}

// A fault can replace a server-selected polling/result URL. Preserve that
// explicitly supplied URL in subsequent request expectations; all other fields
// still come from the successful pinned transcript.
export function expectedFaultRequest(transcript, fault, step) {
  const expected = structuredClone(transcript[step].request);
  if (step > fault.step && fault.body_json) {
    const original = JSON.parse(
      Buffer.from(transcript[fault.step].response.base64, "base64").toString()
    );
    for (const field of ["status_url", "response_url"]) {
      if (
        typeof original[field] === "string" &&
        typeof fault.body_json[field] === "string" &&
        expected.url === original[field]
      )
        expected.url = fault.body_json[field];
    }
  }
  return expected;
}
