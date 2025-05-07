"use client";

import React from "react";
import { sitemap } from "./data/sitemap";
import { Button } from "@/components/ui/button";
import useSession from "@/lib/supabase/use-session";
import Link from "next/link";

export default function HeaderCTA() {
  const session = useSession();

  return (
    <div className="flex gap-2">
      {!session && (
        <Link href={sitemap.links.signin} className="hidden md:block">
          <Button variant="ghost">Sign in</Button>
        </Link>
      )}
      <CTA isSignedIn={!!session} />
    </div>
  );
}

function CTA({ isSignedIn }: { isSignedIn: boolean }) {
  if (isSignedIn) {
    return (
      <Link href={sitemap.links.dashboard}>
        <Button className="font-normal">Dashboard</Button>
      </Link>
    );
  }

  return (
    <Link href={sitemap.links.cta}>
      <Button className="font-normal">Get Started</Button>
    </Link>
  );
}
