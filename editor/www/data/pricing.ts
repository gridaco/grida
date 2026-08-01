// GRIDA-EE: billing — feature data for the public plan comparison.

type Pricing = {
  desktop: PricingCategory;
  design: PricingCategory;
  forms: PricingCategory;
  database: PricingCategory;
  developer: PricingCategory;
  ai: PricingCategory;
  custom: PricingCategory;
};

export type PricingCategory = {
  title: string;
  features: PricingFeature[];
};

type PricingFeature = {
  title: string;
  tooltips?: {
    main?: string;
    free?: string;
    pro?: string;
    custom?: string;
  };
  plans: {
    free: boolean | string | string[];
    pro: boolean | string | string[];
    custom: boolean | string | string[];
  };
};

const availableToAllPlans: PricingFeature["plans"] = {
  free: true,
  pro: true,
  custom: true,
};

const customByAgreement: PricingFeature["plans"] = {
  free: false,
  pro: false,
  custom: "By agreement",
};

export const pricing: Pricing = {
  desktop: {
    title: "Grida Desktop",
    features: [
      {
        title: "AI agent that creates and edits project files",
        plans: availableToAllPlans,
      },
      {
        title: "Prompt-to-editable presentation decks",
        plans: availableToAllPlans,
      },
      {
        title: "AI-assisted, round-trip SVG editing",
        plans: availableToAllPlans,
      },
      {
        title: "Image generation with model and output controls",
        plans: availableToAllPlans,
      },
      {
        title: "Visual reference search and compatible-model image generation",
        plans: availableToAllPlans,
      },
      {
        title: "Work directly in local project folders",
        plans: availableToAllPlans,
      },
      {
        title: "SVG, code, Markdown, image, and video workspace",
        plans: availableToAllPlans,
      },
      {
        title: "Built-in workspace terminal",
        plans: availableToAllPlans,
      },
      {
        title: "Bring your own provider keys or connect local Ollama",
        plans: availableToAllPlans,
      },
      {
        title: "Desktop apps for macOS, Windows, and Linux",
        plans: availableToAllPlans,
      },
    ],
  },
  design: {
    title: "Design & interoperability",
    features: [
      {
        title: "Web-based Canvas editor",
        plans: availableToAllPlans,
      },
      {
        title: "Vector-native presentation workspace",
        plans: availableToAllPlans,
      },
      {
        title: "Figma import from .fig, REST data, and clipboard",
        plans: availableToAllPlans,
      },
      {
        title: "Figma Slides .deck import",
        plans: availableToAllPlans,
      },
      {
        title: "Multi-format design export",
        plans: {
          free: "PNG, JPEG, WebP, PDF, SVG",
          pro: "PNG, JPEG, WebP, PDF, SVG",
          custom: "PNG, JPEG, WebP, PDF, SVG",
        },
      },
      {
        title: "Custom domains for hosted sites and forms",
        plans: availableToAllPlans,
      },
    ],
  },
  forms: {
    title: "Forms & responses",
    features: [
      {
        title: "Visual builder with themes and custom CSS",
        plans: availableToAllPlans,
      },
      {
        title: "Custom branding and removable Powered by Grida badge",
        plans: availableToAllPlans,
      },
      {
        title: "Rich fields for files, media, and formatted content",
        plans: availableToAllPlans,
      },
      {
        title: "Logic, computed fields, hidden fields, and URL prefilling",
        plans: availableToAllPlans,
      },
      {
        title: "Hosted form pages and iframe embedding",
        plans: availableToAllPlans,
      },
      {
        title: "Headless form submission API",
        plans: availableToAllPlans,
      },
      {
        title: "Realtime sync and partial submissions",
        plans: availableToAllPlans,
      },
      {
        title: "Form response simulator",
        plans: availableToAllPlans,
      },
      {
        title: "Scheduling, response limits, and completion redirects",
        plans: availableToAllPlans,
      },
      {
        title: "Customer identity and respondent confirmation emails",
        plans: {
          free: "Verified email required",
          pro: "Verified email required",
          custom: "Verified email required",
        },
      },
      {
        title: "Response management and CSV export",
        plans: availableToAllPlans,
      },
      {
        title: "Option inventory tracking",
        plans: {
          free: "Alpha",
          pro: "Alpha",
          custom: "Alpha",
        },
      },
      {
        title: "Form interface available in 12 languages",
        plans: availableToAllPlans,
      },
    ],
  },
  database: {
    title: "Database & CMS",
    features: [
      {
        title: "Managed Database/CMS visual workspace",
        plans: availableToAllPlans,
      },
      {
        title: "Supabase Tables, Views, Storage, and Auth",
        plans: {
          free: "Beta",
          pro: "Beta",
          custom: "Beta",
        },
      },
      {
        title: "Search, filtering, sorting, and computed attributes",
        plans: availableToAllPlans,
      },
      {
        title: "Gallery, list, and chart views",
        plans: {
          free: "Charts in beta",
          pro: "Charts in beta",
          custom: "Charts in beta",
        },
      },
      {
        title: "Form-backed admin workflows",
        plans: availableToAllPlans,
      },
      {
        title: "Customer records, CSV updates, tags, and segments",
        plans: availableToAllPlans,
      },
    ],
  },
  developer: {
    title: "Developer tools & open source",
    features: [
      {
        title: "Portable .grida document format",
        plans: availableToAllPlans,
      },
      {
        title: "fig2grida CLI and library",
        plans: availableToAllPlans,
      },
      {
        title: "Headless Figma rendering in Node.js and browsers",
        plans: availableToAllPlans,
      },
      {
        title: "Canvas Embed SDK",
        plans: {
          free: "Alpha",
          pro: "Alpha",
          custom: "Alpha",
        },
      },
      {
        title: "SVG SDK and React bindings",
        plans: {
          free: "Alpha",
          pro: "Alpha",
          custom: "Alpha",
        },
      },
      {
        title: "Apache 2.0 open-source codebase",
        plans: availableToAllPlans,
      },
    ],
  },
  ai: {
    title: "Hosted AI & credit",
    features: [
      {
        title: "Grida-hosted agent models",
        plans: {
          free: "Prepaid credit",
          pro: "Prepaid credit",
          custom: "By agreement",
        },
      },
      {
        title: "Grida-hosted image-generation models",
        plans: {
          free: "Prepaid credit",
          pro: "Prepaid credit",
          custom: "By agreement",
        },
      },
      {
        title: "Credit shared across the organization",
        plans: {
          free: true,
          pro: true,
          custom: "By agreement",
        },
      },
      {
        title: "Manual AI-credit purchases",
        plans: {
          free: "$10–$500",
          pro: "$10–$500",
          custom: "By agreement",
        },
      },
      {
        title: "Automatic AI-credit reload",
        plans: {
          free: false,
          pro: true,
          custom: "By agreement",
        },
      },
    ],
  },
  custom: {
    title: "Support & custom services",
    features: [
      {
        title: "Community support through Slack and GitHub",
        plans: availableToAllPlans,
      },
      {
        title: "Tailored pricing and billing schedule",
        plans: customByAgreement,
      },
      {
        title: "Tailored deployment",
        plans: customByAgreement,
      },
      {
        title: "Tailored integrations",
        plans: customByAgreement,
      },
      {
        title: "Tailored support and rollout",
        plans: customByAgreement,
      },
      {
        title: "Tailored AI-credit terms",
        plans: customByAgreement,
      },
    ],
  },
};
