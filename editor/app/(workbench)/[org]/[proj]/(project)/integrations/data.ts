export type IntegrationCategory =
  | "development"
  | "crm"
  | "communication"
  | "productivity"
  | "storage"
  | "analytics";

export interface Integration {
  id: string;
  name: string;
  description: string;
  categories: IntegrationCategory[];
  icon: string;
  docs: string;
  is_popular: boolean;
  is_new?: boolean;
}

export const integrations: Integration[] = [
  {
    id: "github",
    name: "GitHub",
    description:
      "Connect your repositories to sync code and automate workflows.",
    icon: "github",
    categories: ["development"],
    is_popular: false,
    docs: "https://docs.github.com/en/rest",
  },
  {
    id: "supabase",
    name: "Supabase",
    description:
      "Connect your Supabase project to sync data and automate workflows.",
    icon: "github",
    categories: ["development"],
    is_popular: false,
    docs: "https://supabase.io/docs",
  },
  {
    id: "slack",
    name: "Slack",
    description:
      "Get notifications and updates directly in your Slack channels.",
    icon: "MessageSquare",
    categories: ["communication"],
    is_popular: false,
    docs: "https://api.slack.com/",
  },
  {
    id: "salesforce",
    name: "Salesforce",
    description: "Sync customer data and manage sales processes directly.",
    icon: "Briefcase",
    categories: ["crm"],
    is_popular: false,
    docs: "https://developer.salesforce.com/docs",
  },
  {
    id: "teams",
    name: "Microsoft Teams",
    description: "Collaborate and receive updates in Microsoft Teams.",
    icon: "MessageSquare",
    categories: ["communication"],
    is_popular: false,
    docs: "https://docs.microsoft.com/en-us/graph/teams-concept-overview",
  },
  {
    id: "discord",
    name: "Discord",
    description:
      "Connect with Discord for community engagement and notifications.",
    icon: "MessageSquare",
    categories: ["communication"],
    is_popular: false,
    docs: "https://discord.com/developers/docs/intro",
  },
  {
    id: "google-drive",
    name: "Google Drive",
    description: "Access and manage your Google Drive files directly.",
    icon: "Cloud",
    categories: ["storage"],
    is_popular: false,
    docs: "https://developers.google.com/drive",
  },
  {
    id: "dropbox",
    name: "Dropbox",
    description: "Sync and share files with Dropbox integration.",
    icon: "Cloud",
    categories: ["storage"],
    is_popular: false,
    docs: "https://www.dropbox.com/developers",
  },
  {
    id: "google-calendar",
    name: "Google Calendar",
    description: "Sync events and schedule meetings with Google Calendar.",
    icon: "Calendar",
    categories: ["productivity"],
    is_popular: false,
    docs: "https://developers.google.com/calendar",
  },
  {
    id: "trello",
    name: "Trello",
    description: "Manage tasks and projects with Trello integration.",
    icon: "Trello",
    categories: ["productivity"],
    is_popular: false,
    docs: "https://developer.atlassian.com/cloud/trello/",
  },
  {
    id: "asana",
    name: "Asana",
    description: "Track work and manage projects with Asana integration.",
    icon: "Trello",
    categories: ["productivity"],
    is_popular: false,
    docs: "https://developers.asana.com/docs",
  },
  {
    id: "google-analytics",
    name: "Google Analytics",
    description: "Track and analyze user behavior with Google Analytics.",
    icon: "BarChart3",
    categories: ["analytics"],
    is_popular: false,
    is_new: false,
    docs: "https://developers.google.com/analytics",
  },
  {
    id: "segment",
    name: "Segment",
    description: "Collect, clean, and control your customer data.",
    icon: "Database",
    categories: ["analytics"],
    is_popular: false,
    docs: "https://segment.com/docs/connections/sources/catalog/",
  },
  {
    id: "mixpanel",
    name: "Mixpanel",
    description: "Analyze user behavior with advanced analytics.",
    icon: "BarChart3",
    categories: ["analytics"],
    is_popular: false,
    docs: "https://developer.mixpanel.com/docs",
  },
];
