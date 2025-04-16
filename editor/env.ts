export namespace Env {
  /**
   * for server requests
   */
  export namespace server {
    export const HOST = process.env.VERCEL_URL
      ? // VERCEL_URL does not have protocol
        "https://" + process.env.VERCEL_URL
      : "http://localhost:3000";
  }

  /**
   * anything related to web & client side
   */
  export namespace web {
    export const HOST = process.env.NEXT_PUBLIC_URL
      ? // VERCEL_URL does not have protocol
        "https://" + process.env.NEXT_PUBLIC_URL
      : "http://localhost:3000";
  }

  export namespace vercel {
    /**
     * @see https://vercel.com/docs/edge-network/regions
     */
    export const regions = [
      ["arn1", "eu-north-1", "Stockholm, Sweden"],
      ["bom1", "ap-south-1", "Mumbai, India"],
      ["cdg1", "eu-west-3", "Paris, France"],
      ["cle1", "us-east-2", "Cleveland, USA"],
      ["cpt1", "af-south-1", "Cape Town, South Africa"],
      ["dub1", "eu-west-1", "Dublin, Ireland"],
      ["fra1", "eu-central-1", "Frankfurt, Germany"],
      ["gru1", "sa-east-1", "São Paulo, Brazil"],
      ["hkg1", "ap-east-1", "Hong Kong"],
      ["hnd1", "ap-northeast-1", "Tokyo, Japan"],
      ["iad1", "us-east-1", "Washington, D.C., USA"],
      ["icn1", "ap-northeast-2", "Seoul, South Korea"],
      ["kix1", "ap-northeast-3", "Osaka, Japan"],
      ["lhr1", "eu-west-2", "London, United Kingdom"],
      ["pdx1", "us-west-2", "Portland, USA"],
      ["sfo1", "us-west-1", "San Francisco, USA"],
      ["sin1", "ap-southeast-1", "Singapore"],
      ["syd1", "ap-southeast-2", "Sydney, Australia"],
    ] as const;

    export type VercelRegionCode = (typeof regions)[number][0];
    export type VercelRegionName = (typeof regions)[number][1];

    /**
     * Resolves a Vercel region code (e.g., "sfo1", "icn1") to a known AWS-style region name
     * used internally for Supabase routing and infrastructure selection.
     *
     * If the region code is not recognized, it falls back to "localhost".
     *
     * @param region - Vercel edge region code, typically from `geolocation().region`
     * @returns A Supabase-compatible AWS region name or "localhost"
     *
     * @see https://vercel.com/docs/edge-network/regions
     */
    export function region(
      region: VercelRegionCode | "dev1" | undefined | (string & {})
    ): VercelRegionName | "localhost" | undefined {
      if (!region) return undefined;
      if (region === "dev1") return "localhost";
      const match = regions.find(([code]) => code === region);
      return match?.[1] ?? undefined;
    }
  }

  /**
   * supabase infra - envs are available for bothe server and client
   *
   * @see https://supabase.com/docs/guides/platform/regions
   *
   *
   * @example if your main region is us-west-1, have it also set as rr.
   * ```txt
   * NEXT_PUBLIC_SUPABASE_URL="https://primary.supabase.co"
   * NEXT_PUBLIC_SUPABASE_URL_RR_US_WEST_1="https://primary.supabase.co" # set as rr, even if it is primary
   * NEXT_PUBLIC_SUPABASE_URL_RR_AP_NORTHEAST_2="https://primary-rr-ap-northeast-2-xyz.supabase.co"
   * NEXT_PUBLIC_SUPABASE_URL_RR_...
   * ```
   *
   * @remark
   * set `NEXT_PUBLIC_GRIDA_LOCALHOST_REGION` to the region you want to use for localhost
   */
  export namespace supabase {
    /**
     * [Primary]
     */
    export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;

    /**
     * [Replica] - us-west-1 - West US (North California)
     */
    export const SUPABASE_URL_RR_US_WEST_1 =
      process.env.NEXT_PUBLIC_SUPABASE_URL_RR_US_WEST_1;

    /**
     * [Replica] - us-east-1 - East US (North Virginia)
     */
    export const SUPABASE_URL_RR_US_EAST_1 =
      process.env.NEXT_PUBLIC_SUPABASE_URL_RR_US_EAST_1;

    /**
     * [Replica] - us-east-2 - East US (Ohio)
     */
    export const SUPABASE_URL_RR_US_EAST_2 =
      process.env.NEXT_PUBLIC_SUPABASE_URL_RR_US_EAST_2;

    /**
     * [Replica] - ca-central-1 - Canada (Central)
     */
    export const SUPABASE_URL_RR_CA_CENTRAL_1 =
      process.env.NEXT_PUBLIC_SUPABASE_URL_RR_CA_CENTRAL_1;

    /**
     * [Replica] - eu-west-1 - West EU (Ireland)
     */
    export const SUPABASE_URL_RR_EU_WEST_1 =
      process.env.NEXT_PUBLIC_SUPABASE_URL_RR_EU_WEST_1;

    /**
     * [Replica] - eu-west-2 - West Europe (London)
     */
    export const SUPABASE_URL_RR_EU_WEST_2 =
      process.env.NEXT_PUBLIC_SUPABASE_URL_RR_EU_WEST_2;

    /**
     * [Replica] - eu-west-3 - West EU (Paris)
     */
    export const SUPABASE_URL_RR_EU_WEST_3 =
      process.env.NEXT_PUBLIC_SUPABASE_URL_RR_EU_WEST_3;

    /**
     * [Replica] - eu-central-1 - Central EU (Frankfurt)
     */
    export const SUPABASE_URL_RR_EU_CENTRAL_1 =
      process.env.NEXT_PUBLIC_SUPABASE_URL_RR_EU_CENTRAL_1;

    /**
     * [Replica] - eu-central-2 - Central Europe (Zurich)
     */
    export const SUPABASE_URL_RR_EU_CENTRAL_2 =
      process.env.NEXT_PUBLIC_SUPABASE_URL_RR_EU_CENTRAL_2;

    /**
     * [Replica] - eu-north-1 - North EU (Stockholm)
     */
    export const SUPABASE_URL_RR_EU_NORTH_1 =
      process.env.NEXT_PUBLIC_SUPABASE_URL_RR_EU_NORTH_1;

    /**
     * [Replica] - ap-south-1 - South Asia (Mumbai)
     */
    export const SUPABASE_URL_RR_AP_SOUTH_1 =
      process.env.NEXT_PUBLIC_SUPABASE_URL_RR_AP_SOUTH_1;

    /**
     * [Replica] - ap-southeast-1 - Southeast Asia (Singapore)
     */
    export const SUPABASE_URL_RR_AP_SOUTHEAST_1 =
      process.env.NEXT_PUBLIC_SUPABASE_URL_RR_AP_SOUTHEAST_1;

    /**
     * [Replica] - ap-northeast-1 - Northeast Asia (Tokyo)
     */
    export const SUPABASE_URL_RR_AP_NORTHEAST_1 =
      process.env.NEXT_PUBLIC_SUPABASE_URL_RR_AP_NORTHEAST_1;

    /**
     * [Replica] - ap-northeast-2 - Northeast Asia (Seoul)
     */
    export const SUPABASE_URL_RR_AP_NORTHEAST_2 =
      process.env.NEXT_PUBLIC_SUPABASE_URL_RR_AP_NORTHEAST_2;

    /**
     * [Replica] - ap-southeast-2 - Oceania (Sydney)
     */
    export const SUPABASE_URL_RR_AP_SOUTHEAST_2 =
      process.env.NEXT_PUBLIC_SUPABASE_URL_RR_AP_SOUTHEAST_2;

    /**
     * [Replica] - sa-east-1 - South America (São Paulo)
     */
    export const SUPABASE_URL_RR_SA_EAST_1 =
      process.env.NEXT_PUBLIC_SUPABASE_URL_RR_SA_EAST_1;

    export type SupabaseRegion =
      | "us-west-1"
      | "us-east-1"
      | "us-east-2"
      | "ca-central-1"
      | "eu-west-1"
      | "eu-west-2"
      | "eu-west-3"
      | "eu-central-1"
      | "eu-central-2"
      | "eu-north-1"
      | "ap-south-1"
      | "ap-southeast-1"
      | "ap-northeast-1"
      | "ap-northeast-2"
      | "ap-southeast-2"
      | "sa-east-1";

    /**
     * [rr] - read replica mapping
     */
    export const SUPABASE_READ_REPLICAL_URLS: Record<
      SupabaseRegion,
      string | undefined
    > = {
      "us-west-1": SUPABASE_URL_RR_US_WEST_1,
      "us-east-1": SUPABASE_URL_RR_US_EAST_1,
      "us-east-2": SUPABASE_URL_RR_US_EAST_2,
      "ca-central-1": SUPABASE_URL_RR_CA_CENTRAL_1,
      "eu-west-1": SUPABASE_URL_RR_EU_WEST_1,
      "eu-west-2": SUPABASE_URL_RR_EU_WEST_2,
      "eu-west-3": SUPABASE_URL_RR_EU_WEST_3,
      "eu-central-1": SUPABASE_URL_RR_EU_CENTRAL_1,
      "eu-central-2": SUPABASE_URL_RR_EU_CENTRAL_2,
      "eu-north-1": SUPABASE_URL_RR_EU_NORTH_1,
      "ap-south-1": SUPABASE_URL_RR_AP_SOUTH_1,
      "ap-southeast-1": SUPABASE_URL_RR_AP_SOUTHEAST_1,
      "ap-northeast-1": SUPABASE_URL_RR_AP_NORTHEAST_1,
      "ap-northeast-2": SUPABASE_URL_RR_AP_NORTHEAST_2,
      "ap-southeast-2": SUPABASE_URL_RR_AP_SOUTHEAST_2,
      "sa-east-1": SUPABASE_URL_RR_SA_EAST_1,
    } as const;

    /**
     * Static fallback mapping for each supabase region in case a specific Supabase read replica
     * is not configured or unavailable. This allows graceful degradation to the next
     * geographically closest or lowest-latency region.
     *
     * The keys are supabase region codes, and the values are ordered fallback preferences.
     * At runtime, the application can iterate this list to find the nearest working replica.
     *
     * @example
     * // If ap-northeast-2 (Seoul) is unavailable, fallback to Tokyo, then Singapore
     * physical_fallback_regions["ap-northeast-2"] === ["ap-northeast-1", "ap-southeast-1"]
     *
     * supabase supports partial region compared to aws. this map only holds the supabase region
     *
     * @see https://supabase.com/docs/guides/platform/regions
     */
    // prettier-ignore
    export const supabase_region_to_fallback_region: Record<SupabaseRegion, SupabaseRegion[]> = {
      "us-west-1": [ "us-east-1", "us-east-2", "ca-central-1", "sa-east-1"],
      "us-east-1": ["us-east-2", "us-west-1", "ca-central-1", "sa-east-1", "eu-west-1"],
      "us-east-2": ["us-east-1", "us-west-1", "ca-central-1", "sa-east-1", "eu-west-1"],
      "ca-central-1": ["us-east-1", "us-east-2", "us-west-1", "eu-west-1", "sa-east-1"],
      "eu-west-1": ["eu-west-2", "eu-central-1", "eu-west-3", "eu-north-1", "ca-central-1"],
      "eu-west-2": ["eu-west-1", "eu-central-1", "eu-west-3", "eu-north-1", "ca-central-1"],
      "eu-west-3": ["eu-west-1", "eu-central-1", "eu-west-2", "eu-north-1", "ca-central-1"],
      "eu-central-1": ["eu-west-1", "eu-central-2", "eu-west-2", "eu-north-1", "ca-central-1"],
      "eu-central-2": ["eu-central-1", "eu-west-1", "eu-west-2", "eu-north-1", "ca-central-1"],
      "eu-north-1": ["eu-central-1", "eu-west-1", "eu-west-2", "eu-central-2", "ca-central-1"],
      "ap-south-1": ["ap-southeast-1", "ap-northeast-1", "ap-northeast-2", "ap-southeast-2", "eu-central-1"],
      "ap-southeast-1": ["ap-southeast-2", "ap-northeast-1", "ap-northeast-2", "ap-south-1", "eu-central-1"],
      "ap-northeast-1": ["ap-northeast-2", "ap-southeast-1", "ap-southeast-2", "ap-south-1", "eu-central-1"],
      "ap-northeast-2": ["ap-northeast-1", "ap-southeast-1", "ap-southeast-2", "ap-south-1", "eu-central-1"],
      "ap-southeast-2": ["ap-southeast-1", "ap-northeast-1", "ap-northeast-2", "ap-south-1", "eu-central-1"],
      "sa-east-1": ["us-east-1", "us-east-2", "us-west-1", "ca-central-1", "eu-west-1"],
    };

    /**
     * Maps full AWS regions to the nearest Supabase-supported region.
     * This is useful when a runtime environment (e.g., Vercel) reports a region
     * where Supabase does not operate, allowing graceful alignment to the closest valid region.
     *
     * @example
     * // Maps Vercel's us-west-2 (Oregon) to Supabase's us-west-1 (California)
     */
    export const aws_to_supabase_region: Record<string, SupabaseRegion> = {
      "us-west-1": "us-west-1",
      "us-west-2": "us-west-1", // Oregon → California
      "us-east-1": "us-east-1",
      "us-east-2": "us-east-2",
      "ca-central-1": "ca-central-1",
      "eu-west-1": "eu-west-1",
      "eu-west-2": "eu-west-2",
      "eu-west-3": "eu-west-3",
      "eu-central-1": "eu-central-1",
      "eu-central-2": "eu-central-2",
      "eu-north-1": "eu-north-1",
      "ap-south-1": "ap-south-1",
      "ap-northeast-1": "ap-northeast-1",
      "ap-northeast-2": "ap-northeast-2",
      "ap-southeast-1": "ap-southeast-1",
      "ap-southeast-2": "ap-southeast-2",
      "sa-east-1": "sa-east-1",

      // Unavailable AWS regions mapped to closest Supabase-supported ones
      "af-south-1": "eu-west-3", // Cape Town → Paris
      "me-south-1": "eu-central-1", // Bahrain → Frankfurt
      "me-central-1": "eu-central-1", // UAE → Frankfurt
      "ap-east-1": "ap-northeast-2", // Hong Kong → Seoul
      "eu-south-1": "eu-central-1", // Milan → Frankfurt
      "eu-south-2": "eu-central-1", // Spain → Frankfurt
      "eu-central-3": "eu-central-1", // Zurich fallback
      "ap-southeast-3": "ap-southeast-1", // Jakarta → Singapore
    };

    /**
     * Resolves the best Supabase read replica URL based on the provided AWS region.
     *
     * If the region is not defined, not recognized, or no replica is configured for it,
     * the function will fall back to the nearest geographically relevant regions
     * as defined in `supabase_region_to_fallback_region`.
     *
     * If no configured replica is found from the fallback list, the function defaults to the primary Supabase URL.
     *
     * @param region - AWS region (e.g., "us-west-2" from Vercel's `req.geo.region`)
     * @returns Supabase URL to use for read operations
     */
    export function rr(region?: string | null | undefined): string {
      if (region === "localhost")
        region = process.env.NEXT_PUBLIC_GRIDA_LOCALHOST_REGION;
      if (!region) return SUPABASE_URL!;

      const sbregion = aws_to_supabase_region[region] as
        | SupabaseRegion
        | undefined;
      if (!sbregion) return SUPABASE_URL!;

      const candidates = [
        sbregion,
        ...(supabase_region_to_fallback_region[sbregion] ?? []),
      ];

      for (const candidate of candidates) {
        const url = SUPABASE_READ_REPLICAL_URLS[candidate];
        if (url) return url;
      }

      return SUPABASE_URL!;
    }
  }
}
