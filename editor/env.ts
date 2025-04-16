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

  /**
   * supabase infra - envs are available for bothe server and client
   */
  export namespace supabase {
    /**
     * [Primary] -
     */
    export const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;

    /**
     * [Replica] - ap-northeast-1 (Tokyo)
     */
    export const SUPABASE_URL_RR_AP_NORTHEAST_1 =
      process.env.NEXT_PUBLIC_SUPABASE_URL_RR_AP_NORTHEAST_1;

    /**
     * [Replica] - ap-northeast-2 (Seoul)
     */
    export const SUPABASE_URL_RR_AP_NORTHEAST_2 =
      process.env.NEXT_PUBLIC_SUPABASE_URL_RR_AP_NORTHEAST_2;
  }
}
