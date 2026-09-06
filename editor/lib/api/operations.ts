/** GRIDA-SEC-012 — the complete machine API inventory; new routes require a binding. */
export namespace apiOperations {
  export type Definition = Readonly<{
    path: string;
    methods: readonly string[];
    authority: "native-account" | "gg" | "public";
    binding: "account" | "legacy";
    cache: "no-store" | "owner" | "public";
  }>;

  // The six legacy bindings preserve existing gateway/catalogue contracts.
  // Their exact paths and method exports are also pinned by the source audit;
  // adding another exception is a deliberate boundary change.
  export const definitions = {
    "auth.me": {
      path: "/api/v1/auth/me",
      methods: ["GET", "HEAD", "OPTIONS"],
      authority: "native-account",
      binding: "account",
      cache: "no-store",
    },
    "account.organizations": {
      path: "/api/v1/account/organizations",
      methods: ["GET", "HEAD", "OPTIONS"],
      authority: "native-account",
      binding: "account",
      cache: "no-store",
    },
    // GRIDA-EE: billing — cached credit observation, never provider work.
    "account.credits": {
      path: "/api/v1/account/credits",
      methods: ["GET", "HEAD", "OPTIONS"],
      authority: "native-account",
      binding: "account",
      cache: "no-store",
    },
    "gg.chat": {
      path: "/api/v1/ai/chat/completions",
      methods: ["POST"],
      authority: "gg",
      binding: "legacy",
      cache: "owner",
    },
    "gg.models": {
      path: "/api/v1/ai/models",
      methods: ["GET"],
      authority: "gg",
      binding: "legacy",
      cache: "owner",
    },
    "gg.images": {
      path: "/api/v1/ai/images/generations",
      methods: ["POST"],
      authority: "gg",
      binding: "legacy",
      cache: "owner",
    },
    "gg.videos": {
      path: "/api/v1/ai/videos/generations",
      methods: ["POST"],
      authority: "gg",
      binding: "legacy",
      cache: "owner",
    },
    "gg.music": {
      path: "/api/v1/ai/music/generations",
      methods: ["POST"],
      authority: "gg",
      binding: "legacy",
      cache: "owner",
    },
    "models.catalog": {
      path: "/api/v1/models/catalog",
      methods: ["GET"],
      authority: "public",
      binding: "legacy",
      cache: "public",
    },
  } as const satisfies Record<string, Definition>;

  export type Id = keyof typeof definitions;

  export function find(path: string): Definition | undefined {
    return Object.values(definitions).find(
      (operation) => operation.path === path
    );
  }
}
