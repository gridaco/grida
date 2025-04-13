export namespace TanantMiddleware {
  /**
   * grida.co is the apex domain
   *
   * can be other like canary.grida.co for branching
   */
  const EDITOR_DOMAIN = process.env.NEXT_PUBLIC_URL;

  export const analyze = function (
    url: URL,
    LOCALHOST = false
  ): {
    name: string | null;
    apex: string;
    domain: string;
  } {
    const hostname = url.hostname; // strips port if any
    const parts = hostname.split(".");

    if (LOCALHOST) {
      if (hostname === "localhost") {
        return {
          name: null,
          apex: "localhost",
          domain: "localhost",
        };
      } else {
        return {
          name: parts[0],
          apex: "localhost",
          domain: hostname,
        };
      }
    }

    if (hostname === EDITOR_DOMAIN) {
      return {
        name: null,
        apex: EDITOR_DOMAIN,
        domain: EDITOR_DOMAIN,
      };
    }

    const apex = parts.slice(-2).join("."); // e.g. "grida.site" from my-site.grida.site
    const subdomain = parts.slice(0, -2).join("."); // e.g. "my-site" from my-site.grida.site

    return {
      name: subdomain,
      apex: apex,
      domain: hostname,
    };
  };
}
