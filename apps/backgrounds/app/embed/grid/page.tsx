import { BackgroundGrid } from "@/backgrounds/grid";
import { SupportsDarkMode } from "@/components/dark";

export default function BackgroundGridPage({
  searchParams,
}: {
  searchParams: {
    variant?: "sm" | "base";
  };
}) {
  const { variant } = searchParams;

  return (
    <SupportsDarkMode>
      <main className="h-screen w-screen">
        <BackgroundGrid variant={variant} />
      </main>
    </SupportsDarkMode>
  );
}
