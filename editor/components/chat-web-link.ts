/** Select a decorative icon from the destination of a web link. */
export function chatWebLinkIcon(href: string | null | undefined) {
  if (!href) return undefined;

  let url: URL;
  try {
    url = new URL(href);
  } catch {
    return undefined;
  }

  if (url.protocol !== "https:" && url.protocol !== "http:") return undefined;

  const host = url.hostname.replace(/^www\./, "");
  switch (host) {
    case "grida.co":
      return "grida";
    case "github.com":
    case "gist.github.com":
      return "github";
    case "figma.com":
      return "figma";
    case "linear.app":
      return "linear";
    case "docs.google.com": {
      const product = url.pathname.replace(/^\/a\/[^/]+\//, "/").split("/")[1];
      return product === "document" || product === "spreadsheets"
        ? "google-drive"
        : "globe";
    }
    case "drive.google.com":
      return "google-drive";
    case "slack.com":
      return "slack";
    case "notion.com":
    case "notion.so":
    case "notion.site":
      return "notion";
  }
  if (host.endsWith(".slack.com")) return "slack";
  if (host.endsWith(".notion.so") || host.endsWith(".notion.site"))
    return "notion";
  return "globe";
}
