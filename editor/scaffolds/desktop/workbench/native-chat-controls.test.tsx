import type { ComponentProps, ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NativeChatHeader, NativeModelPicker } from "./native-chat-controls";
import type { DesktopNativeChat } from "@grida/desktop-bridge";
import { NativeChatController } from "@/lib/agent-chat/native-chat-controller";

const settings = vi.hoisted(() => ({
  supported: true,
  open: vi.fn<() => Promise<void>>(),
}));
const commands = vi.hoisted(() => new Map<string, (value: string) => void>());

vi.mock("@/lib/desktop/bridge", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/desktop/bridge")>();
  return {
    ...actual,
    app: { ...actual.app, openSettings: settings.open },
    useDesktopBridge: () => ({
      window: { open_settings: settings.supported ? settings.open : undefined },
    }),
  };
});

vi.mock("@app/ui/components/command", async (importOriginal) => {
  const actual =
    await importOriginal<typeof import("@app/ui/components/command")>();
  return {
    ...actual,
    CommandItem: (props: ComponentProps<typeof actual.CommandItem>) => {
      if (props.value && props.onSelect)
        commands.set(props.value, props.onSelect);
      return <actual.CommandItem {...props} />;
    },
  };
});

const slider = vi.hoisted(() => ({
  change: undefined as ((value: number[]) => void) | undefined,
}));
const popover = vi.hoisted(() => ({
  change: undefined as ((open: boolean) => void) | undefined,
}));

vi.mock("@app/ui/components/popover", () => {
  const Container = ({ children }: { children?: ReactNode }) => <>{children}</>;
  return {
    Popover: ({
      children,
      onOpenChange,
    }: {
      children?: ReactNode;
      onOpenChange: (open: boolean) => void;
    }) => {
      popover.change = onOpenChange;
      return <>{children}</>;
    },
    PopoverContent: Container,
    PopoverTrigger: Container,
  };
});

vi.mock("./native-effort-slider", () => ({
  NativeEffortSlider: ({
    onValueChange,
  }: {
    onValueChange: (value: number) => void;
  }) => {
    slider.change = ([value]) => onValueChange(value);
    return <span role="slider" aria-label="Effort" />;
  },
}));

beforeEach(() => {
  settings.supported = true;
  settings.open.mockReset().mockResolvedValue();
  commands.clear();
  slider.change = undefined;
  popover.change = undefined;
});

it("refreshes the active chat picker so chats restored in Settings appear", () => {
  const controller = new NativeChatController({} as DesktopNativeChat);
  const refresh = vi.spyOn(controller, "listChats").mockResolvedValue();
  const html = renderToStaticMarkup(
    <NativeChatHeader controller={controller} state={controller.read()} />
  );
  popover.change!(true);
  expect(refresh).toHaveBeenCalledExactlyOnceWith(null, false);
  expect(html).not.toContain("Archived chats");
  expect(html).not.toContain("Lifecycle checks");
});

it("groups the list by local activity date and keeps chat activity indicators", () => {
  const controller = new NativeChatController({} as DesktopNativeChat);
  vi.spyOn(controller, "chatTitle").mockImplementation((id) => id);
  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(today.getDate() - 1);
  const dates: Record<string, number> = {
    "running-chat": today.getTime(),
    "input-chat": yesterday.getTime(),
    "earlier-chat": 0,
  };
  vi.spyOn(controller, "chatLastActivityAtMs").mockImplementation(
    (id) => dates[id]
  );
  const html = renderToStaticMarkup(
    <NativeChatHeader
      controller={controller}
      state={{
        ...controller.read(),
        selected: "running-chat",
        sessions: [
          "earlier-chat",
          "undated-chat",
          "running-chat",
          "input-chat",
        ],
        runningSessionIds: ["running-chat"],
        inputNeededSessionIds: ["input-chat"],
        observation: {
          observationId: "running-observation",
          snapshot: {
            sessionId: "running-chat",
            sessionRevision: 0,
            queuedInputs: 0,
            admissionPaused: false,
            current: {
              turnId: "running-turn",
              epoch: 0,
              journalPosition: 0,
              historyPosition: 0,
              controlRevision: 0,
              paused: false,
              cancelled: false,
              disposition: "running",
              inputNeeded: true,
              status: null,
            },
            latest: null,
          },
        },
      }}
    />
  );
  expect(html).not.toMatch(/<time\b/);
  expect(html).toMatch(
    />Today<.*>running-chat<.*>Yesterday<.*>input-chat<.*>Earlier<.*>earlier-chat<.*>Undated<.*>undated-chat</
  );
  expect(html.match(/aria-label="Running"/g)).toHaveLength(1);
  expect(html.match(/>Input needed</g)).toHaveLength(2);
  expect(html.match(/aria-current="true"/g)).toHaveLength(1);
});

describe("chat options availability", () => {
  it.each([null, "new-chat-session"])(
    "hides the empty menu before chat details exist (selected: %s)",
    (selected) => {
      const controller = new NativeChatController({} as DesktopNativeChat);
      const html = renderToStaticMarkup(
        <NativeChatHeader
          controller={controller}
          state={{ ...controller.read(), selected }}
        />
      );
      expect(html).not.toContain('aria-label="Chat options"');
      expect(html).toContain('aria-label="New chat"');
      expect(html).toContain('aria-label="Open chat list"');
    }
  );

  it.each([null, "Saved chat"])(
    "keeps options for saved chats with title %s",
    (title) => {
      const controller = new NativeChatController({} as DesktopNativeChat);
      const html = renderToStaticMarkup(
        <NativeChatHeader
          controller={controller}
          state={{
            ...controller.read(),
            selected: "saved-chat",
            catalogEntry: {
              sessionId: "saved-chat",
              title,
              archived: false,
              revision: 1,
            },
          }}
        />
      );
      expect(html).toContain('aria-label="Chat options"');
    }
  );

  it("keeps the menu available to retry failed chat details", () => {
    const controller = new NativeChatController({} as DesktopNativeChat);
    const html = renderToStaticMarkup(
      <NativeChatHeader
        controller={controller}
        state={{
          ...controller.read(),
          selected: "saved-chat",
          catalogEntryError: "Couldn't load the chat details.",
        }}
      />
    );
    expect(html).toContain('aria-label="Chat options"');
  });
});

describe("native model catalogue refresh", () => {
  const profiles = {
    active: null,
    choices: [
      { id: "a".repeat(64), connection: "Provider", model: "Text model" },
    ],
    saved: [],
  };

  it("reloads a direct model picker on opening without a permanent refresh action", () => {
    const refresh = vi.fn<() => void>();
    const html = renderToStaticMarkup(
      <NativeModelPicker
        profiles={profiles}
        busy={false}
        onSelect={() => {}}
        onRefresh={refresh}
      />
    );
    expect(refresh).not.toHaveBeenCalled();
    popover.change!(true);
    expect(refresh).toHaveBeenCalledTimes(1);
    popover.change!(false);
    expect(refresh).toHaveBeenCalledTimes(1);
    expect(html).not.toContain("Refresh models");
    expect(html).not.toContain(">Retry<");
  });

  it("opening effort settings does not reload the model catalogue", () => {
    const refresh = vi.fn<() => void>();
    const html = renderToStaticMarkup(
      <NativeModelPicker
        profiles={profiles}
        busy={false}
        onSelect={() => {}}
        onRefresh={refresh}
        onEffort={() => {}}
        refreshError="Model connections unavailable."
      />
    );
    popover.change!(true);
    expect(refresh).not.toHaveBeenCalled();
    expect(html).not.toContain("Model connections unavailable.");
    expect(html).not.toContain(">Retry<");
  });

  it("keeps previous choices and shows retry only when reloading the model list fails", () => {
    const html = renderToStaticMarkup(
      <NativeModelPicker
        profiles={profiles}
        busy={false}
        onSelect={() => {}}
        onRefresh={() => {}}
        refreshError="Model connections unavailable."
      />
    );
    expect(html).toContain("Text model");
    expect(html).toContain("Model connections unavailable.");
    expect(html).toContain(">Retry<");
    expect(html).not.toContain("Refresh models");
  });
});

describe("native model shortlist", () => {
  const choices = [
    ...Array.from({ length: 8 }, (_, index) => ({
      id: `subscription-${index}`,
      connection: "ChatGPT Subscription",
      model: `Subscription model ${index}`,
    })),
    { id: "other", connection: "Other provider", model: "Other model" },
  ];

  it("opens the native Settings window from Manage models", () => {
    renderToStaticMarkup(
      <NativeModelPicker
        profiles={{ active: null, choices, saved: [] }}
        busy={false}
        onSelect={() => {}}
        onRefresh={() => {}}
      />
    );
    commands.get("Manage models")!("Manage models");
    expect(settings.open).toHaveBeenCalledExactlyOnceWith();
  });

  it("withholds Manage models on older native hosts", () => {
    settings.supported = false;
    const html = renderToStaticMarkup(
      <NativeModelPicker
        profiles={{ active: null, choices, saved: [] }}
        busy={false}
        onSelect={() => {}}
        onRefresh={() => {}}
      />
    );
    expect(html).not.toContain("Manage models");
    expect(commands.has("Manage models")).toBe(false);
  });

  it("handles a native Settings request rejection without an unhandled error", async () => {
    settings.open.mockRejectedValueOnce(new Error("No handler registered"));
    renderToStaticMarkup(
      <NativeModelPicker
        profiles={{ active: null, choices, saved: [] }}
        busy={false}
        onSelect={() => {}}
        onRefresh={() => {}}
      />
    );
    commands.get("Manage models")!("Manage models");
    await Promise.resolve();
    expect(settings.open).toHaveBeenCalledExactlyOnceWith();
  });

  it.each([0, 7])(
    "keeps the selected model in a five-model connection shortlist (%s)",
    (active) => {
      const html = renderToStaticMarkup(
        <NativeModelPicker
          profiles={{ active: choices[active].id, choices, saved: [] }}
          busy={false}
          onSelect={() => {}}
          onRefresh={() => {}}
        />
      );
      expect(html).toContain(`Subscription model ${active}`);
      expect(html).toContain("Subscription model 0");
      expect(html).not.toContain("Subscription model 5");
      expect(html).not.toContain("Other model");
      expect(html).not.toContain("Recommended model");
      expect(html.match(/data-slot="command-item"/g)).toHaveLength(6);
      expect(html).toContain("Show all models");
      expect(html).not.toContain("Manage models");
      expect(html).toContain("Search all models");
    }
  );

  it("shows the full catalogue when the current connection is unknown", () => {
    const html = renderToStaticMarkup(
      <NativeModelPicker
        profiles={{ active: null, choices, saved: [] }}
        busy={false}
        onSelect={() => {}}
        onRefresh={() => {}}
      />
    );
    expect(html).toContain("Other model");
    expect(html).toContain("Subscription model 7");
    expect(html).toContain("Recommended model");
    expect(html).not.toContain("Show all models");
    expect(html).toContain("Manage models");
    expect(html).not.toContain("Show fewer models");
  });

  it("keeps an unavailable saved selection visible without mixing connections", () => {
    const html = renderToStaticMarkup(
      <NativeModelPicker
        profiles={{
          active: "retired",
          choices,
          saved: [
            {
              id: "retired",
              connection: "ChatGPT Subscription",
              model: "Retired model",
              available: false,
            },
          ],
        }}
        busy={false}
        onSelect={() => {}}
        onRefresh={() => {}}
      />
    );
    expect(html).toContain("Retired model");
    expect(html).toContain("Unavailable");
    expect(html).not.toContain("Other model");
    expect(html.match(/data-slot="command-item"/g)).toHaveLength(6);
  });

  it("groups the full catalogue by connection, including unavailable saved models", () => {
    const html = renderToStaticMarkup(
      <NativeModelPicker
        profiles={{
          active: null,
          choices: [
            { id: "one-a", connection: "Provider One", model: "First model" },
            { id: "two-a", connection: "Provider Two", model: "Second model" },
            { id: "one-b", connection: "Provider One", model: "Third model" },
          ],
          saved: [
            {
              id: "two-old",
              connection: "Provider Two",
              model: "Old model",
              available: false,
            },
          ],
        }}
        busy={false}
        onSelect={() => {}}
        onRefresh={() => {}}
      />
    );
    expect(html).toMatch(/cmdk-group-heading[^>]*>Provider One</);
    expect(html).toMatch(/cmdk-group-heading[^>]*>Provider Two</);
    expect(html.indexOf("First model")).toBeLessThan(
      html.indexOf("Third model")
    );
    expect(html.indexOf("Third model")).toBeLessThan(
      html.indexOf("Second model")
    );
    expect(html.indexOf("Second model")).toBeLessThan(
      html.indexOf("Old model")
    );
    expect(html).toContain("Unavailable");
    expect(html).toContain("Recommended model");
  });
});

describe("native model effort picker", () => {
  const id = "a".repeat(64);

  it.each(["standard", "medium", "high"] as const)(
    "shows Reset only away from the default effort (%s)",
    (effort) => {
      const html = renderToStaticMarkup(
        <NativeModelPicker
          profiles={{ active: null, choices: [], saved: [] }}
          busy={false}
          onRefresh={() => {}}
          effort={effort}
          onEffort={() => {}}
        />
      );
      expect(html.includes('aria-label="Reset effort"')).toBe(
        effort === "high"
      );
    }
  );

  it.each(["ChatGPT Subscription", "Custom endpoint", "Own provider key"])(
    "offers harness Ultra for %s without requiring a model reasoning setting",
    (connection) => {
      const choose = vi.fn<(effort: string) => void>();
      const html = renderToStaticMarkup(
        <NativeModelPicker
          profiles={{
            active: id,
            choices: [{ id, connection, model: "Text model", ultra: true }],
            saved: [],
          }}
          busy={false}
          onRefresh={() => {}}
          effort="medium"
          onEffort={choose}
          ultraAvailable
        />
      );
      slider.change!([4]);
      expect(choose).toHaveBeenCalledExactlyOnceWith("ultra");
      expect(html).toContain("This model uses its own reasoning level.");
      expect(html).toContain("Ultra still extends the work.");
      expect(html).not.toContain("Ultra needs");
      expect(html).not.toContain("Choose a model to use Ultra.");
    }
  );

  it("honors a negotiated harness refusal over optimistic catalogue metadata", () => {
    const choose = vi.fn<(effort: string) => void>();
    const html = renderToStaticMarkup(
      <NativeModelPicker
        profiles={{
          active: id,
          choices: [
            { id, connection: "Any connection", model: "Text", ultra: true },
          ],
          saved: [],
        }}
        busy={false}
        onRefresh={() => {}}
        effort="medium"
        onEffort={choose}
        ultraAvailable={false}
      />
    );
    slider.change!([4]);
    expect(choose).not.toHaveBeenCalled();
    slider.change!([3]);
    expect(choose).toHaveBeenCalledExactlyOnceWith("xhigh");
    expect(html).not.toContain("Ultra needs");
  });

  it("keeps the contextual no-delegation limit independent of the connection", () => {
    const choose = vi.fn<(effort: string) => void>();
    const html = renderToStaticMarkup(
      <NativeModelPicker
        profiles={{ active: null, choices: [], saved: [] }}
        busy={false}
        onRefresh={() => {}}
        effort="medium"
        onEffort={choose}
        ultraAvailable
        ultraOffered={false}
      />
    );
    slider.change!([4]);
    expect(choose).not.toHaveBeenCalled();
    expect(html).not.toContain(">Ultra<");
  });
});
