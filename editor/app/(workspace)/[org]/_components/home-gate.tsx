"use client";

import React from "react";
import { useRouter } from "next/navigation";
import {
  ArrowRightIcon,
  ArrowUpRightIcon,
  FolderKanban,
  SquareTerminal,
} from "lucide-react";
import { useWorkspace } from "@/scaffolds/workspace";
import { OrgHome } from "./org-home";

// TODO(org-home-gate): TEMPORARY. Stopgap so Console users (AI Gateway / FX)
// landing on grida.co aren't pushed into the legacy "Work" (projects / forms /
// database) onboarding. Remove it when the product catalogue and its links
// (the `/<org>` home, `/dashboard`, sitemap product items, Console handoffs) are
// reorganized for real. `rg "TODO\(org-home-gate\)"` lists every touchpoint;
// removal checklist:
//   - `[org]/page.tsx`: render `WorkHome` unconditionally; delete this file and
//     `org-home.ts` (the `grida-org-home` cookie, `Path=/<org>`, needs no
//     cleanup — it is simply ignored).
//   - Decide whether to keep the sidebar "Console" links (workspace sidebar and
//     org settings sidebar) and the `WorkspaceShell` split — both outlive the
//     gate and are fine to keep.
//   - Deprecate the manual TC (see test/workspace-org-home-gate.md).
/**
 * First stop at `/<org>`: pick the Console (AI Gateway / FX, keys, credits) or
 * "Work" (projects and documents). Choosing Work is remembered for this org
 * in this browser; the Console stays one click away in the sidebar.
 */
export function HomeGate({ consoleHref }: { consoleHref: string }) {
  const router = useRouter();
  const { organization } = useWorkspace();

  const chooseWork = () => {
    document.cookie = OrgHome.workCookie(organization.name);
    router.refresh();
  };

  return (
    <main
      data-testid="org-home-gate"
      className="w-full h-full overflow-y-auto flex items-center justify-center p-6"
    >
      <div className="w-full max-w-4xl">
        <div className="grid gap-4 sm:grid-cols-2">
          <GateCard
            as="a"
            href={consoleHref}
            icon={<SquareTerminal className="size-6" />}
            title="Console"
            description="For AI Gateway and FX — API keys, credits, usage and billing."
            hint={new URL(consoleHref).host}
            arrow={<ArrowUpRightIcon className="size-6" />}
          />
          <GateCard
            as="button"
            onClick={chooseWork}
            icon={<FolderKanban className="size-6" />}
            title="Work"
            description="Projects, forms, databases and documents in this organization."
            hint="Remembered on this device"
            arrow={<ArrowRightIcon className="size-6" />}
          />
        </div>
      </div>
    </main>
  );
}

type GateCardProps = {
  icon: React.ReactNode;
  title: string;
  description: string;
  hint: string;
  arrow: React.ReactNode;
} & (
  | { as: "a"; href: string; onClick?: never }
  | { as: "button"; onClick: () => void; href?: never }
);

function GateCard({
  as,
  href,
  onClick,
  icon,
  title,
  description,
  hint,
  arrow,
}: GateCardProps) {
  const className =
    "group flex min-h-80 flex-col rounded-2xl border bg-card p-8 text-left shadow-xs transition-colors hover:border-foreground/30 hover:bg-accent/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

  const body = (
    <>
      <div className="flex size-12 items-center justify-center rounded-xl border bg-background">
        {icon}
      </div>
      <div className="mt-16 flex items-center justify-between">
        <span className="text-3xl font-semibold">{title}</span>
        <span className="text-muted-foreground transition-transform group-hover:translate-x-0.5">
          {arrow}
        </span>
      </div>
      <p className="mt-2 text-base text-muted-foreground">{description}</p>
      <p className="mt-auto pt-4 text-xs text-muted-foreground/70">{hint}</p>
    </>
  );

  if (as === "a") {
    return (
      <a href={href} className={className}>
        {body}
      </a>
    );
  }
  return (
    <button type="button" onClick={onClick} className={className}>
      {body}
    </button>
  );
}
