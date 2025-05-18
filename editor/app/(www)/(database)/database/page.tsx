import React from "react";
import Page from "./_page";
import { type Metadata } from "next";

export const metadata: Metadata = {
  title: "Grida Database | Your visual Data backend",
  description:
    "Grida empowers you to build no-code databases as easily as editing a spreadsheet. Plug in your own database, choose ours, or integrate with Supabase—millions of rows, no problem. Your data. Your rules. You're in control.",
  keywords: [
    "cms",
    "database",
    "database admin",
    "postgres admin",
    "open source postgres admin",
    "supabase admin",
    "supabase cms",
  ],
};

export default function A() {
  return <Page />;
}
