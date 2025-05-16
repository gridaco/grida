import { Metadata } from "next";
import Page from "./_page";

export const metadata: Metadata = {
  title: "Supabase Forms | Create Beautiful Forms for Your Supabase Project",
  description:
    "Connect your Supabase project and instantly create beautiful, functional forms. Build internal tools, visualize data, or ship as a product—all without writing code. Your database, your forms.",
  keywords: [
    "supabase forms",
    "supabase form builder",
    "supabase integration",
    "database forms",
    "no-code forms",
    "internal tools",
    "data visualization",
    "form builder",
    "supabase admin",
    "supabase dashboard",
  ].join(", "),
  openGraph: {
    title: "Supabase Forms | Create Beautiful Forms for Your Supabase Project",
    description:
      "Connect your Supabase project and instantly create beautiful, functional forms. Build internal tools, visualize data, or ship as a product—all without writing code.",
    type: "website",
    url: "https://grida.co/forms/supabase",
  },
  twitter: {
    card: "summary_large_image",
    title: "Supabase Forms | Create Beautiful Forms for Your Supabase Project",
    description:
      "Connect your Supabase project and instantly create beautiful, functional forms. Build internal tools, visualize data, or ship as a product—all without writing code.",
  },
};

export default function SupabaseFormsPage() {
  return <Page />;
}
