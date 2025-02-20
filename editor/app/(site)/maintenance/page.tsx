import Maintenance from "@/components/maintenance";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Grida is under maintenance",
  description:
    "We're currently performing some maintenance on our site. We'll be back shortly!",
};

export default function MaintenancePage() {
  return <Maintenance />;
}
