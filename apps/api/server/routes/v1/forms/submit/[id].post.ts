import { defineEventHandler, getRouterParam, toWebRequest } from "h3";
import { POST } from "../../../../forms/handlers/submit";

export default defineEventHandler((event) =>
  POST(toWebRequest(event), { id: getRouterParam(event, "id")! })
);
