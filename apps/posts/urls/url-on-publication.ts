import type { PublicationHost } from "../types";
import UrlPattern from "url-pattern";

type PostOnPublicationViewUrlParams = {
  id: string;
};

export function buildViewPostOnPublicationUrl(
  host: PublicationHost,
  params: PostOnPublicationViewUrlParams,
  preview?: boolean
) {
  const { homepage, pattern } = host;
  const url = new URL(homepage + new UrlPattern(pattern, {}).stringify(params));

  // add preview?=true if needed
  if (preview) {
    url.searchParams.set("preview", "true");
  }

  return url.toString();
}
