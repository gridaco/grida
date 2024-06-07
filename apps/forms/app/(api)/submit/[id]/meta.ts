import {
  SYSTEM_X_GF_GEO_CITY_KEY,
  SYSTEM_X_GF_GEO_COUNTRY_KEY,
  SYSTEM_X_GF_GEO_LATITUDE_KEY,
  SYSTEM_X_GF_GEO_LONGITUDE_KEY,
  SYSTEM_X_GF_GEO_REGION_KEY,
  SYSTEM_X_GF_SIMULATOR_FLAG_KEY,
} from "@/k/system";
import { qboolean, qval } from "@/utils/qs";
import assert from "assert";
import type { Geo, PlatformPoweredBy } from "@/types";
import type { NextRequest } from "next/server";

export interface SessionMeta {
  accept: "application/json" | "text/html";
  //
  ip: string | null;
  geo?: Geo | null;
  referer: string | null;
  browser: string | null;
  useragent: string | null;
  platform_powered_by: PlatformPoweredBy | null;
}

export function meta(req: NextRequest, data?: FormData) {
  // console.log("ip", {
  //   ip: req.ip,
  //   "x-real-ip": req.headers.get("x-real-ip"),
  //   "x-forwarded-for": req.headers.get("x-forwarded-for"),
  // });

  // console.log("geo", req.geo);

  const meta: SessionMeta = {
    accept: haccept(req.headers.get("accept")),
    useragent: req.headers.get("user-agent"),
    ip:
      req.ip ||
      req.headers.get("x-real-ip") ||
      req.headers.get("x-forwarded-for"),
    geo: req.geo,
    referer: req.headers.get("referer"),
    browser: req.headers.get("sec-ch-ua"),
    platform_powered_by: "web_client",
  };

  // optionally, developer can override the ip and geo via data body.
  // gf geo
  const __GF_GEO_LATITUDE = req.headers.get(SYSTEM_X_GF_GEO_LATITUDE_KEY);
  const __GF_GEO_LONGITUDE = req.headers.get(SYSTEM_X_GF_GEO_LONGITUDE_KEY);
  const __GF_GEO_REGION = req.headers.get(SYSTEM_X_GF_GEO_REGION_KEY);
  const __GF_GEO_COUNTRY = req.headers.get(SYSTEM_X_GF_GEO_COUNTRY_KEY);
  const __GF_GEO_CITY = req.headers.get(SYSTEM_X_GF_GEO_CITY_KEY);

  if (
    __GF_GEO_LATITUDE ||
    __GF_GEO_LONGITUDE ||
    __GF_GEO_REGION ||
    __GF_GEO_COUNTRY ||
    __GF_GEO_CITY
  ) {
    // all or neither the lat and long should be present
    assert(
      (__GF_GEO_LATITUDE && __GF_GEO_LONGITUDE) ||
        (!__GF_GEO_LATITUDE && !__GF_GEO_LONGITUDE),
      "Both or neither latitude and longitude should be present"
    );

    meta.geo = {
      latitude: __GF_GEO_LATITUDE ? String(__GF_GEO_LATITUDE) : undefined,
      longitude: __GF_GEO_LONGITUDE ? String(__GF_GEO_LONGITUDE) : undefined,
      region: __GF_GEO_REGION ? String(__GF_GEO_REGION) : undefined,
      country: __GF_GEO_COUNTRY ? String(__GF_GEO_COUNTRY) : undefined,
      city: __GF_GEO_CITY ? String(__GF_GEO_CITY) : undefined,
    };
  }

  // gf simulator flag
  const __GF_SIMULATOR_FLAG = req.headers.get(SYSTEM_X_GF_SIMULATOR_FLAG_KEY);
  if (__GF_SIMULATOR_FLAG) {
    if (qboolean(String(__GF_SIMULATOR_FLAG))) {
      meta.platform_powered_by = "simulator";
    }
  }

  return meta;
}

/**
 * parse accept header to determine to response with json or redirect
 *
 * default fallback is json
 */
function haccept(accept?: string | null): "application/json" | "text/html" {
  if (accept) {
    if (accept.includes("application/json")) return "application/json";
    if (accept.includes("text/html")) return "text/html";
  }
  return "application/json";
}
