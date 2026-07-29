"use client";

import { useState, useSyncExternalStore } from "react";
import {
  ArrowLeftIcon,
  BookOpenIcon,
  FileTextIcon,
  RotateCcwIcon,
} from "lucide-react";
import { Button } from "@app/ui/components/button";
import { Input } from "@app/ui/components/input";
import { cn } from "@app/ui/lib/utils";
import { MemoryNavigator } from "@/kits/memory-navigator";
import { ComponentDemo } from "../component-demo";

type DemoRoute =
  | Readonly<{ kind: "guides" }>
  | Readonly<{
      kind: "guide";
      guideId: GuideId;
      tab: "overview" | "examples";
    }>
  | Readonly<{ kind: "topic"; guideId: GuideId; topicId: string }>;

type DemoEntryState = Readonly<{
  note: string;
}>;

type GuideId = "editor" | "desktop";

type Guide = Readonly<{
  id: GuideId;
  title: string;
  description: string;
  topics: ReadonlyArray<Readonly<{ id: string; title: string }>>;
}>;

const GUIDES: ReadonlyArray<Guide> = [
  {
    id: "editor",
    title: "Editor extensions",
    description: "Build a focused tool on top of the canvas editor.",
    topics: [
      { id: "commands", title: "Commands" },
      { id: "selection", title: "Selection state" },
    ],
  },
  {
    id: "desktop",
    title: "Desktop integration",
    description: "Connect renderer features to the desktop host.",
    topics: [
      { id: "windows", title: "Window roles" },
      { id: "protocol", title: "Protocol handlers" },
    ],
  },
];

function createNavigator() {
  return new MemoryNavigator<DemoRoute, DemoEntryState>({
    route: { kind: "guides" },
    state: { note: "" },
  });
}

export default function MemoryNavigatorPage() {
  return (
    <main className="container mx-auto max-w-screen-lg py-10">
      <div className="space-y-8">
        <div>
          <h1 className="text-3xl font-bold">Memory Navigator</h1>
          <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
            A scoped, typed back stack for embedded experiences that need
            route-like navigation without taking over the browser URL.
          </p>
        </div>

        <hr />

        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold">Embedded navigator</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Open a guide, change its tab, and continue into a topic. Add a
              note on any screen; Back restores the note attached to that
              history entry.
            </p>
          </div>
          <ComponentDemo className="!items-stretch !p-6">
            <MemoryNavigatorDemo />
          </ComponentDemo>
        </section>

        <hr />

        <section className="space-y-4">
          <div>
            <h2 className="text-xl font-semibold">Pattern exercised</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              The demo supplies all route meaning, rendering, and state policy.
              The navigator only owns its scoped history.
            </p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <ContractCard
              title="push"
              description="Opening a guide or topic creates a new history entry."
            />
            <ContractCard
              title="replace"
              description="Changing a guide tab updates the current route without adding history."
            />
            <ContractCard
              title="updateCurrentState"
              description="Each entry keeps its own note and restores it after Back."
            />
            <ContractCard
              title="subscribe"
              description="React observes stable snapshots through useSyncExternalStore."
            />
          </div>
        </section>
      </div>
    </main>
  );
}

function MemoryNavigatorDemo() {
  const [navigator, setNavigator] = useState(createNavigator);
  const snapshot = useSyncExternalStore(
    navigator.subscribe,
    navigator.getSnapshot,
    navigator.getSnapshot
  );
  const { route, state } = snapshot.current;

  function push(route: DemoRoute) {
    navigator.push({ route, state: { note: "" } });
  }

  function replace(route: DemoRoute) {
    navigator.replace({ route, state: navigator.current.state });
  }

  return (
    <div
      data-testid="memory-navigator-demo"
      className="grid w-full max-w-4xl overflow-hidden rounded-xl border bg-background md:grid-cols-3"
    >
      <section className="flex min-h-[430px] min-w-0 flex-col md:col-span-2">
        <header className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            disabled={!snapshot.canGoBack}
            aria-label="Go back"
            onClick={() => navigator.back()}
          >
            <ArrowLeftIcon />
          </Button>
          <span
            aria-live="polite"
            aria-atomic="true"
            className="min-w-0 flex-1 truncate text-sm font-medium"
          >
            {routeTitle(route)}
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setNavigator(createNavigator())}
          >
            <RotateCcwIcon />
            Reset
          </Button>
        </header>

        <div className="min-h-0 flex-1 p-5">
          {route.kind === "guides" && (
            <GuideIndex onOpen={(guideId) => push(guideRoute(guideId))} />
          )}
          {route.kind === "guide" && (
            <GuideView
              route={route}
              onChangeTab={(tab) => replace({ ...route, tab })}
              onOpenTopic={(topicId) =>
                push({ kind: "topic", guideId: route.guideId, topicId })
              }
            />
          )}
          {route.kind === "topic" && <TopicView route={route} />}
        </div>

        <label className="grid shrink-0 gap-1.5 border-t bg-muted/20 p-4 text-xs font-medium">
          State attached to this entry
          <Input
            value={state.note}
            placeholder="Type, navigate away, then come back"
            className="bg-background font-normal"
            onChange={(event) =>
              navigator.updateCurrentState((current) => ({
                ...current,
                note: event.target.value,
              }))
            }
          />
        </label>
      </section>

      <aside className="border-t bg-muted/30 p-4 md:border-l md:border-t-0">
        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          Live snapshot
        </p>
        <pre className="mt-3 overflow-x-auto whitespace-pre-wrap break-words font-mono text-xs leading-5 text-foreground/80">
          {JSON.stringify(snapshot, null, 2)}
        </pre>
      </aside>
    </div>
  );
}

function GuideIndex({ onOpen }: { onOpen: (guideId: GuideId) => void }) {
  return (
    <div className="space-y-4">
      <div>
        <p className="text-xs font-medium text-muted-foreground">
          Example host
        </p>
        <h3 className="mt-1 text-lg font-semibold">Developer guides</h3>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        {GUIDES.map((guide) => (
          <button
            key={guide.id}
            type="button"
            className="rounded-lg border p-4 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => onOpen(guide.id)}
          >
            <BookOpenIcon className="size-4 text-muted-foreground" />
            <span className="mt-3 block text-sm font-medium">
              {guide.title}
            </span>
            <span className="mt-1 block text-xs leading-5 text-muted-foreground">
              {guide.description}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}

function GuideView({
  route,
  onChangeTab,
  onOpenTopic,
}: {
  route: Extract<DemoRoute, { kind: "guide" }>;
  onChangeTab: (tab: "overview" | "examples") => void;
  onOpenTopic: (topicId: string) => void;
}) {
  const guide = guideById(route.guideId);
  return (
    <div className="space-y-5">
      <div>
        <h3 className="text-lg font-semibold">{guide.title}</h3>
        <p className="mt-1 text-sm text-muted-foreground">
          {guide.description}
        </p>
      </div>
      <div className="inline-flex rounded-lg bg-muted p-1">
        {(["overview", "examples"] as const).map((tab) => (
          <button
            key={tab}
            type="button"
            aria-pressed={route.tab === tab}
            className={cn(
              "rounded-md px-3 py-1.5 text-xs font-medium capitalize transition",
              route.tab === tab
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
            onClick={() => onChangeTab(tab)}
          >
            {tab}
          </button>
        ))}
      </div>
      <p className="text-sm leading-6 text-muted-foreground">
        {route.tab === "overview"
          ? "This tab was reached with replace, so Back still leaves the guide instead of walking through tab changes."
          : "Examples are another route value owned entirely by this demo host."}
      </p>
      <div className="grid gap-2">
        {guide.topics.map((topic) => (
          <button
            key={topic.id}
            type="button"
            className="flex items-center gap-3 rounded-lg border px-3 py-2.5 text-left text-sm transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            onClick={() => onOpenTopic(topic.id)}
          >
            <FileTextIcon className="size-4 text-muted-foreground" />
            {topic.title}
          </button>
        ))}
      </div>
    </div>
  );
}

function TopicView({
  route,
}: {
  route: Extract<DemoRoute, { kind: "topic" }>;
}) {
  const guide = guideById(route.guideId);
  const topic =
    guide.topics.find((candidate) => candidate.id === route.topicId) ??
    guide.topics[0];
  return (
    <article className="max-w-xl">
      <p className="text-xs font-medium text-muted-foreground">{guide.title}</p>
      <h3 className="mt-1 text-lg font-semibold">{topic.title}</h3>
      <p className="mt-3 text-sm leading-6 text-muted-foreground">
        This is a second nested view. Use Back to return to the guide, including
        its selected tab and entry-local note.
      </p>
    </article>
  );
}

function ContractCard({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="rounded-lg border p-4">
      <code className="text-sm font-semibold">{title}</code>
      <p className="mt-2 text-sm leading-6 text-muted-foreground">
        {description}
      </p>
    </div>
  );
}

function guideRoute(guideId: GuideId): DemoRoute {
  return { kind: "guide", guideId, tab: "overview" };
}

function guideById(guideId: GuideId): Guide {
  return GUIDES.find((guide) => guide.id === guideId) ?? GUIDES[0];
}

function routeTitle(route: DemoRoute): string {
  switch (route.kind) {
    case "guides":
      return "Guides";
    case "guide":
      return guideById(route.guideId).title;
    case "topic": {
      const guide = guideById(route.guideId);
      return (
        guide.topics.find((topic) => topic.id === route.topicId)?.title ??
        "Topic"
      );
    }
  }
}
