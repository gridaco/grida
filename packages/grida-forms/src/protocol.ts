/** Recorded Forms submission source; metadata does not establish caller authority. */
export type PlatformPoweredBy =
  | "api"
  | "grida_forms"
  | "web_client"
  | "simulator";

/** Public Forms request metadata. These headers do not establish identity. */
export const FormsRequestHeaders = {
  "x-gf-geo-latitude": "x-gf-geo-latitude",
  "x-gf-geo-longitude": "x-gf-geo-longitude",
  "x-gf-geo-region": "x-gf-geo-region",
  "x-gf-geo-country": "x-gf-geo-country",
  "x-gf-geo-city": "x-gf-geo-city",
  "x-gf-simulator": "x-gf-simulator",
} as const;

/** Forms response-file conventions; storage clients and authorization are host-owned. */
export const FormsStorage = {
  bucket: "grida-forms-response",
  temporaryFolder: "tmp",
  maxUploadBytes: 52_428_800,
  maxMultipartFileBytes: 5_242_880,
  maxFilesPerField: 10,
} as const;
