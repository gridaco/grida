import React from "react";
import Page from "./_page";
import { type Metadata } from "next";

export const metadata: Metadata = {
  title: "Supabase Admin Panel | Visual Database Interface for Supabase",
  description:
    "Transform your Supabase database into a powerful visual interface. Build admin panels, dashboards, and internal tools in minutes—not months. No code required, just connect and start building.",
  keywords: [
    "supabase admin panel",
    "supabase dashboard",
    "supabase admin interface",
    "supabase cms",
    "supabase database admin",
    "supabase visual interface",
    "supabase internal tools",
    "supabase admin dashboard",
    "supabase no-code",
    "supabase database visualization",
  ],
  openGraph: {
    title: "Supabase Admin Panel | Visual Database Interface for Supabase",
    description:
      "Transform your Supabase database into a powerful visual interface. Build admin panels, dashboards, and internal tools in minutes—not months.",
    type: "website",
    url: "https://grida.co/database/supabase",
  },
};

export default function A() {
  return <Page />;
}
