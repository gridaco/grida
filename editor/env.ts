export namespace Env {
  export const gridaco = "https://grida.co";

  /**
   * for server requests
   */
  export namespace server {
    export const HOST = process.env.VERCEL_URL
      ? // VERCEL_URL does not have protocol
        "https://" + process.env.VERCEL_URL
      : "http://localhost:3000";

    /**
     * vercel url with protocol scheme
     * @example
     * https://git-branch-name.vercel.app
     *
     * only available on hosted environment
     */
    export const VERCEL_URL = "https://" + process.env.VERCEL_URL; // VERCEL_URL does not have protocol

    /**
     * if running on a hosted (vercel) environment
     */
    export const IS_HOSTED = process.env.VERCEL === "1";
  }

  export namespace storage {
    /**
     * public, temporary file uploader to playground bucket
     * for internal dev or public tmp playgrounds
     *
     * @public true
     */
    export const BUCKET_DUMMY = "dummy";

    /**
     * form media files (not response uploads)
     *
     * @public true
     */
    export const BUCKET_GRIDA_FORMS = "grida-forms";

    /**
     * private asset files
     *
     * @private
     */
    export const BUCKET_ASSETS = "assets";

    /**
     * public asset files
     *
     * for user uploaded contents in public cms
     *
     * @public
     */
    export const BUCKET_ASSETS_PUBLIC = "assets-public";
  }

  /**
   * anything related to web & client side (next public)
   */
  export namespace web {
    export const HOST = process.env.NEXT_PUBLIC_URL
      ? // VERCEL_URL does not have protocol
        "https://" + process.env.NEXT_PUBLIC_URL
      : "http://localhost:3000";
  }

  /** Public Forms API origin. Resolved only when a Forms operation is used. */
  export const forms = {
    get API_ORIGIN(): string {
      const configured = process.env.NEXT_PUBLIC_GRIDA_OPEN_API_ORIGIN;
      if (!configured) {
        if (
          process.env.NODE_ENV === "production" ||
          process.env.VERCEL_ENV === "production" ||
          process.env.VERCEL_ENV === "preview"
        ) {
          throw new Error(
            "NEXT_PUBLIC_GRIDA_OPEN_API_ORIGIN is required for Forms."
          );
        }
        return "http://localhost:4000";
      }
      let url: URL;
      try {
        url = new URL(configured);
      } catch {
        throw new Error(
          "NEXT_PUBLIC_GRIDA_OPEN_API_ORIGIN must be an HTTP(S) origin."
        );
      }
      const loopback = ["localhost", "127.0.0.1", "[::1]"].includes(
        url.hostname
      );
      if (
        (url.protocol !== "https:" &&
          !(url.protocol === "http:" && loopback)) ||
        url.username ||
        url.password ||
        url.pathname !== "/" ||
        url.search ||
        url.hash
      ) {
        throw new Error(
          "NEXT_PUBLIC_GRIDA_OPEN_API_ORIGIN must be an HTTPS origin (HTTP is allowed only on loopback)."
        );
      }
      return url.origin;
    },
  };
}
