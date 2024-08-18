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
  {
    id: "005-logics",
    name: "Logics",
    template: {
      schema: {
        src: `${HOST}/schema/examples/005-logics/form.json`,
      },
    },
  },
  {
    id: "006-computed-fields",
    name: "Computed Fields",
    template: {
      schema: {
        src: `${HOST}/schema/examples/006-computed-fields/form.json`,
      },
    },
  },
  {
    id: "007-data-transform",
    name: "Data Transform",
    template: {
      schema: {
        src: `${HOST}/schema/examples/007-data-transform/form.json`,
      },
    },
  },
] as const;

/**
 * shortcuts for ai prompt - Build forms with AI
 * - name
 * - placeholder
 * - prompt
 */
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
  [
    "Volunteer Application",
    "Application form for community service volunteers",
    "Volunteer application form for community services, including personal information, availability, skills, and previous volunteer experience.",
  ],
  [
    "Volunteer Application Detailed",
    "Detailed form for specialized volunteer positions",
    "Detailed volunteer application form focusing on specialized roles, requiring specific skills or certifications, and availability for training sessions.",
  ],
  [
    "Customer Inquiry",
    "General inquiry form for customer support",
    "Simple customer inquiry form for support or general questions, including fields for contact information and the nature of the inquiry.",
  ],
  [
    "Customer Inquiry Detailed",
    "Comprehensive support request form with issue categorization",
    "Detailed support request form with options for categorizing the issue, preferred contact times, and attachment uploads for supporting documents.",
  ],
  [
    "Subscription Signup",
    "Simple newsletter subscription form",
    "Basic form for signing up for a newsletter, requiring only an email address and name.",
  ],
  [
    "Subscription Signup Detailed",
    "Detailed subscription form with preferences",
    "Detailed subscription signup form including preferences for content topics, frequency of emails, and privacy options.",
  ],
  [
    "Patient Intake",
    "Basic patient intake form for medical consultations",
    "Simple patient intake form for a medical office, collecting basic contact details and medical history summary.",
  ],
  [
    "Patient Intake Detailed",
    "Comprehensive medical history and consent form",
    "Detailed patient intake form including comprehensive medical history, current medications, consent sections for treatments, and data privacy.",
  ],
  [
    "School Enrollment",
    "Simple form for school enrollment inquiries",
    "Basic school enrollment inquiry form, gathering contact details and information about the child’s grade level.",
  ],
  [
    "School Enrollment Detailed",
    "Detailed school application form with educational history",
    "Detailed application form for school enrollment, including educational history, extracurricular interests, and parental consent sections.",
  ],
  [
    "Hotel Booking",
    "Basic hotel reservation form",
    "Simple hotel booking form with fields for check-in and check-out dates, number of guests, and room type preferences.",
  ],
  [
    "Hotel Booking Detailed",
    "Detailed form for hotel reservations with special requests",
    "Advanced hotel booking form including detailed preferences for room types, dietary needs, special occasions, and additional services like spa or tour bookings.",
  ],
  [
    "Service Quote Request",
    "Simple form to request a quote for services",
    "Basic form to request a service quote, providing contact information and a brief description of the needed services.",
  ],
  [
    "Service Quote Request Detailed",
    "Comprehensive form for detailed service proposals",
    "Detailed request form for service quotes, allowing customers to specify project scope, deadlines, budget constraints, and preferred contact methods.",
  ],
  [
    "Workshop Feedback",
    "Simple feedback form for a workshop",
    "Quick feedback form for workshop participants, focusing on the effectiveness of the content and facilitator performance.",
  ],
  [
    "Workshop Feedback Detailed",
    "Detailed workshop evaluation form with multiple metrics",
    "Comprehensive workshop feedback form including detailed evaluations on content, delivery, venue, and suggestions for future topics.",
  ],
];
