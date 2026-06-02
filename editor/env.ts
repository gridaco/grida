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
}
