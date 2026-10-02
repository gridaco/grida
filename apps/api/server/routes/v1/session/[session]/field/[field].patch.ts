import { defineEventHandler, getRouterParam, toWebRequest } from "h3";
import { PATCH } from "../../../../../forms/handlers/partial";

export default defineEventHandler((event) =>
  PATCH(toWebRequest(event), {
    session: getRouterParam(event, "session")!,
    field: getRouterParam(event, "field")!,
  })
);
