// GRIDA-GG: token — native OAuth-to-GG exchange.
// GRIDA-SEC-006 / GRIDA-SEC-010 / GRIDA-SEC-012
import { ggApi } from "@/lib/api/gg";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const handlers = ggApi.bind("gg.access");
export const GET = handlers.GET;
export const HEAD = handlers.HEAD;
export const OPTIONS = handlers.OPTIONS;
export const POST = handlers.POST;
export const PUT = handlers.PUT;
export const PATCH = handlers.PATCH;
export const DELETE = handlers.DELETE;
