/** GRIDA-SEC-010 / GRIDA-SEC-012 — registered OAuth account operation binding. */
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
