export namespace Env {
  /**
   * available on server side only
   */
  export namespace server {
    export const HOST = process.env.VERCEL_URL
      ? // VERCEL_URL does not have protocol
        "https://" + process.env.VERCEL_URL
      : "http://localhost:3000";
  }

  export namespace client {
    export const HOST = process.env.NEXT_PUBLIC_VERCEL_URL
      ? // VERCEL_URL does not have protocol
        "https://" + process.env.NEXT_PUBLIC_VERCEL_URL
      : "http://localhost:3000";
  }
}
