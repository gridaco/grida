export namespace TanantMiddleware {
  /**
   * grida.co is the apex domain
   *
   * can be other like canary.grida.co for branching
   */
  const EDITOR_DOMAIN = process.env.NEXT_PUBLIC_URL;

  export const analyze = function (
    host: string,
    LOCALHOST = false
  ): {
    name: string | null;
    apex: string;
    domain: string;
  } {
    const url = new URL(`http://${host}`);
    const domain = url.hostname; // strips port if any
    const parts = domain.split(".");

    if (LOCALHOST) {
      if (domain === "localhost") {
        return {
          name: null,
          apex: "localhost",
          domain: "localhost",
        };
      } else {
        return {
          name: parts[0],
          apex: "localhost",
          domain: domain,
        };
      }
    }

    if (domain === EDITOR_DOMAIN) {
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
      domain: domain,
    };
  };
}
