import { URLS } from "utils/landingpage/constants";

type HeaderMap = {
  label: string;
  href?: string;
  child?: HeaderMap[];
};

const Products: HeaderMap = {
  label: "Products",
  child: [],
};

const WhyBridged: HeaderMap = {
  label: "Why Bridged",
  child: [],
};

export const HeaderMap: HeaderMap[] = [
  // temporarily disabled
  //   Products,
  // temporarily disabled
  //   WhyBridged,
  {
    label: "Pricing",
    href: "/pricing",
  },
  {
    label: "Docs",
    href: "/docs",
  },
  {
    label: "Blog",
    href: URLS.social.medium,
  },
  {
    label: "Github",
    href: URLS.social.github,
  },
];
