import {
  createApp,
  createRouter,
  defineEventHandler,
  getRequestHeader,
  toWebHandler,
} from "h3";
import { expect, test } from "vitest";
import platformHttp from "../server/middleware/00-platform-http";
import formsHttp from "../server/middleware/10-forms-http";
import health from "../server/routes/health.get";
import handleError from "../server/error-handler";

const app = createApp({
  onError: (error, event) =>
    handleError(error, event, {
      defaultHandler: () => {
        throw new Error(
          "The public error handler must provide its own response"
        );
      },
    }),
});
app.use(platformHttp);
app.use(formsHttp);
app.use(
  createRouter()
    .get("/health", health)
    .get(
      "/v1/another-product/ping",
      defineEventHandler((event) => ({
        request_id: getRequestHeader(event, "x-request-id"),
      }))
    ).handler
);
const request = toWebHandler(app);
const uuid =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

function preflight(pathname: string, headers: Record<string, string> = {}) {
  return request(
    new Request(`https://api.example.test${pathname}`, {
      method: "OPTIONS",
      headers: {
        origin: "https://grida.co",
        "access-control-request-method": "POST",
        "access-control-request-headers": "content-type",
        ...headers,
      },
    })
  );
}

test("Forms preflight keeps its anonymous contract and platform headers", async () => {
  const response = await preflight(
    "/v1/forms/submit/00000000-0000-0000-0000-000000000000"
  );
  expect(response.status).toBe(204);
  expect(await response.text()).toBe("");
  expect(response.headers.get("access-control-allow-origin")).toBe("*");
  expect(response.headers.get("access-control-allow-methods")).toBe(
    "GET, POST, PUT, PATCH, OPTIONS"
  );
  expect(response.headers.get("access-control-allow-headers")).toBe(
    "x-gf-geo-latitude, x-gf-geo-longitude, x-gf-geo-region, x-gf-geo-country, x-gf-geo-city, x-gf-simulator, content-type, x-request-id"
  );
  expect(response.headers.get("access-control-max-age")).toBe("600");
  expect(response.headers.get("access-control-expose-headers")).toBe(
    "x-request-id"
  );
  expect(response.headers.has("access-control-allow-credentials")).toBe(false);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("x-content-type-options")).toBe("nosniff");
  expect(response.headers.get("referrer-policy")).toBe("no-referrer");
  expect(response.headers.get("x-request-id")).toMatch(uuid);
});

const unsupportedPreflights: Record<string, string>[] = [
  { "access-control-request-method": "DELETE" },
  { "access-control-request-headers": "authorization" },
];
test.each(unsupportedPreflights)(
  "Forms rejects unsupported preflight %j",
  async (headers) => {
    const response = await preflight("/v1/forms/example", headers);
    expect(response.status).toBe(400);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
    expect(response.headers.has("access-control-allow-methods")).toBe(false);
    expect(response.headers.get("x-request-id")).toMatch(uuid);
  }
);

test.each(["/v1/forms", "/v1/forms/", "/v1/forms/example?mode=json"])(
  "Forms policy applies to its parsed namespace: %s",
  async (pathname) => {
    const response = await preflight(pathname);
    expect(response.status).toBe(204);
    expect(response.headers.get("access-control-allow-origin")).toBe("*");
  }
);

test.each([
  "/v1",
  "/v1/example",
  "/v1/submit/example",
  "/v1/session/example/field/example",
  "/v1/forms-other/example",
  "/v1/forms.example",
  "/v1/another-product/ping",
  "/health",
])(
  "Forms does not handle preflight outside its namespace: %s",
  async (pathname) => {
    const response = await preflight(pathname);
    expect(response.status).not.toBe(204);
    expect(response.headers.has("access-control-allow-origin")).toBe(false);
    expect(response.headers.has("access-control-allow-methods")).toBe(false);
    expect(response.headers.has("access-control-allow-headers")).toBe(false);
    expect(response.headers.has("access-control-expose-headers")).toBe(false);
    expect(response.headers.get("x-request-id")).toMatch(uuid);
  }
);

test("health is platform liveness without Forms CORS", async () => {
  const response = await request(
    new Request("https://api.example.test/health")
  );
  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ status: "ok" });
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(response.headers.get("x-request-id")).toMatch(uuid);
  expect(response.headers.has("access-control-allow-origin")).toBe(false);
});

test("other products receive platform correlation without inheriting Forms policy", async () => {
  const response = await request(
    new Request("https://api.example.test/v1/another-product/ping", {
      headers: { "x-request-id": "untrusted-caller-id" },
    })
  );
  const id = response.headers.get("x-request-id");
  expect(id).toMatch(uuid);
  expect(await response.json()).toEqual({ request_id: id });
  expect(response.headers.has("access-control-allow-origin")).toBe(false);
});

test("an unknown Forms route still returns a CORS-readable error", async () => {
  const response = await request(
    new Request("https://api.example.test/v1/forms/unknown/nested/path")
  );
  expect(response.status).toBe(404);
  expect(response.headers.get("access-control-allow-origin")).toBe("*");
  expect(await response.json()).toEqual({
    error: { code: "NOT_FOUND", message: "Route not found" },
    request_id: response.headers.get("x-request-id"),
  });
});
