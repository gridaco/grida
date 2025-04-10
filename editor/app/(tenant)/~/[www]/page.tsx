import { GridaLogo } from "@/components/grida-logo";

export default function Index() {
  return (
    <main className="flex flex-col h-screen w-full items-center justify-center gap-4">
      <GridaLogo />
      <p className="text-muted-foreground">This site is hosted with grida</p>
    </main>
  );
}
