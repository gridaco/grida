/**
 * @fileoverview Route registry and URL builders for the Grida editor.
 *
 * This file is the **single source of truth** for all known editor routes.
 * It serves two audiences:
 *
 * 1. **Internal navigation** — {@link editorlink} builds canonical URLs for
 *    in-app links (e.g. sidebar, buttons, redirects).
 *
 * 2. **Universal docs routing** — {@link matchUniversalRoute} and
 *    {@link buildUniversalDestination} resolve `/_/<path>` shorthand URLs
 *    used in documentation to tenant-specific canonical paths at runtime.
 *    See `docs/wg/platform/universal-docs-routing.md` for the full spec.
 *
 * ## Adding a new route
 *
 * **Stable document route** (most common — no dynamic URL params):
 *   Add a single entry to {@link DOCUMENT_ROUTE_CONFIGS}. Done.
 *   It automatically appears in `EditorPageType`, `editorlink`, and the
 *   universal route registry.
 *
 * **Project-scoped route** (console/workspace pages, not tied to a document):
 *   Add an entry to {@link PROJECT_ROUTE_CONFIGS}.
 *
 * **Dynamic-segment route** (rare — needs extra URL params like `[tablename]`):
 *   1. Add to {@link DOCUMENT_ROUTE_CONFIGS} as usual.
 *   2. Add its param type to {@link DynamicEditorPageParams}.
 *   3. Add a case to the `editorlink` switch.
 */

import type { GDocumentType } from "@/types";
import type { FormSubmitErrorCode } from "@/types/private/api";
import * as ERR from "@/k/error";

// #region ─── Route registry ──────────────────────────────────────────────────

export type UniversalRouteScope = "project" | "document";

type UniversalRouteConfig = {
  scope: UniversalRouteScope;
  /** Override the URL segment (defaults to the config key). */
  path?: string;
  /** When set, the universal resolver only shows documents of these types. */
  requiredDoctypes?: ReadonlyArray<GDocumentType>;
};

/**
 * Project-scoped routes — console / workspace pages that live under
 * `/:org/:project/<path>` and do **not** require a document id.
 */
const PROJECT_ROUTE_CONFIGS = {
  project: { scope: "project", path: "" },
  dash: { scope: "project" },
  ciam: { scope: "project" },
  customers: { scope: "project" },
  "customers/policies": { scope: "project" },
  "customers/policies/new": { scope: "project" },
  tags: { scope: "project" },
  domains: { scope: "project" },
  integrations: { scope: "project" },
  analytics: { scope: "project" },
  campaigns: { scope: "project" },
  www: { scope: "project" },
} satisfies Record<string, UniversalRouteConfig>;

/**
 * Document-scoped routes — editor pages that live under
 * `/:org/:project/:docId/<path>`.
 *
 * **This is the single source of truth for stable editor pages.**
 * Keys added here automatically propagate to:
 *   - `EditorPageType` (via the `StableDocumentRouteType` mapped type)
 *   - `editorlink` (via its default case)
 *   - The universal route registry
 */
const DOCUMENT_ROUTE_CONFIGS = {
  // ── form ──────────────────────────────────────────────────
  form: { scope: "document", requiredDoctypes: ["v0_form"] },
  "form/edit": { scope: "document", requiredDoctypes: ["v0_form"] },

  // ── general ───────────────────────────────────────────────
  settings: { scope: "document" },
  design: { scope: "document" },
  canvas: { scope: "document" },

  // ── data ──────────────────────────────────────────────────
  data: { scope: "document" },
  objects: { scope: "document" },
  "data/responses": { scope: "document", requiredDoctypes: ["v0_form"] },
  "data/responses/sessions": { scope: "document", requiredDoctypes: ["v0_form"] },
  "data/analytics": { scope: "document" },
  "data/simulator": { scope: "document" },
  "data/table/~new": { scope: "document" },

  // ── connect ───────────────────────────────────────────────
  connect: { scope: "document", requiredDoctypes: ["v0_form"] },
  "connect/share": { scope: "document", requiredDoctypes: ["v0_form"] },
  "connect/parameters": { scope: "document", requiredDoctypes: ["v0_form"] },
  "connect/customer": { scope: "document", requiredDoctypes: ["v0_form"] },
  "connect/channels": { scope: "document", requiredDoctypes: ["v0_form"] },
  "connect/store": { scope: "document", requiredDoctypes: ["v0_form"] },
  "connect/store/get-started": { scope: "document", requiredDoctypes: ["v0_form"] },
  "connect/store/products": { scope: "document", requiredDoctypes: ["v0_form"] },
  "connect/database/supabase": { scope: "document", requiredDoctypes: ["v0_form", "v0_schema"] },
} satisfies Record<string, UniversalRouteConfig>;

/** Stable document route keys — derived directly from the config above. */
type StableDocumentRouteType = keyof typeof DOCUMENT_ROUTE_CONFIGS;

/** Merged registry of all project + document routes. */
const UNIVERSAL_ROUTE_CONFIGS = {
  ...PROJECT_ROUTE_CONFIGS,
  ...DOCUMENT_ROUTE_CONFIGS,
} satisfies Record<string, UniversalRouteConfig>;

/** All registered universal route keys. */
export type UniversalRouteType = keyof typeof UNIVERSAL_ROUTE_CONFIGS;

// #endregion

// #region ─── Editor page types ───────────────────────────────────────────────

/**
 * Routes with dynamic segments that require extra URL parameters.
 * These are the only routes that need manual handling in `editorlink`.
 */
type DynamicEditorPageParams = {
  ".": {};
  "objects/[[...path]]": { path?: string[] };
  "data/table/[tablename]": { tablename: string };
  "data/table/[tablename]/definition": { tablename: string };
};

/** Stable routes all take empty params — derived from the route registry. */
type StableEditorPageParams = { [K in StableDocumentRouteType]: {} };

type EditorPageParamsMap = StableEditorPageParams & DynamicEditorPageParams;

/** Union of every known editor page key (stable + dynamic). */
export type EditorPageType = keyof EditorPageParamsMap;

// #endregion

// #region ─── editorlink ──────────────────────────────────────────────────────

type BaseEditorLinkParamsOptionalSeed =
  | { org: string; proj: string }
  | { basepath: string };

type BaseEditorLinkParams = {
  origin?: string;
  document_id: string;
} & BaseEditorLinkParamsOptionalSeed;

/**
 * Build a canonical editor URL for the given page.
 *
 * Dynamic-segment routes (`.`, `objects/[[...path]]`, `data/table/[tablename]`,
 * etc.) are handled by explicit switch cases. Every other stable route is
 * handled by the default `/${basepath}/${id}/${page}` pattern, so new routes
 * registered in {@link DOCUMENT_ROUTE_CONFIGS} work automatically.
 */
export function editorlink<P extends EditorPageType>(
  page: P,
  {
    origin = "",
    document_id: id,
    ...params
  }: BaseEditorLinkParams & EditorPageParamsMap[P]
) {
  const basepath = editorbasepath(params);

  switch (page) {
    case ".":
      return `${origin}/${basepath}/${id}`;
    case "objects/[[...path]]": {
      const { path } = params as unknown as { path?: string[] };
      if (path) return `${origin}/${basepath}/${id}/objects/${path.join("/")}`;
      return `${origin}/${basepath}/${id}/objects`;
    }
    case "data/table/[tablename]": {
      const { tablename } = params as unknown as { tablename: string };
      return `${origin}/${basepath}/${id}/data/table/${tablename}`;
    }
    case "data/table/[tablename]/definition": {
      const { tablename } = params as unknown as { tablename: string };
      return `${origin}/${basepath}/${id}/data/table/${tablename}/definition`;
    }
  }

  // All stable document routes follow /:org/:proj/:docId/<page>.
  return `${origin}/${basepath}/${id}/${page}`;
}

export function editorbasepath(
  params: { org: string; proj: string } | { basepath: string }
) {
  if ("basepath" in params) return params.basepath;
  return `${params.org}/${params.proj}`;
}

// #endregion

// #region ─── Universal docs routing ──────────────────────────────────────────
//
// Resolves /_/<path> shorthand to a canonical tenant-specific URL.
// See docs/wg/platform/universal-docs-routing.md for the full spec.
// ─────────────────────────────────────────────────────────────────────────────

export type UniversalRouteDefinition = {
  id: UniversalRouteType;
  /** Route path without the `/_/` prefix. Example: `"connect/share"` */
  path: string;
  scope: UniversalRouteScope;
  requiredDoctypes?: ReadonlyArray<GDocumentType>;
  /** Sample path used by the collision-prevention uniqueness test. */
  samplePath: string;
};

/** Strip leading/trailing slashes and collapse repeated slashes. */
export function normalizeUniversalPath(path: string) {
  return path
    .trim()
    .replace(/^\/+/, "")
    .replace(/\/+$/, "")
    .replace(/\/{2,}/g, "/");
}

export function getUniversalRouteDefinition(
  id: UniversalRouteType
): UniversalRouteDefinition {
  const config: UniversalRouteConfig = UNIVERSAL_ROUTE_CONFIGS[id];
  const path = config.path ?? id;
  return {
    id,
    path,
    scope: config.scope,
    requiredDoctypes: config.requiredDoctypes,
    samplePath: path,
  };
}

/** Pre-built list of all universal route definitions. */
export const universalRoutes: UniversalRouteDefinition[] = (
  Object.keys(UNIVERSAL_ROUTE_CONFIGS) as UniversalRouteType[]
).map(getUniversalRouteDefinition);

/** Find all routes whose path matches the given universal path. */
export function matchUniversalRoute(path: string) {
  const normalized = normalizeUniversalPath(path);
  return universalRoutes.filter(
    (route) => normalizeUniversalPath(route.path) === normalized
  );
}

// ── Context types ───────────────────────────────────────────

export type UniversalRouteContext = {
  org: string;
  proj: string;
  docId?: string | null;
};

type UniversalRouteContextFor<P extends UniversalRouteType> =
  (typeof UNIVERSAL_ROUTE_CONFIGS)[P]["scope"] extends "document"
    ? { org: string; proj: string; docId: string }
    : { org: string; proj: string };

/** Strict overload: when the exact route literal is known at compile time. */
export function buildUniversalDestination<P extends UniversalRouteType>(
  page: P,
  context: UniversalRouteContextFor<P>
): string;
/** Loose overload: when the route is a dynamic `UniversalRouteType` union. */
export function buildUniversalDestination(
  page: UniversalRouteType,
  context: UniversalRouteContext
): string;
export function buildUniversalDestination(
  page: UniversalRouteType,
  context: UniversalRouteContext
) {
  const route = getUniversalRouteDefinition(page);
  const base = `/${context.org}/${context.proj}`;
  const suffix = normalizeUniversalPath(route.path);

  if (route.scope === "project") {
    return suffix ? `${base}/${suffix}` : base;
  }

  const docId = "docId" in context ? context.docId : "";
  return suffix ? `${base}/${docId}/${suffix}` : `${base}/${docId}`;
}

// #endregion

// #region ─── Form & error link utilities ─────────────────────────────────────

export function resolve_next(
  origin: string,
  uri?: string | null,
  fallback = "/"
) {
  if (!uri) return resolve_next(origin, fallback);
  const isAbsolute = /^https?:\/\//i.test(uri);
  if (isAbsolute) return uri;
  return new URL(uri, origin).toString();
}

export interface FormLinkURLParams {
  alreadyresponded: {
    fingerprint?: string;
    customer_id?: string;
    session_id?: string;
  };
  complete: { rid: string };
  developererror?: {};
  badrequest?: {};
  formclosed: {
    oops?:
      | typeof ERR.FORM_CLOSED_WHILE_RESPONDING.code
      | typeof ERR.FORM_SCHEDULE_NOT_IN_RANGE.code;
  };
  formsoldout?: {};
  formoptionsoldout?: {};
}

type ParamsForState<T extends keyof FormLinkURLParams> =
  T extends keyof FormLinkURLParams ? FormLinkURLParams[T] : never;

type FormLinkParams<T extends keyof FormLinkURLParams> =
  | [host: string, form_id: string, state: T, params: ParamsForState<T>]
  | [host: string, form_id: string, state?: T, params?: ParamsForState<T>];

export function formlink<T extends keyof FormLinkURLParams>(
  ...[host, form_id, state, params]: FormLinkParams<T>
) {
  const q = params ? new URLSearchParams(params as any).toString() : null;
  let url = state
    ? `${host}/d/e/${form_id}/${state}`
    : `${host}/d/e/${form_id}`;
  if (q) url += `?${q}`;
  return url;
}

export function formerrorlink(
  host: string,
  code: FormSubmitErrorCode,
  data: { form_id: string; [key: string]: any }
) {
  const { form_id } = data;

  switch (code) {
    case "INTERNAL_SERVER_ERROR":
      return formlink(host, form_id, "developererror");
    case "MISSING_REQUIRED_HIDDEN_FIELDS":
      return formlink(host, form_id, "badrequest", {
        error: ERR.MISSING_REQUIRED_HIDDEN_FIELDS.code,
      });
    case "UNKNOWN_FIELDS_NOT_ALLOWED":
      return formlink(host, form_id, "badrequest", {
        error: ERR.UNKNOWN_FIELDS_NOT_ALLOWED.code,
      });
    case "FORM_FORCE_CLOSED":
      return formlink(host, form_id, "formclosed", {
        oops: ERR.FORM_CLOSED_WHILE_RESPONDING.code,
      });
    case "FORM_CLOSED_WHILE_RESPONDING":
      return formlink(host, form_id, "formclosed", {
        oops: ERR.FORM_CLOSED_WHILE_RESPONDING.code,
      });
    case "FORM_RESPONSE_LIMIT_REACHED":
      return formlink(host, form_id, "formclosed", {
        oops: ERR.FORM_CLOSED_WHILE_RESPONDING.code,
      });
    case "FORM_RESPONSE_LIMIT_BY_CUSTOMER_REACHED":
      return formlink(host, form_id, "alreadyresponded", {
        fingerprint: data.fingerprint,
        customer_id: data.customer_id,
        session_id: data.session_id,
      });
    case "FORM_SCHEDULE_NOT_IN_RANGE":
      return formlink(host, form_id, "formclosed", {
        oops: ERR.FORM_SCHEDULE_NOT_IN_RANGE.code,
      });
    case "FORM_SOLD_OUT":
      return formlink(host, form_id, "formsoldout");
    case "FORM_OPTION_UNAVAILABLE":
      return formlink(host, form_id, "formoptionsoldout");
    case "CHALLENGE_EMAIL_NOT_VERIFIED":
      return formlink(host, form_id, "badrequest", {
        error: "CHALLENGE_EMAIL_NOT_VERIFIED",
      } as any);
  }
}

// #endregion
