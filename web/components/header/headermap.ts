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
  // temporarily disabled - since the pricing policy is not firm
  // {
  //   label: "Pricing",
  //   href: "/pricing",
  // },
  {
    label: "Docs",
    href: "/docs/getting-started/intro",
  },
  // temporarily disabled - since the blog standards is not firm
  // {
  //   label: "Blog",
  //   href: URLS.social.medium,
  // },
  {
    label: "Github",
    href: URLS.social.github,
  },
  {
    label: "Slack",
    href: "https://grida.co/join-slack",
  },
  {
    label: "Monothon",
    href: "https://grida.co/monothon",
  },
];
