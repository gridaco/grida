import { SupportsDarkMode } from "@/components/dark";
import { AuroraBackground } from "@/backgrounds/aurora";

export default function AuroraBgPage() {
  return (
    <SupportsDarkMode>
      <AuroraBackground />
    </SupportsDarkMode>
  );
}
