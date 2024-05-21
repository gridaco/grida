"use client";

import Playground from "@/scaffolds/playground";
import { useRouter } from "next/navigation";

export const maxDuration = 60;

export default function FormsPlayground({
  searchParams,
}: {
  searchParams: {
    example?: string;
  };
}) {
  const { example } = searchParams;

  const router = useRouter();

  return (
    <main>
      <Playground defaultExample={example} onRouteChange={router.push} />
    </main>
  );
}
