import { PageSeoMeta } from "./interface";

const PRICING_META: PageSeoMeta = {
  route: "/pricing",
  title: "Pricing | Bridged",
  description: "Bridged is free to use",
  keywords: "Bridged pricing",
};

const GLOBALIZATION_META: PageSeoMeta = {
  route: "/globalizatin",
  title: "Bridged | Globalization",
  description: "Globalize your design",
  keywords: [
    "figma translation",
    "design translation",
    "free translation tool",
  ],
};

const PAGES = {
  globalization: GLOBALIZATION_META,
  pricing: PRICING_META,
};

export default PAGES;
