const HOST = process.env.NEXT_PUBLIC_HOST_NAME || "http://localhost:3000";

export const examples = [
  {
    id: "001-hello-world",
    name: "Hello World",
    template: {
      schema: {
        src: `${HOST}/schema/examples/001-hello-world/form.json`,
      },
    },
  },
  {
    id: "002-iphone-pre-order",
    name: "iPhone Pre-Order",
    template: {
      schema: {
        src: `${HOST}/schema/examples/002-iphone-pre-order/form.json`,
      },
    },
  },
  {
    id: "003-fields",
    name: "Fields",
    template: {
      schema: {
        src: `${HOST}/schema/examples/003-fields/form.json`,
      },
    },
  },
  {
    id: "004-job-application",
    name: "Job Application",
    template: {
      schema: {
        src: `${HOST}/schema/examples/004-job-application/form.json`,
      },
    },
  },
] as const;

export const shortcuts: [string, string, string][] = [
  [
    "User Interview",
    "Gather initial feedback for a new app feature",
    "User interview form designed for gathering initial feedback from users about a new app feature. Includes fields for user demographics and open-ended questions about user experience.",
  ],
  [
    "User Interview Detailed",
    "In-depth user interview for beta product trials",
    "Comprehensive user interview form targeting specific user groups for a beta product trial. Includes sections for contact information, availability for follow-up interviews, and detailed questions regarding user preferences and suggestions.",
  ],
  [
    "Food Ordering",
    "Simple restaurant food ordering form",
    "Basic food ordering form for a small restaurant, allowing customers to select dishes from a predefined menu and specify quantities.",
  ],
  [
    "Food Ordering Detailed",
    "Advanced catering order form with dietary options",
    "Advanced food ordering form for a catering business, with options for multiple menu items, dietary restrictions, choice of delivery or pickup, and online payment processing.",
  ],
  [
    "Event Registration",
    "Register for a local community workshop",
    "Simple event registration form for a local community workshop, with fields for participant name, contact details, and number of attendees.",
  ],
  [
    "Event Registration Detailed",
    "Detailed form for multi-day conference registration",
    "Detailed event registration form for a multi-day conference, including personal information, preferences for different tracks and sessions, dietary needs, and accommodation requirements.",
  ],
  [
    "Feedback Survey",
    "Retail customer feedback survey",
    "Customer feedback survey form for a retail store, focusing on customer satisfaction with service, product variety, and overall shopping experience.",
  ],
  [
    "Feedback Survey Detailed",
    "Detailed tech product feedback survey",
    "In-depth feedback survey form for a tech company's product release, featuring sections on hardware performance, software usability, customer support interaction, and space for detailed user comments.",
  ],
  [
    "Job Application",
    "Basic job application form for entry-level positions",
    "Standard job application form for an entry-level position, requesting basic personal details, educational background, and current employment status.",
  ],
  [
    "Job Application Detailed",
    "Comprehensive application for senior roles",
    "Comprehensive job application form for a senior role, requiring detailed employment history, links to professional portfolio, motivations for applying, and the ability to upload a resume and cover letter.",
  ],
];
