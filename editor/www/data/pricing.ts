type Pricing = {
  ai: PricingCategory;
  highlight: PricingCategory;
  integrations: PricingCategory;
  storage: PricingCategory;
  support: PricingCategory;
  ticketing: PricingCategory;
  commerce: PricingCategory;
  channels: PricingCategory;
  commingsoon: PricingCategory;
};

export type PricingCategory = {
  title: string;
  features: PricingFeature[];
};

type PricingFeature = {
  title: string;
  tooltips?: {
    main?: string;
    pro?: string;
    team?: string;
    enterprise?: string;
  };
  plans: {
    free: boolean | string | string[];
    pro: boolean | string | string[];
    team: boolean | string | string[];
    enterprise: boolean | string | string[];
  };
  usage_based: boolean;
};

export const pricing: Pricing = {
  ai: {
    title: "AI",
    features: [
      {
        title: "Free Monthly Credits",
        plans: {
          free: "500",
          pro: "10,000",
          team: "35,000",
          enterprise: "Unlimited",
        },
        usage_based: false,
      },
      {
        title: "Generated Image License",
        plans: {
          free: "Public (CC0)",
          pro: "Full ownership",
          team: "Full ownership",
          enterprise: "Full ownership",
        },
        usage_based: false,
      },
      {
        title: "Models",
        plans: {
          free: "Mini",
          pro: "All",
          team: "All",
          enterprise: "All",
        },
        usage_based: false,
      },
      {
        title: "Credits Rollover",
        plans: {
          free: false,
          pro: true,
          team: true,
          enterprise: true,
        },
        usage_based: false,
      },
      {
        title: "Buy extra credits",
        plans: {
          free: false,
          pro: false,
          team: true,
          enterprise: true,
        },
        usage_based: false,
      },
    ],
  },
  highlight: {
    title: "Forms",
    features: [
      {
        title: "Visual Editor",
        plans: {
          free: true,
          pro: true,
          team: true,
          enterprise: true,
        },
        usage_based: false,
      },
      {
        title: "Custom branding & form page",
        plans: {
          free: true,
          pro: true,
          team: true,
          enterprise: true,
        },
        usage_based: false,
      },
      {
        title: "Themes & Custom CSS",
        plans: {
          free: true,
          pro: true,
          team: true,
          enterprise: true,
        },
        usage_based: false,
      },
      {
        title: "API access",
        plans: {
          free: true,
          pro: true,
          team: true,
          enterprise: true,
        },
        usage_based: false,
      },
      {
        title: "SDK",
        plans: {
          free: true,
          pro: true,
          team: true,
          enterprise: true,
        },
        usage_based: false,
      },
      {
        title: "Webhooks",
        plans: {
          free: true,
          pro: true,
          team: true,
          enterprise: true,
        },
        usage_based: false,
      },
      {
        title: "Export files & sheets",
        plans: {
          free: true,
          pro: true,
          team: true,
          enterprise: true,
        },
        usage_based: false,
      },
      {
        title: "Connect Customer Identity",
        plans: {
          free: false,
          pro: true,
          team: true,
          enterprise: true,
        },
        usage_based: false,
      },
      {
        title: "Limit number of responses",
        plans: {
          free: false,
          pro: true,
          team: true,
          enterprise: true,
        },
        usage_based: false,
      },
      {
        title: "Advanced Analytics",
        plans: {
          free: false,
          pro: false,
          team: true,
          enterprise: true,
        },
        usage_based: false,
      },
      {
        title: "Remove branding from Sites",
        plans: {
          free: false,
          pro: true,
          team: true,
          enterprise: true,
        },
        usage_based: false,
      },
    ],
  },
  support: {
    title: "Support",
    features: [
      {
        title: "Community Support",
        plans: {
          free: true,
          pro: true,
          team: true,
          enterprise: true,
        },
        usage_based: false,
      },
      {
        title: "Live chat support",
        plans: {
          free: false,
          pro: false,
          team: true,
          enterprise: true,
        },
        usage_based: false,
      },
    ],
  },
  storage: {
    title: "Storage",
    features: [
      {
        title: "Receive file uploads",
        plans: {
          free: "Up to 4.5MB",
          pro: "Up to 150MB",
          team: "Up to 1GB",
          enterprise: "Unlimited",
        },
        usage_based: false,
      },
      {
        title: "File Storage Included",
        plans: {
          free: "1GB",
          pro: "30GB",
          team: "500GB",
          enterprise: "Unlimited",
        },
        usage_based: false,
      },
    ],
  },
  integrations: {
    title: "Integrations",
    features: [
      {
        title: "Connect to Google sheets",
        plans: {
          free: false,
          pro: false,
          team: false,
          enterprise: true,
        },
        usage_based: false,
      },
      {
        title: "Connect to Notion Database",
        plans: {
          free: false,
          pro: false,
          team: false,
          enterprise: true,
        },
        usage_based: false,
      },
      {
        title: "Custom Domain",
        plans: {
          free: false,
          pro: "$10 / domain / mo",
          team: "$10 / domain / mo",
          enterprise: "$10 / domain / mo, + $0.5 per 100,000 views",
        },
        usage_based: false,
      },
      {
        title: "Supabase Integration",
        plans: {
          free: true,
          pro: true,
          team: true,
          enterprise: true,
        },
        usage_based: false,
      },
    ],
  },
  ticketing: {
    title: "Ticketing",
    features: [
      {
        title: "Concurrent Users",
        plans: {
          free: "Up to 50 concurrencies",
          pro: "Up to 100 concurrencies",
          team: "Up to 250 concurrencies",
          enterprise:
            "250 concurrencies included. then $100 / 500 concurrencies",
        },
        usage_based: true,
      },
      {
        title: "Dedicated Servers for High demand",
        plans: {
          free: false,
          pro: false,
          team: false,
          enterprise:
            "$3,000 initially. then $2,500 per 10,000 concurrencies (may vary)",
        },
        usage_based: true,
      },
      {
        title: "Simulator",
        plans: {
          free: false,
          pro: false,
          team: false,
          enterprise: true,
        },
        usage_based: true,
      },
    ],
  },
  commerce: {
    title: "Commerce",
    features: [
      {
        title: "Payments with Stripe",
        plans: {
          free: "5% fee",
          pro: "No additional fee",
          team: "No additional fee",
          enterprise: "No additional fee",
        },
        usage_based: false,
      },
      {
        title: "Payments with Toss (for 🇰🇷)",
        plans: {
          free: false,
          pro: false,
          team: "Contact Sales",
          enterprise: "Contact Sales",
        },
        usage_based: false,
      },
      {
        title: "Ticketing for Events",
        plans: {
          free: false,
          pro: false,
          team: true,
          enterprise: true,
        },
        usage_based: false,
      },
      {
        title: "Inventory Management",
        plans: {
          free: false,
          pro: false,
          team: true,
          enterprise: true,
        },
        usage_based: false,
      },
    ],
  },
  channels: {
    title: "Channels",
    features: [
      {
        title: "Email Notifications",
        plans: {
          free: true,
          pro: true,
          team: true,
          enterprise: true,
        },
        usage_based: false,
      },
      {
        title: "SMS Notifications",
        plans: {
          free: false,
          pro: "Contact Sales",
          team: "Contact Sales",
          enterprise: "Contact Sales",
        },
        usage_based: false,
      },
      {
        title: "WhatsApp Notifications",
        plans: {
          free: false,
          pro: true,
          team: true,
          enterprise: true,
        },
        usage_based: false,
      },
      {
        title: "KakaoTalk Notifications (for 🇰🇷)",
        plans: {
          free: false,
          pro: false,
          team: false,
          enterprise: "Contact Sales",
        },
        usage_based: false,
      },
    ],
  },
  commingsoon: {
    title: "Comming Soon",
    features: [],
  },
};
