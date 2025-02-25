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
}
