import { DotsBackground } from "@/backgrounds/dots";
import { SupportsDarkMode } from "@/components/dark";

export default function DotsBackgroundPage() {
  return (
    <SupportsDarkMode>
      <main className="w-screen h-screen">
        <DotsBackground />
      </main>
    </SupportsDarkMode>
  );
}
