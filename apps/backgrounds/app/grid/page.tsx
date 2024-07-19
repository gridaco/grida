import { BackgroundGrid } from "@/theme/backgrounds/grid";

export default function BackgroundGridPage({
  searchParams,
}: {
  searchParams: {
    variant?: "sm" | "base";
  };
}) {
  const { variant } = searchParams;

  return (
    <main className="h-screen w-screen dark:bg-black bg-white">
      <BackgroundGrid variant={variant} />
    </main>
  );
}
