import {
  SYSTEM_GF_SESSION_KEY,
  SYSTEM_GF_TIMEZONE_UTC_OFFSET_KEY,
} from "@/k/system";
import { Platform } from "@/lib/platform";
import { qboolean } from "@/utils/qs";
import assert from "assert";
import type { Geo, PlatformPoweredBy } from "@/types";
import type { NextRequest } from "next/server";
import { geolocation, ipAddress } from "@vercel/functions";
import { parseGFKeys } from "@/grida-forms/lib/gfkeys";
import { haccept } from "@/utils/h";

export interface SessionMeta {
  accept: "application/json" | "text/html";
  //
  session?: string | null;
  /**
   * The offset in minutes from UTC
   */
  utc_offset?: number;
  ip: string | null;
  geo?: Geo | null;
  referer: string | null;
  browser: string | null;
  useragent: string | null;
  platform_powered_by: PlatformPoweredBy | null;
}

export function meta(
  req: NextRequest,
  data?: FormData | URLSearchParams | Map<string, string>
) {
  // console.log("ip", {
  //   ip: req.ip,
  //   "x-real-ip": req.headers.get("x-real-ip"),
  //   "x-forwarded-for": req.headers.get("x-forwarded-for"),
  // });

  // console.log("geo", req.geo);

  const system_keys = parseGFKeys(data);

  const session = system_keys[SYSTEM_GF_SESSION_KEY];
  const utc_offset = system_keys[SYSTEM_GF_TIMEZONE_UTC_OFFSET_KEY];

  const meta: SessionMeta = {
    utc_offset: utc_offset,
    session: session,
    accept: haccept(req.headers.get("accept")),
    useragent: req.headers.get("user-agent"),
    ip:
      ipAddress(req) ||
      req.headers.get("x-real-ip") ||
      req.headers.get("x-forwarded-for"),
    geo: geolocation(req),
    referer: req.headers.get("referer"),
    browser: req.headers.get("sec-ch-ua"),
    platform_powered_by: "web_client",
  };

  // optionally, developer can override the ip and geo via data body.
  // gf geo
  const __GF_GEO_LATITUDE = req.headers.get(
    Platform.headers["x-gf-geo-latitude"]
  );
  const __GF_GEO_LONGITUDE = req.headers.get(
    Platform.headers["x-gf-geo-longitude"]
  );
  const __GF_GEO_REGION = req.headers.get(Platform.headers["x-gf-geo-region"]);
  const __GF_GEO_COUNTRY = req.headers.get(
    Platform.headers["x-gf-geo-country"]
  );
  const __GF_GEO_CITY = req.headers.get(Platform.headers["x-gf-geo-city"]);

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
  const __GF_SIMULATOR_FLAG = req.headers.get(
    Platform.headers["x-gf-simulator"]
  );
  if (__GF_SIMULATOR_FLAG) {
    if (qboolean(String(__GF_SIMULATOR_FLAG))) {
      meta.platform_powered_by = "simulator";
    }
  }

  return meta;
}
