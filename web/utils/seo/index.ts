import { OpenGraphMeta, PageSeoMeta } from "./interface";

const OG_IMAGE_STATIC =
  "https://bridged-service-static.s3-us-west-1.amazonaws.com/opengraph/og-image.png";
const OG_IMAGE_GIF =
  "https://bridged-service-static.s3-us-west-1.amazonaws.com/opengraph/og-image-gif.gif";

export const SEO_OG_DEFAULTS: OpenGraphMeta = {
  title: "Figma to Flutter | Grida",
  type: "website",
  url: "https://grida.co",
  image: OG_IMAGE_GIF,
};

export const SEO_DEFAULTS: PageSeoMeta = {
  route: "/",
  title: "Grida",
  description:
    "Figma to Flutter | automate your frontend development. Instantly convert your design to production ready code.",
  keywords: [
    "figma to flutter",
    "design to code",
    "figma to code",
    "design nocode",
    "flutter studio",
    "flutter tools",
    "flutter code generation",
    "design handoff",
    "design linting",
    "code generation",
  ],
  author: "grida.co team and community collaborators",
  og: SEO_OG_DEFAULTS,
};
