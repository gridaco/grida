import { defineEventHandler, getRouterParam, toWebRequest } from "h3";
import { POST } from "../../../../../../../../forms/handlers/upload";

export default defineEventHandler((event) =>
  POST(toWebRequest(event), {
    session: getRouterParam(event, "session")!,
    field: getRouterParam(event, "field")!,
  })
);
