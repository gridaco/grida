// GRIDA-SEC-012 — fixed public catalog binding, never native or GG credentials.
import { catalogApi } from "@/lib/api/catalog";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handlers = catalogApi.bind("models.catalog.v2");

export const GET = handlers.GET;
export const HEAD = handlers.HEAD;
export const OPTIONS = handlers.OPTIONS;
export const POST = handlers.POST;
export const PUT = handlers.PUT;
export const PATCH = handlers.PATCH;
export const DELETE = handlers.DELETE;
