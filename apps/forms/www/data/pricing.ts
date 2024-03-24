type Pricing = {
  highlight: PricingCategory;
  integrations: PricingCategory;
  storage: PricingCategory;
  support: PricingCategory;
  commingsoon: PricingCategory;
};

type PricingCategory = {
  title: string;
  icon: string;
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
  storage: {
    title: "File Response & Storage",
    icon: "M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4",

    features: [
      {
        title: "Receive file uploads",
        // tooltips: {
        //   main: "The sum of all objects' size in your storage buckets.\nBilling is based on the average daily size in GB throughout your billing period.",
        // },
        plans: {
          free: true,
          pro: true,
          team: true,
          enterprise: true,
        },
        usage_based: true,
      },
      {
        title: "File Storage Included",
        plans: {
          free: "250mb",
          pro: "25GB",
          team: "50GB",
          enterprise: "Custom",
        },
        usage_based: false,
      },
    ],
  },
  support: {
    title: "Support",
    icon: "M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z",
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
        title: "Email Support",
        plans: {
          free: false,
          pro: true,
          team: true,
          enterprise: true,
        },
        usage_based: false,
      },
      {
        title: "Email Support SLA",
        plans: {
          free: false,
          pro: false,
          team: true,
          enterprise: true,
        },
        usage_based: false,
      },
      {
        title: "Designated support",
        plans: {
          free: false,
          pro: false,
          team: false,
          enterprise: true,
        },
        usage_based: false,
      },
      {
        title: "On Boarding Support",
        plans: {
          free: false,
          pro: false,
          team: false,
          enterprise: true,
        },
        usage_based: false,
      },
      {
        title: "Designated Customer Success Team",
        plans: {
          free: false,
          pro: false,
          team: false,
          enterprise: true,
        },
        usage_based: false,
      },
      {
        title: "Security Questionnaire Help",
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
    title: "Key Features",
    icon: "",
    features: [
      {
        title: "Smart Customer Identity",
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
  integrations: {
    title: "Integrations",
    icon: "",
    features: [
      {
        title: "Connect to Google sheets",
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
  commingsoon: {
    title: "Comming Soon",
    icon: "",
    features: [
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
};
