import { PageSeoMeta } from "./interface";

const PRICING_META: PageSeoMeta = {
  route: "/pricing",
  title: "Pricing | Grida",
  description: "Grida is free to use",
  keywords: "Grida pricing",
};

const GLOBALIZATION_META: PageSeoMeta = {
  route: "/globalizatin",
  title: "Globalization | Grida",
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
