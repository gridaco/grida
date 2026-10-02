import { defineEventHandler, getRouterParam, toWebRequest } from "h3";
import { POST } from "../../../../../../../../forms/handlers/challenge/start";

export default defineEventHandler((event) =>
  POST(toWebRequest(event), {
    session: getRouterParam(event, "session")!,
    field: getRouterParam(event, "field")!,
  })
);
