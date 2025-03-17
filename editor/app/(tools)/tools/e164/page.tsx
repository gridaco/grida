import type { Metadata } from "next";
import PhoneNumberTool from "./_page";

export const metadata: Metadata = {
  title: "E.164 Phone Number Tool",
  description: "Format phone numbers to E.164 format",
  keywords:
    "phone number, e.164, international, format, online phone number tool",
};

export default function PhoneNumberToolPage() {
  return <PhoneNumberTool />;
}
