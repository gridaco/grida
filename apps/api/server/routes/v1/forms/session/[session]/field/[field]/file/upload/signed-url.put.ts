import { defineEventHandler, getRouterParam, toWebRequest } from "h3";
import { PUT } from "../../../../../../../../../forms/handlers/upload";

export default defineEventHandler((event) =>
  PUT(toWebRequest(event), {
    session: getRouterParam(event, "session")!,
    field: getRouterParam(event, "field")!,
  })
);
