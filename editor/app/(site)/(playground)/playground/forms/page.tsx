"use client";
import { use } from "react";

import Playground from "@/scaffolds/playground";
import { useRouter } from "next/navigation";

export const maxDuration = 60;

export default function FormsPlayground(props: {
  searchParams: Promise<{
    example?: string;
  }>;
}) {
  const searchParams = use(props.searchParams);
  const { example } = searchParams;

  const router = useRouter();

  return (
    <main>
      <Playground defaultExample={example} onRouteChange={router.push} />
    </main>
  );
}
