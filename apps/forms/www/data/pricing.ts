type Pricing = {
    features: PricingCategory
    integrations: PricingCategory
    storage: PricingCategory
    support: PricingCategory
    commingsoon: PricingCategory

  }
  
  type PricingCategory = {
    title: string
    icon: string
    features: PricingFeature[]
  }
  
  type PricingFeature = {
    title: string
    tooltips?: { main?: string; pro?: string; business?: string; enterprise?: string }
    plans: {
      free: boolean | string | string[]
      pro: boolean | string | string[]
      business: boolean | string | string[]
      enterprise: boolean | string | string[]
    }
    usage_based: boolean
  }
  
  export const pricing: Pricing = {
    database: {
      title: 'Features',
      icon: 'M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4',
      features: [
        {
          title: 'Smart Customer Identity',
          // tooltips: {
          //   main: 'A Postgres database with no restrictions? You get it. No pseudo limited users, you are the postgres root user.  No caveats.',
          // },
          plans: {
            free: false,
            pro: true,
            team: true,
            enterprise: true,
          },
          usage_based: false,
        },
        {
          title: 'Connect Customer Identity',
          plans: {
            free: false,
            pro: true,
            team: true,
            enterprise: true,
          },
          usage_based: false,
        },
        {
          title: 'Visual Editor',
          // tooltips: {
          //   main: 'Billing is based on the average daily database size in GB throughout the billing period.',
          // },
          plans: {
            free: true,
            pro: true,
            team: true,
            enterprise: true,
          },
          usage_based: false,
        },
        {
          title: 'Advanced Analytics',
          // tooltips: {
          //   main: 'Backups are entire copies of your database that can be restored in the future.',
          //   pro: '7 days of backup (if > 1 TB, contact for Enterprise pricing)',
          //   team: '14 days of backup (if > 1 TB, contact for Enterprise pricing)',
          // },
          plans: {
            free: false,
            pro: false,
            team: true,
            enterprise: true,
          },
          usage_based: false,
        },
        {
          title: 'Custom branding & form page',
          // tooltips: {
          //   main: 'PITR cannot be applied retroactively, projects can only be rolled back to the point from which PITR has been applied.',
          // },
          plans: {
            free: true,
            pro: true,
            team: true,
            enterprise: true,
          },
          usage_based: false,
        },
        {
          title: 'Remove branding on built-in form pages',
          // tooltips: {
          //   main: 'Projects that have no activity or API requests will be paused. They can be reactivated via the dashboard.',
          // },
          plans: {
            free: false,
            pro: true,
            team: true,
            enterprise: true,
          },
          usage_based: false,
        },
        {
          title: 'API access',
          // tooltips: {
          //   main: 'Billing is based on the total sum of all outgoing traffic (includes Database, Storage, Realtime, Auth, API, Edge Functions) in GB throughout your billing period.',
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
          title: 'JavaScript SDK',
          // tooltips: {
          //   main: 'Billing is based on the total sum of all outgoing traffic (includes Database, Storage, Realtime, Auth, API, Edge Functions) in GB throughout your billing period.',
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
          title: 'React & React Native SDK',
          // tooltips: {
          //   main: 'Billing is based on the total sum of all outgoing traffic (includes Database, Storage, Realtime, Auth, API, Edge Functions) in GB throughout your billing period.',
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
          title: 'Webhooks',
          // tooltips: {
          //   main: 'Billing is based on the total sum of all outgoing traffic (includes Database, Storage, Realtime, Auth, API, Edge Functions) in GB throughout your billing period.',
          // },
          plans: {
            free: false,
            pro: true,
            team: true,
            enterprise: true,
          },
          usage_based: true,
        },
        {
          title: 'Redirect after submit',
          // tooltips: {
          //   main: 'Billing is based on the total sum of all outgoing traffic (includes Database, Storage, Realtime, Auth, API, Edge Functions) in GB throughout your billing period.',
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
          title: 'Window postMessage interface',
          // tooltips: {
          //   main: 'Billing is based on the total sum of all outgoing traffic (includes Database, Storage, Realtime, Auth, API, Edge Functions) in GB throughout your billing period.',
          // },
          plans: {
            free: false,
            pro: true,
            team: true,
            enterprise: true,
          },
          usage_based: true,
        },
        {
          title: 'Export to .csv .xlsx',
          // tooltips: {
          //   main: 'Billing is based on the total sum of all outgoing traffic (includes Database, Storage, Realtime, Auth, API, Edge Functions) in GB throughout your billing period.',
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
          title: 'Limit number of responses',
          // tooltips: {
          //   main: 'Billing is based on the total sum of all outgoing traffic (includes Database, Storage, Realtime, Auth, API, Edge Functions) in GB throughout your billing period.',
          // },
          plans: {
            free: false,
            pro: true,
            team: true,
            enterprise: true,
          },
          usage_based: true,
        },
      ],
    },
    auth: {
      title: 'Integrations',
      icon: 'M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4',
      features: [
        {
          title: 'Connect to Google sheets',
          // tooltips: { main: 'The maximum number of users your project can have' },
          plans: {
            free: false,
            pro: true,
            team: true,
            enterprise: true,
          },
          usage_based: false,
        },
        {
          title: 'Payments with Stripe',
          // tooltips: {
          //   main: 'Users who log in or refresh their token count towards MAU.\nBilling is based on the sum of distinct users requesting your API throughout the billing period. Resets every billing cycle.',
          // },
          plans: {
            free: true,
            pro: true,
            team: true,
            enterprise: true,
          },
          usage_based: true,
        },
      
      ],
    },
    storage: {
      title: 'File Response & Storage',
      icon: 'M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4',
  
      features: [
        {
          title: 'Receive file uploads',
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
          title: 'File Storage Included',
          plans: {
            free: '250mb',
            pro: '25GB',
            team: '50GB',
            enterprise: 'Custom',
          },
          usage_based: false,
        },
      ],
    },
    edge_functions: {
      title: 'Comming Soon',
      icon: 'M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4',
      features: [
        {
          title: 'Inventory Management',
          // tooltips: {
          //   main: 'Billing is based on the sum of all invocations, independent of response status, throughout your billing period.',
          // },
          plans: {
            free: false,
            pro: false,
            team: true,
            enterprise: true,
          },
          usage_based: true,
        },
        {
          title: 'Payments with Toss (For South Korea)',
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
    realtime: {
      title: 'Support',
      icon: 'M15.042 21.672L13.684 16.6m0 0l-2.51 2.225.569-9.47 5.227 7.917-3.286-.672zM12 2.25V4.5m5.834.166l-1.591 1.591M20.25 10.5H18M7.757 14.743l-1.59 1.59M6 10.5H3.75m4.007-4.243l-1.59-1.59',
      features: [
        {
          title: 'Community support',
          plans: {
            free: true,
            pro: true,
            team: true,
            enterprise: true,
          },
          usage_based: false,
        },
        {
          title: 'Live chat support',
          // tooltips: {
          //   main: 'Total number of successful connections. Connections attempts are not counted towards usage.\nBilling is based on the maximum amount of concurrent peak connections throughout your billing period.',
          // },
          plans: {
            free: false,
            pro: false,
            team: true,
            enterprise: true,
          },
          usage_based: true,
        },
        
      ],
    },
    dashboard: {
      title: 'Dashboard',
      icon: 'M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4',
      features: [
        {
          title: 'Team members',
          plans: {
            free: 'Unlimited',
            pro: 'Unlimited',
            team: 'Unlimited',
            enterprise: 'Unlimited',
          },
          usage_based: false,
        },
        {
          title: 'Access controls',
          plans: {
            free: 'Coming soon',
            pro: 'Coming soon',
            team: true,
            enterprise: true,
          },
          usage_based: false,
        },
        {
          title: 'Audit trails',
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
    security: {
      title: 'Platform Security and Compliance',
      icon: 'M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z',
      features: [
        {
          title: 'On Premises / BYO cloud',
          plans: {
            free: false,
            pro: false,
            team: false,
            enterprise: true,
          },
          usage_based: false,
        },
        {
          title: 'Log retention (API & Database)',
          plans: {
            free: '1 day',
            pro: '7 days',
            team: '28 days',
            enterprise: '90 days',
          },
          usage_based: false,
        },
        {
          title: 'Log drain',
          plans: {
            free: false,
            pro: false,
            team: 'Coming soon',
            enterprise: 'Coming soon',
          },
          usage_based: false,
        },
        {
          title: 'Metrics endpoint',
          plans: {
            free: false,
            pro: true,
            team: true,
            enterprise: true,
          },
          usage_based: false,
        },
        {
          title: 'SOC2',
          plans: {
            free: false,
            pro: false,
            team: true,
            enterprise: true,
          },
          usage_based: false,
        },
        {
          title: 'HIPAA',
          plans: {
            free: false,
            pro: false,
            team: 'Available as paid add-on',
            enterprise: 'Available as paid add-on',
          },
          tooltips: {
            main: 'Available as a paid add-on on Team plan and above.',
          },
          usage_based: false,
        },
        {
          title: 'SSO',
          plans: {
            free: false,
            pro: false,
            team: 'Contact Us',
            enterprise: 'Contact Us',
          },
          usage_based: false,
        },
        {
          title: 'Uptime SLAs',
          plans: {
            free: false,
            pro: false,
            team: false,
            enterprise: true,
          },
          usage_based: false,
        },
        {
          title: 'Access Roles',
          plans: {
            free: 'Owner, Developer',
            pro: 'Owner, Developer',
            team: 'Additional owner(s), admin, read-only, billing admin, custom',
            enterprise: 'Additional owner(s), admin, read-only, billing admin, custom',
          },
          usage_based: false,
        },
        {
          title: 'Vanity URLs',
          plans: {
            free: false,
            pro: true,
            team: true,
            enterprise: true,
          },
          usage_based: false,
        },
        {
          title: 'Custom Domains',
          tooltips: {
            enterprise: 'Volume discounts available.',
          },
          plans: {
            free: false,
            pro: '$10 per domain per month per project add on',
            team: '$10 per domain per month per project add on',
            enterprise: '1, additional $10/domain/month',
          },
          usage_based: false,
        },
        {
          title: 'Bring your own cloud deployment options',
          tooltips: {
            main: 'On-Premises, single tenant, and managed dedicated cloud provider instance options',
          },
          plans: {
            free: false,
            pro: false,
            team: false,
            enterprise: true,
          },
          usage_based: false,
        },
      ],
    },
    support: {
      title: 'Support',
      icon: 'M18.364 5.636l-3.536 3.536m0 5.656l3.536 3.536M9.172 9.172L5.636 5.636m3.536 9.192l-3.536 3.536M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-5 0a4 4 0 11-8 0 4 4 0 018 0z',
      features: [
        {
          title: 'Community Support',
          plans: {
            free: true,
            pro: true,
            team: true,
            enterprise: true,
          },
          usage_based: false,
        },
        {
          title: 'Email Support',
          plans: {
            free: false,
            pro: true,
            team: true,
            enterprise: true,
          },
          usage_based: false,
        },
        {
          title: 'Email Support SLA',
          plans: {
            free: false,
            pro: false,
            team: true,
            enterprise: true,
          },
          usage_based: false,
        },
        {
          title: 'Designated support',
          plans: {
            free: false,
            pro: false,
            team: false,
            enterprise: true,
          },
          usage_based: false,
        },
        {
          title: 'On Boarding Support',
          plans: {
            free: false,
            pro: false,
            team: false,
            enterprise: true,
          },
          usage_based: false,
        },
        {
          title: 'Designated Customer Success Team',
          plans: {
            free: false,
            pro: false,
            team: false,
            enterprise: true,
          },
          usage_based: false,
        },
        {
          title: 'Security Questionnaire Help',
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
  }