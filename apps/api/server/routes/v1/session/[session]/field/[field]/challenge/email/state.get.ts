import { defineEventHandler, getRouterParam, toWebRequest } from "h3";
import { GET } from "../../../../../../../../forms/handlers/challenge/state";

export default defineEventHandler((event) =>
  GET(toWebRequest(event), {
    session: getRouterParam(event, "session")!,
    field: getRouterParam(event, "field")!,
  })
);
