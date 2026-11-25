import type { Metadata } from "next";
import Link from "next/link";
import { DesktopImagePolicy } from "@/lib/desktop/image-policy";
import { ReplyImageSourceProvider } from "@/kits/agent-chat/reply-images";
import { NativeChatPlayground } from "./playground";

export const metadata: Metadata = {
  title: "Native Chat playground | Grida",
};

export default async function NativeChatPage({
  searchParams,
}: {
  searchParams: Promise<{ scenario?: string | string[] }>;
}) {
  const { scenario } = await searchParams;
  return (
    <main className="mx-auto flex w-full min-w-0 max-w-5xl flex-col gap-5 px-4 py-6 sm:px-8">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold">Native Chat playground</h1>
          <p className="text-sm text-muted-foreground">
            Try the Desktop chat with scripted replies and local sample data.
          </p>
        </div>
        <Link
          href="/ui/components/composer"
          className="text-sm text-muted-foreground underline underline-offset-4 hover:text-foreground"
        >
          Composer playground
        </Link>
      </header>
      <ReplyImageSourceProvider sources={DesktopImagePolicy.sources()}>
        <NativeChatPlayground
          initialScenario={typeof scenario === "string" ? scenario : undefined}
        />
      </ReplyImageSourceProvider>
    </main>
  );
}
