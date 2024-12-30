export interface ChatwootSetUserProps {
  name?: string; // Name of the user
  avatar_url?: string; // Avatar URL
  email?: string; // Email of the user
  identifier_hash?: string; // Identifier Hash generated based on the webwidget hmac_token
  phone_number?: string; // Phone Number of the user
  description?: string; // description about the user
  country_code?: string; // Two letter country code
  city?: string; // City of the user
  company_name?: string; // company name
  social_profiles?: {
    twitter?: string; // Twitter user name
    linkedin?: string; // LinkedIn user name
    facebook?: string; // Facebook user name
    github?: string; // Github user name
  };
}

export interface ChatwootSettings {
  hideMessageBubble?: boolean;
  position?: "left" | "right"; // This can be left or right
  locale?: "en" | string; // Language to be set
  type?: "standard" | "expanded_bubble"; // [standard, expanded_bubble]
  launcherTitle?: string; // "Chat with us"
  darkMode?: "light" | "auto"; // [light, auto]
  showPopoutButton?: boolean;
}

export type ChatwootSdk = {
  run: (init: { websiteToken: string; baseUrl: string }) => void;
};

export type Chatwoot = {
  toggle: (state?: "open" | "close") => void;
  setUser: (key: string, args: ChatwootSetUserProps) => void;
  setCustomAttributes: (attributes: { [key: string]: string }) => void;
  deleteCustomAttribute: (key: string) => void;
  setLocale: (local: string) => void;
  setLabel: (label: string) => void;
  removeLabel: (label: string) => void;
  reset: () => void;
};

declare global {
  interface Window {
    chatwootSettings: ChatwootSettings;
    chatwootSDK: ChatwootSdk;
    $chatwoot: Chatwoot;
  }
}
