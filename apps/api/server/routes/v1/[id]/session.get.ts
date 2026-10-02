import { defineEventHandler, getRouterParam, toWebRequest } from "h3";
import { GET } from "../../../forms/handlers/session";

export default defineEventHandler((event) =>
  GET(toWebRequest(event), { id: getRouterParam(event, "id")! })
);
