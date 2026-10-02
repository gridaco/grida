import assert from "node:assert/strict";
import { createServer } from "node:http";
import { setTimeout as delay } from "node:timers/promises";

/** Records real provider HTTP payloads after SDK serialization/template rendering. */
export async function createProviders() {
  const emails = [];
  const calls = [];
  let failEmails = false;
  const server = createServer(async (req, res) => {
    const url = new URL(req.url, "http://127.0.0.1");
    const reply = (status, body) => {
      res.writeHead(status, { "content-type": "application/json" });
      res.end(JSON.stringify(body));
    };
    try {
      let body = "";
      for await (const chunk of req) {
        body += chunk;
        assert(body.length < 1024 * 1024, "Provider request too large");
      }
      calls.push({ method: req.method, path: url.pathname });
      if (req.method === "POST" && url.pathname === "/resend/emails") {
        assert.equal(
          req.headers.authorization,
          "Bearer re_forms_local_fixture"
        );
        const email = JSON.parse(body);
        if (failEmails)
          return reply(503, {
            name: "application_error",
            message: "Fixture unavailable",
          });
        emails.push({
          ...email,
          otp: /\b\d{6}\b/.exec(email.subject ?? "")?.[0],
        });
        return reply(200, { id: `forms-fixture-email-${emails.length}` });
      }
      // No scenario permits SMS. Record an unexpected attempt and fail the run.
      reply(500, { error: "Unexpected provider operation" });
    } catch {
      reply(500, { error: "Invalid fixture provider request" });
    }
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  return {
    origin: `http://127.0.0.1:${server.address().port}`,
    get emails() {
      return emails;
    },
    get calls() {
      return calls;
    },
    reset() {
      emails.length = 0;
      calls.length = 0;
      failEmails = false;
    },
    failEmails(value) {
      failEmails = value;
    },
    async awaitEmail({ to }) {
      const deadline = Date.now() + 10_000;
      while (Date.now() < deadline) {
        const email = emails.findLast((item) => [item.to].flat().includes(to));
        if (email) return email;
        await delay(30);
      }
      throw new Error("Expected fixture email was not recorded");
    },
    async close() {
      server.closeAllConnections();
      await new Promise((resolve) => server.close(resolve));
    },
  };
}
