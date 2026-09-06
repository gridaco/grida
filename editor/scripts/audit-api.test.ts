/** GRIDA-SEC-012 — injected source trees prove the API audit rejects bypasses. */
import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, mkdir, writeFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { apiAudit } from "./audit-api";

const ROUTE = "app/(api)/(public)/api/v1/auth/me/route.ts";
const TEMPLATE = `
import { accountApi } from "@/lib/api/account";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const handlers = accountApi.bind("auth.me");
export const GET = handlers.GET;
export const HEAD = handlers.HEAD;
export const OPTIONS = handlers.OPTIONS;
export const POST = handlers.POST;
export const PUT = handlers.PUT;
export const PATCH = handlers.PATCH;
export const DELETE = handlers.DELETE;
`;
const DEFINITIONS = {
  "auth.me": {
    path: "/api/v1/auth/me",
    methods: ["GET", "HEAD", "OPTIONS"],
    authority: "native-account",
    binding: "account",
    cache: "no-store",
  },
} as const;
const roots: string[] = [];

async function fixture(
  entries: Record<string, string | null> = {},
  definitions: Readonly<Record<string, apiAudit.Definition>> = DEFINITIONS,
  prepare?: (root: string) => Promise<void>
): Promise<apiAudit.Diagnostic[]> {
  const root = await mkdtemp(path.join(tmpdir(), "grida-api-audit-"));
  roots.push(root);
  const files: Record<string, string | null> = {
    "tsconfig.json": JSON.stringify({
      compilerOptions: {
        moduleResolution: "bundler",
        module: "esnext",
        allowJs: true,
        paths: { "@/*": ["./*"], "@domain/*": ["./domain/*"] },
      },
    }),
    [ROUTE]: TEMPLATE,
    "lib/api/account.ts":
      'import "server-only"; export namespace accountApi {}',
    ...entries,
  };
  for (const [relative, text] of Object.entries(files)) {
    if (text === null) continue;
    const file = path.join(root, relative);
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, text, "utf8");
  }
  await prepare?.(root);
  return apiAudit.check({ editorRoot: root, definitions });
}

afterEach(async () => {
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true }))
  );
});

describe("apiAudit.check route inventory", () => {
  it("accepts the canonical binding with comments and arbitrary formatting", async () => {
    expect(
      await fixture({
        [ROUTE]: `// comments do not grant an exemption\n${TEMPLATE.replaceAll('"', "'")}`,
      })
    ).toEqual([]);
  });

  it("rejects a registered operation whose handler is missing", async () => {
    expect(await fixture({ [ROUTE]: null })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "missing-route",
          message: expect.stringContaining("auth.me"),
        }),
      ])
    );
  });

  it.each([
    "app/(other)/api/v1/new/route.ts",
    "app/api/v1/new/page.tsx",
    "pages/api/v1/new.ts",
    "src/pages/api/v1/new/index.ts",
    "src/app/api/v1/new/route.js",
    "app/api/[...path]/route.ts",
    "app/[section]/v1/auth/me/route.ts",
    "app/[[...path]]/page.tsx",
  ])("finds an unregistered API placement at %s", async (file) => {
    const diagnostics = await fixture({
      [file]: "export function GET() { return new Response('bypass'); }",
    });
    expect(diagnostics).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ file, code: "unregistered-route" }),
      ])
    );
  });

  it.each([
    "app/(other)/api/v1/auth/me/route.ts",
    "app/api/@parallel/v1/auth/me/page.tsx",
    "app/api/@modal/(.)v1/auth/me/page.tsx",
    "app/elsewhere/(...)api/v1/auth/me/route.ts",
    "pages/api/v1/auth/me.ts",
  ])("rejects duplicate resolved endpoints including %s", async (file) => {
    expect(await fixture({ [file]: TEMPLATE })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ file, code: "duplicate-route" }),
      ])
    );
  });

  it("ignores private folders and endpoints outside the API namespace", async () => {
    expect(
      await fixture({
        "app/_private/api/v1/hidden/route.ts": "export function GET() {}",
        "app/(tools)/tools/api/v1/example/page.tsx":
          "export default function Page() {}",
        "pages/api/v10/example.ts": "export default function handler() {}",
        "app/[org]/[proj]/campaigns/page.tsx":
          "export default function Page() {}",
      })
    ).toEqual([]);
  });

  it("rejects duplicate registry paths", async () => {
    expect(
      await fixture({}, { ...DEFINITIONS, duplicate: DEFINITIONS["auth.me"] })
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "duplicate-registration" }),
      ])
    );
  });

  it("rejects changing auth.me authority through its registry entry", async () => {
    expect(
      await fixture(
        {},
        {
          "auth.me": { ...DEFINITIONS["auth.me"], methods: ["POST"] },
        }
      )
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "registry",
          message: expect.stringContaining("auth.me"),
        }),
      ])
    );
  });

  it("rejects a symlinked route subtree instead of silently omitting it", async () => {
    expect(
      await fixture(
        {
          "hidden/api/v1/new/route.ts": "export function GET() {}",
        },
        DEFINITIONS,
        async (root) => {
          await symlink(
            path.join(root, "hidden"),
            path.join(root, "app/(hidden)"),
            "dir"
          );
        }
      )
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "source-symlink",
          file: "app/(hidden)",
        }),
      ])
    );
  });
});

describe("apiAudit.check bound route structure", () => {
  it.each([
    TEMPLATE.replace('bind("auth.me")', 'bind("other.operation")'),
    TEMPLATE.replace(
      "export const GET = handlers.GET;",
      "export const GET = handlers.POST;"
    ),
    TEMPLATE.replace(
      "export const GET = handlers.GET;",
      "export async function GET(request: Request) { return handlers.GET(request); }"
    ),
    TEMPLATE.replace("export const DELETE = handlers.DELETE;", ""),
    TEMPLATE.replace('"@/lib/api/account"', '"@/lib/api/unsafe"'),
    TEMPLATE.replace("const handlers", "let handlers"),
    `${TEMPLATE}\nfetch('https://example.invalid');`,
    `${TEMPLATE}\nexport const revalidate = 60;`,
    `${TEMPLATE}\nimport './extra';`,
  ])(
    "rejects swapped, incomplete, wrapped, or extended binding %#",
    async (text) => {
      expect(await fixture({ [ROUTE]: text })).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: "route-binding", file: ROUTE }),
        ])
      );
    }
  );

  it("does not allow a matching bind call to bless a naked handler", async () => {
    expect(
      await fixture({
        [ROUTE]: `import { accountApi } from "@/lib/api/account";
      accountApi.bind("auth.me");
      export function GET() { return Response.json({ unsafe: true }); }`,
      })
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "route-binding" }),
      ])
    );
  });

  it("rejects a new legacy exemption even with a registered route", async () => {
    expect(
      await fixture(
        { "app/api/v1/new/route.ts": "export function GET() {}" },
        {
          ...DEFINITIONS,
          unsafe: {
            path: "/api/v1/new",
            methods: ["GET"],
            authority: "public",
            binding: "legacy",
          },
        }
      )
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "legacy-exception" }),
      ])
    );
  });

  it("accepts an exact existing legacy entry without exempting adjacent new files", async () => {
    const definitions = {
      ...DEFINITIONS,
      "gg.models": {
        path: "/api/v1/ai/models",
        methods: ["GET"],
        authority: "gg",
        binding: "legacy",
      },
    };
    const legacy = "app/(api)/(public)/api/v1/ai/models/route.ts";
    expect(
      await fixture(
        {
          [legacy]:
            'import { NextResponse } from "next/server"; export function GET() {}',
        },
        definitions
      )
    ).toEqual([]);
    expect(
      await fixture(
        { [legacy]: "export function GET() {} export function POST() {}" },
        definitions
      )
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "legacy-methods" }),
      ])
    );
    expect(
      await fixture(
        {
          "app/other/(..)api/v1/ai/models/route.ts": "export function GET() {}",
        },
        definitions
      )
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "legacy-placement" }),
      ])
    );
  });
});

describe("apiAudit.check dependency boundaries", () => {
  it.each([
    "next/server",
    "next/headers",
    "react",
    "react-dom/server",
    "@supabase/ssr",
    "cookie",
    "@app/ui/components/button",
  ])("rejects framework, cookie, and UI package %s", async (dependency) => {
    expect(
      await fixture({ "lib/api/account.ts": `import '${dependency}';` })
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "forbidden-import",
          message: expect.stringContaining(dependency),
        }),
      ])
    );
  });

  it("follows aliases and relative re-export barrels transitively", async () => {
    expect(
      await fixture({
        "lib/api/account.ts": 'export * from "@domain/barrel";',
        "domain/barrel.ts": 'export { value } from "./deeper";',
        "domain/deeper.ts":
          'import { cookies } from "next/headers"; export const value = cookies;',
      })
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "forbidden-import",
          file: "domain/deeper.ts",
        }),
      ])
    );
  });

  it("follows a package's runtime barrel even when its declarations are harmless", async () => {
    expect(
      await fixture({
        "lib/api/account.ts": 'import { unsafe } from "hidden-ui";',
        "node_modules/hidden-ui/package.json": JSON.stringify({
          name: "hidden-ui",
          main: "index.js",
          types: "index.d.ts",
        }),
        "node_modules/hidden-ui/index.d.ts":
          "export declare const unsafe: unknown;",
        "node_modules/hidden-ui/index.js":
          'module.exports = require("./nested.js");',
        "node_modules/hidden-ui/nested.js":
          'module.exports = require("next/headers");',
      })
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "forbidden-import",
          file: "node_modules/hidden-ui/nested.js",
        }),
      ])
    );
  });

  it("checks conditional ESM exports as well as a harmless CommonJS entry", async () => {
    expect(
      await fixture({
        "lib/api/account.ts": 'import "conditional-ui";',
        "node_modules/conditional-ui/package.json": JSON.stringify({
          name: "conditional-ui",
          exports: {
            ".": {
              types: "./index.d.ts",
              import: "./esm.mjs",
              require: "./index.cjs",
            },
          },
        }),
        "node_modules/conditional-ui/index.d.ts": "export {};",
        "node_modules/conditional-ui/index.cjs": "module.exports = {};",
        "node_modules/conditional-ui/esm.mjs": 'export * from "next/headers";',
      })
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "forbidden-import",
          file: "node_modules/conditional-ui/esm.mjs",
        }),
      ])
    );
  });

  it("rejects package aliases that resolve directly to Next-owned source", async () => {
    expect(
      await fixture({
        "lib/api/account.ts": 'export * from "@/node_modules/next/hidden";',
        "node_modules/next/hidden.ts": "export const value = 1;",
      })
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "forbidden-import" }),
      ])
    );
  });

  it.each([
    "export const element = <div />;",
    '"use client"; export const value = 1;',
  ])(
    "rejects UI syntax even without a written React import %#",
    async (text) => {
      expect(await fixture({ "lib/api/hidden.tsx": text })).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: "forbidden-ui" }),
        ])
      );
    }
  );

  it.each([
    'const get = () => import("next/headers");',
    'const cookies = require("next/headers");',
    'import headers = require("next/headers");',
    'export type X = import("next/headers");',
  ])("checks each statically resolvable import form %#", async (text) => {
    expect(await fixture({ "lib/api/account.ts": text })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "forbidden-import" }),
      ])
    );
  });

  it.each([
    "const module = import(someVariable);",
    'const module = require("next/" + "headers");',
    'import { createRequire } from "node:module";',
  ])("rejects imports that cannot be audited statically %#", async (text) => {
    expect(await fixture({ "lib/api/account.ts": text })).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "computed-import" }),
      ])
    );
  });

  it("fails closed for unresolved aliases", async () => {
    expect(
      await fixture({
        "lib/api/account.ts": 'export * from "@missing/source";',
      })
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "unresolved-import" }),
      ])
    );
  });

  it.each([
    "components/hidden.ts",
    "app/hidden.ts",
    "lib/desktop/hidden.ts",
    "lib/supabase/server.ts",
  ])(
    "rejects UI/browser-owned source %s even through a neutral barrel",
    async (file) => {
      expect(
        await fixture({
          "lib/api/account.ts": 'export * from "../neutral";',
          "lib/neutral.ts": `export * from "@/${file.replace(/\.ts$/, "")}";`,
          [file]: "export const value = 1;",
        })
      ).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ code: "forbidden-source", file }),
        ])
      );
    }
  );

  it("audits newly added account/GG owner files even before a route imports them", async () => {
    expect(
      await fixture({
        "lib/account/organization.ts": 'import "react";',
        "lib/gg/mint.ts": 'import "next/headers";',
        "lib/api/account.test.ts": 'import "react";',
      })
    ).toEqual([
      expect.objectContaining({
        code: "forbidden-import",
        file: "lib/account/organization.ts",
      }),
      expect.objectContaining({
        code: "forbidden-import",
        file: "lib/gg/mint.ts",
      }),
    ]);
  });

  it("permits explicit policy/config environment owners without permitting domain reads", async () => {
    expect(
      await fixture({
        "lib/api/account.ts": 'import "../auth/oauth-server";',
        "lib/auth/oauth-server.ts":
          "export const config = () => process.env.ISSUER;",
        "lib/api/policy.ts": "export const policy = () => process.env.ORIGIN;",
      })
    ).toEqual([]);
    expect(
      await fixture({
        "lib/account/context.ts": "export const value = process.env.ISSUER;",
      })
    ).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "environment-owner",
          file: "lib/account/context.ts",
        }),
      ])
    );
  });

  it("does not execute source while auditing cycles", async () => {
    expect(
      await fixture({
        "lib/api/account.ts":
          'export * from "./cycle"; throw new Error("must never execute");',
        "lib/api/cycle.ts": 'export * from "./account";',
      })
    ).toEqual([]);
  });
});
