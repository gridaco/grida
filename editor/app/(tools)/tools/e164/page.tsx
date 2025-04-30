import type { Metadata } from "next";
import PhoneNumberTool from "./_page";
import Header from "@/www/header";
import Footer from "@/www/footer";

export const metadata: Metadata = {
  title: "E.164 Phone Number Tool",
  description: "Format phone numbers to E.164 format",
  keywords:
    "phone number, e.164, international, format, online phone number tool, online",
};

export default function PhoneNumberToolPage() {
  return (
    <main>
      <Header />
      <div className="py-40 min-h-screen flex flex-col items-center justify-center">
        <PhoneNumberTool />
      </div>
      <Footer />
    </main>
  );
}
